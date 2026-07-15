import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  reserveChatRequest: vi.fn(),
  completeChatRequest: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/chat-usage-store", () => ({
  reserveChatRequest: mocks.reserveChatRequest,
  completeChatRequest: mocks.completeChatRequest,
}));

import { POST } from "@/app/api/chat/route";

function chatRequest(messages: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ messages, observer: null }),
  });
}

describe("protected chat route", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.createClient.mockReset();
    mocks.reserveChatRequest.mockReset();
    mocks.completeChatRequest.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects oversized requests before auth or model work", async () => {
    const response = await POST(chatRequest([], { "content-length": String(65 * 1024) }));
    expect(response.status).toBe(413);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires a validated Supabase user", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { name: "AuthSessionMissingError" },
        }),
      },
    });

    const response = await POST(
      chatRequest([{ id: "1", role: "user", parts: [{ type: "text", text: "M42" }] }]),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "authentication_required" },
    });
  });

  it("fails closed when Supabase cannot validate the user", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("upstream unavailable"),
        }),
      },
    });

    const response = await POST(
      chatRequest([{ id: "1", role: "user", parts: [{ type: "text", text: "M42" }] }]),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "auth_unavailable" } });
  });

  it("returns a bounded per-user quota response before model work", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    });
    mocks.reserveChatRequest.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      reason: "minute_limit",
    });

    const response = await POST(
      chatRequest([{ id: "1", role: "user", parts: [{ type: "text", text: "M42" }] }]),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "rate_limited" } });
  });
});
