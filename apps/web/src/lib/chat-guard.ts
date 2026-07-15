export const CHAT_REQUEST_LIMITS = {
  maxRequestBytes: 64 * 1024,
  maxMessages: 24,
  maxTextCharsPerMessage: 4_000,
  maxTextCharsTotal: 12_000,
} as const;

export class ChatRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

export function assertChatContentLength(request: Request): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const contentLength = Number(raw);
  if (Number.isFinite(contentLength) && contentLength > CHAT_REQUEST_LIMITS.maxRequestBytes) {
    throw new ChatRequestError(413, "request_too_large", "Chat request is too large.");
  }
}

export async function readChatJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > CHAT_REQUEST_LIMITS.maxRequestBytes) {
    throw new ChatRequestError(413, "request_too_large", "Chat request is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ChatRequestError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function enforceChatMessageLimits(messages: unknown): void {
  if (!Array.isArray(messages)) {
    throw new ChatRequestError(400, "messages_required", "messages are required");
  }
  if (messages.length === 0 || messages.length > CHAT_REQUEST_LIMITS.maxMessages) {
    throw new ChatRequestError(
      400,
      "message_count_invalid",
      `Chat requests must contain 1–${CHAT_REQUEST_LIMITS.maxMessages} messages.`,
    );
  }

  let totalTextChars = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const parts = "parts" in message ? message.parts : undefined;
    if (!Array.isArray(parts)) continue;
    let messageTextChars = 0;
    for (const part of parts) {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        messageTextChars += part.text.length;
      }
    }
    if (messageTextChars > CHAT_REQUEST_LIMITS.maxTextCharsPerMessage) {
      throw new ChatRequestError(
        413,
        "message_too_large",
        "A chat message exceeds the text-size limit.",
      );
    }
    totalTextChars += messageTextChars;
  }

  if (totalTextChars > CHAT_REQUEST_LIMITS.maxTextCharsTotal) {
    throw new ChatRequestError(
      413,
      "conversation_too_large",
      "The conversation exceeds the text-size limit; clear it and retry.",
    );
  }
}
