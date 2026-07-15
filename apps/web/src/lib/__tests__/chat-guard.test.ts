import { describe, expect, it } from "vitest";

import {
  assertChatContentLength,
  ChatRequestError,
  enforceChatMessageLimits,
  readChatJson,
} from "@/lib/chat-guard";

describe("chat request limits", () => {
  it("rejects an oversized content-length before reading the body", () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-length": String(65 * 1024) },
      body: "{}",
    });
    expect(() => assertChatContentLength(request)).toThrowError(ChatRequestError);
  });

  it("also bounds chunked or inaccurate request bodies after reading", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [], padding: "x".repeat(65 * 1024) }),
    });
    await expect(readChatJson(request)).rejects.toMatchObject({
      status: 413,
      code: "request_too_large",
    });
  });

  it("bounds per-message and conversation text without inspecting tool payloads", () => {
    expect(() =>
      enforceChatMessageLimits([
        { role: "user", parts: [{ type: "text", text: "x".repeat(4_001) }] },
      ]),
    ).toThrowError(/text-size limit/);

    expect(() =>
      enforceChatMessageLimits(
        Array.from({ length: 4 }, (_, index) => ({
          id: String(index),
          role: "user",
          parts: [{ type: "text", text: "x".repeat(3_100) }],
        })),
      ),
    ).toThrowError(/conversation exceeds/);
  });
});
