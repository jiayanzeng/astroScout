import type { ChatMessage } from "@/lib/ai";

export const CHAT_HISTORY_KEY = "astroscout.chat-history.v1";
const CHAT_HISTORY_VERSION = 1;
const MAX_PERSISTED_MESSAGES = 24;
const MAX_PERSISTED_TEXT_CHARS = 12_000;

type PersistedTextMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

type PersistedChatHistory = {
  version: 1;
  messages: PersistedTextMessage[];
};

function parseHistory(value: unknown): PersistedChatHistory | null {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) {
    return null;
  }
  if (!("messages" in value) || !Array.isArray(value.messages)) return null;
  if (value.messages.length > MAX_PERSISTED_MESSAGES) return null;

  let totalChars = 0;
  const messages: PersistedTextMessage[] = [];
  for (const candidate of value.messages) {
    if (!candidate || typeof candidate !== "object") return null;
    if (!("id" in candidate) || typeof candidate.id !== "string") return null;
    if (
      !("role" in candidate) ||
      typeof candidate.role !== "string" ||
      !["user", "assistant"].includes(candidate.role)
    ) {
      return null;
    }
    if (!("parts" in candidate) || !Array.isArray(candidate.parts)) return null;
    const parts: { type: "text"; text: string }[] = [];
    for (const part of candidate.parts) {
      if (
        !part ||
        typeof part !== "object" ||
        !("type" in part) ||
        part.type !== "text" ||
        !("text" in part) ||
        typeof part.text !== "string"
      ) {
        return null;
      }
      totalChars += part.text.length;
      if (totalChars > MAX_PERSISTED_TEXT_CHARS) return null;
      parts.push({ type: "text", text: part.text });
    }
    if (parts.length > 0) {
      messages.push({
        id: candidate.id,
        role: candidate.role as "user" | "assistant",
        parts,
      });
    }
  }
  return { version: CHAT_HISTORY_VERSION, messages };
}

export function readChatHistory(storage: Storage): ChatMessage[] {
  const raw = storage.getItem(CHAT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const history = parseHistory(JSON.parse(raw) as unknown);
    if (!history) {
      storage.removeItem(CHAT_HISTORY_KEY);
      return [];
    }
    return history.messages as ChatMessage[];
  } catch {
    storage.removeItem(CHAT_HISTORY_KEY);
    return [];
  }
}

export function writeChatHistory(storage: Storage, messages: ChatMessage[]): void {
  let totalChars = 0;
  const textOnly = messages
    .slice(-MAX_PERSISTED_MESSAGES)
    .reverse()
    .map((message): PersistedTextMessage | null => {
      if (message.role !== "user" && message.role !== "assistant") return null;
      const parts = message.parts.flatMap((part) => {
        if (part.type !== "text" || !part.text) return [];
        const remaining = Math.max(0, MAX_PERSISTED_TEXT_CHARS - totalChars);
        if (remaining === 0) return [];
        const text = part.text.slice(0, remaining);
        totalChars += text.length;
        return [{ type: "text" as const, text }];
      });
      return parts.length > 0 ? { id: message.id, role: message.role, parts } : null;
    })
    .filter((message): message is PersistedTextMessage => message !== null)
    .reverse();

  if (textOnly.length === 0) {
    storage.removeItem(CHAT_HISTORY_KEY);
    return;
  }

  storage.setItem(
    CHAT_HISTORY_KEY,
    JSON.stringify({ version: CHAT_HISTORY_VERSION, messages: textOnly }),
  );
}

export function clearChatHistory(storage: Storage): void {
  storage.removeItem(CHAT_HISTORY_KEY);
}
