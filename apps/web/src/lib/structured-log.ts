type ChatLog = {
  event: "chat_request" | "chat_step" | "chat_tool";
  request_id: string;
  status: "started" | "completed" | "failed" | "timed_out" | "rejected";
  duration_ms?: number;
  step?: number;
  tool?: string;
  finish_reason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
  failure_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
};

/** Emit content-free JSON logs. Never pass prompt text, tool inputs/outputs, or secrets. */
export function logChatEvent(event: ChatLog): void {
  console.info(JSON.stringify(event));
}

export function safeFailureReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "aborted";
  if (error instanceof Error) {
    if (/timeout/i.test(error.name)) return "timeout";
    if (/auth/i.test(error.name)) return "authentication_error";
  }
  return "provider_or_tool_error";
}
