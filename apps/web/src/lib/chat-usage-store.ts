import type { UsageAccumulator } from "@/lib/chat-usage";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type UsageSnapshot = ReturnType<UsageAccumulator["snapshot"]>;
type CompletionStatus = "completed" | "failed" | "timed_out";

export type ChatReservation =
  | { allowed: true; eventId: string; completionToken: string }
  | { allowed: false; retryAfterSeconds: number; reason: string };

function positiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function reserveChatRequest(
  supabase: ServerSupabaseClient,
): Promise<ChatReservation> {
  const { data, error } = await supabase.rpc("reserve_chat_request", {
    p_max_per_minute: positiveIntegerEnv("CHAT_REQUESTS_PER_MINUTE", 6),
    p_max_per_day: positiveIntegerEnv("CHAT_REQUESTS_PER_DAY", 100),
  });
  if (error) throw new Error("chat_usage_store_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        allowed?: boolean;
        event_id?: string | null;
        completion_token?: string | null;
        retry_after_seconds?: number;
        reason?: string | null;
      }
    | null;
  if (row?.allowed && row.event_id && row.completion_token) {
    return {
      allowed: true,
      eventId: row.event_id,
      completionToken: row.completion_token,
    };
  }
  if (row && row.allowed === false) {
    return {
      allowed: false,
      retryAfterSeconds: row.retry_after_seconds ?? 60,
      reason: row.reason ?? "rate_limit",
    };
  }
  throw new Error("chat_usage_store_invalid_response");
}

export async function completeChatRequest(
  supabase: ServerSupabaseClient,
  eventId: string,
  completionToken: string,
  status: CompletionStatus,
  usage: UsageSnapshot,
  durationMs: number,
  failureReason: string | null,
): Promise<void> {
  const forOperation = (operation: "chat" | "embedding" | "rerank") =>
    usage.breakdown.filter((record) => record.operation === operation);
  const sum = (records: typeof usage.breakdown, field: "input_tokens" | "output_tokens") =>
    records.reduce((total, record) => total + record[field], 0);
  const chat = forOperation("chat");
  const embedding = forOperation("embedding");
  const rerank = forOperation("rerank");
  const rerankBackend = rerank.some((record) => record.provider === "cohere")
    ? "cohere"
    : rerank.some((record) => record.provider === "local")
      ? "bge"
      : rerank.length > 0
        ? "llm"
        : null;
  const cohereSearchUnits = rerank.reduce(
    (total, record) => total + (record.billing_units?.search_units ?? 0),
    0,
  );
  const { error } = await supabase.rpc("complete_chat_request", {
    p_event_id: eventId,
    p_completion_token: completionToken,
    p_status: status,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_total_tokens: usage.totalTokens,
    p_chat_input_tokens: sum(chat, "input_tokens"),
    p_chat_output_tokens: sum(chat, "output_tokens"),
    p_embedding_tokens: sum(embedding, "input_tokens"),
    p_rerank_input_tokens: sum(rerank, "input_tokens"),
    p_rerank_output_tokens: sum(rerank, "output_tokens"),
    p_rerank_backend: rerankBackend,
    p_cohere_search_units: cohereSearchUnits,
    p_estimated_cost_usd: usage.estimatedCostUsd,
    p_duration_ms: Math.max(0, Math.round(durationMs)),
    p_failure_reason: failureReason,
  });
  if (error) throw new Error("chat_usage_store_unavailable");
}
