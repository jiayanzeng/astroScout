import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@/lib/ai";
import {
  CHAT_HISTORY_KEY,
  clearChatHistory,
  readChatHistory,
  writeChatHistory,
} from "@/lib/chat-persistence";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("versioned local chat persistence", () => {
  it("restores text after a simulated navigation or reload", () => {
    const storage = new MemoryStorage();
    const messages = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Plan M42" }] },
      { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "Saved reply" }] },
    ] as ChatMessage[];

    writeChatHistory(storage, messages);

    expect(readChatHistory(storage)).toEqual(messages);
  });

  it("never persists tool inputs or outputs", () => {
    const storage = new MemoryStorage();
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Visible summary" },
          {
            type: "tool-searchKnowledge",
            state: "output-available",
            toolCallId: "secret-tool-call",
            input: { query: "private query" },
            output: { passages: [{ content: "private payload" }] },
          },
        ],
      },
    ] as unknown as ChatMessage[];

    writeChatHistory(storage, messages);

    const raw = storage.getItem(CHAT_HISTORY_KEY) ?? "";
    expect(raw).toContain("Visible summary");
    expect(raw).not.toContain("private query");
    expect(raw).not.toContain("private payload");
    expect(readChatHistory(storage)[0]?.parts).toEqual([
      { type: "text", text: "Visible summary" },
    ]);
  });

  it("rejects unknown versions and supports an explicit clear action", () => {
    const storage = new MemoryStorage();
    storage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ version: 2, messages: [] }));
    expect(readChatHistory(storage)).toEqual([]);
    expect(storage.getItem(CHAT_HISTORY_KEY)).toBeNull();

    writeChatHistory(storage, [
      { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] },
    ] as ChatMessage[]);
    clearChatHistory(storage);
    expect(readChatHistory(storage)).toEqual([]);
  });
});
