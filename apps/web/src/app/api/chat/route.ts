import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
} from "ai";

import { createChatTools, type ChatMessage } from "@/lib/ai";
import {
  baseSystemPrompt,
  classifyChatIntent,
  createPrepareStep,
} from "@/lib/chat-policy";
import { enforceGroundedScienceStream } from "@/lib/grounded-response";
import { optionalObserverContextSchema } from "@/lib/observer-context";
import {
  assertChatContentLength,
  ChatRequestError,
  enforceChatMessageLimits,
  readChatJson,
} from "@/lib/chat-guard";
import { openAIUsage, UsageAccumulator } from "@/lib/chat-usage";
import { completeChatRequest, reserveChatRequest } from "@/lib/chat-usage-store";
import { logChatEvent, safeFailureReason } from "@/lib/structured-log";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function latestUserText(messages: ChatMessage[]): string {
  const message = [...messages].reverse().find((candidate) => candidate.role === "user");
  return (
    message?.parts
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n") ?? ""
  );
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  logChatEvent({ event: "chat_request", request_id: requestId, status: "started" });

  try {
    assertChatContentLength(req);
  } catch (error) {
    if (error instanceof ChatRequestError) {
      logChatEvent({
        event: "chat_request",
        request_id: requestId,
        status: "rejected",
        failure_reason: error.code,
      });
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  try {
    supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    if (authResult.error && authResult.error.name !== "AuthSessionMissingError") {
      throw new Error("authentication_service_unavailable");
    }
    user = authResult.data.user;
  } catch {
    logChatEvent({
      event: "chat_request",
      request_id: requestId,
      status: "failed",
      failure_reason: "authentication_service_unavailable",
    });
    return Response.json(
      { error: { code: "auth_unavailable", message: "Authentication is temporarily unavailable." } },
      { status: 503 },
    );
  }
  if (!user) {
    logChatEvent({
      event: "chat_request",
      request_id: requestId,
      status: "rejected",
      failure_reason: "authentication_required",
    });
    return Response.json(
      {
        error: {
          code: "authentication_required",
          message: "Sign in to use AstroScout chat.",
        },
      },
      { status: 401 },
    );
  }

  let body: { messages?: unknown; observer?: unknown };
  try {
    const rawBody = await readChatJson(req);
    body = (rawBody ?? {}) as { messages?: unknown; observer?: unknown };
    enforceChatMessageLimits(body.messages);
  } catch (error) {
    if (error instanceof ChatRequestError) {
      logChatEvent({
        event: "chat_request",
        request_id: requestId,
        status: "rejected",
        failure_reason: error.code,
      });
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  const observerResult = optionalObserverContextSchema.safeParse(body.observer);
  if (!observerResult.success) {
    return Response.json(
      { error: { code: "invalid_observer", message: "invalid observer context" } },
      { status: 400 },
    );
  }

  const observer = observerResult.data;
  const usage = new UsageAccumulator();
  const tools = createChatTools(observer, undefined, usage.record);
  const validated = await safeValidateUIMessages<ChatMessage>({
    messages: body.messages,
    tools,
  });
  if (!validated.success) {
    return Response.json(
      { error: { code: "invalid_messages", message: "messages are invalid" } },
      { status: 400 },
    );
  }

  let reservation;
  try {
    reservation = await reserveChatRequest(supabase);
  } catch {
    logChatEvent({
      event: "chat_request",
      request_id: requestId,
      status: "failed",
      failure_reason: "usage_store_unavailable",
    });
    return Response.json(
      { error: { code: "usage_store_unavailable", message: "Chat is temporarily unavailable." } },
      { status: 503 },
    );
  }
  if (!reservation.allowed) {
    logChatEvent({
      event: "chat_request",
      request_id: requestId,
      status: "rejected",
      failure_reason: reservation.reason,
    });
    return Response.json(
      { error: { code: "rate_limited", message: "Chat rate limit reached; retry later." } },
      { status: 429, headers: { "Retry-After": String(reservation.retryAfterSeconds) } },
    );
  }

  const messages = validated.data;
  const intent = classifyChatIntent(latestUserText(messages));
  let step = 0;
  let stepStartedAt = performance.now();
  let finalized = false;
  const finishUsage = async (
    status: "completed" | "failed" | "timed_out",
    failureReason: string | null,
  ) => {
    if (finalized) return;
    finalized = true;
    const snapshot = usage.snapshot();
    try {
      await completeChatRequest(
        supabase,
        reservation.eventId,
        reservation.completionToken,
        status,
        snapshot,
        performance.now() - startedAt,
        failureReason,
      );
    } catch {
      logChatEvent({
        event: "chat_request",
        request_id: requestId,
        status: "failed",
        failure_reason: "usage_store_unavailable",
      });
    }
    logChatEvent({
      event: "chat_request",
      request_id: requestId,
      status,
      duration_ms: Math.round(performance.now() - startedAt),
      failure_reason: failureReason ?? undefined,
      input_tokens: snapshot.inputTokens,
      output_tokens: snapshot.outputTokens,
      estimated_cost_usd: snapshot.estimatedCostUsd,
    });
  };

  let result;
  try {
    result = streamText({
      // Multi-step tool loops must not depend on relay-persisted Responses item IDs.
      model: openai.chat("gpt-4o-mini"),
      system: baseSystemPrompt(observer),
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(6),
      tools,
      prepareStep: createPrepareStep(intent, observer),
      maxOutputTokens: 800,
      maxRetries: 0,
      timeout: { totalMs: 55_000, stepMs: 18_000, chunkMs: 15_000 },
      abortSignal: req.signal,
      experimental_onStepStart: ({ stepNumber }) => {
        step = stepNumber;
        stepStartedAt = performance.now();
      },
      onStepFinish: ({ finishReason }) => {
        logChatEvent({
          event: "chat_step",
          request_id: requestId,
          status: finishReason === "error" ? "failed" : "completed",
          step,
          duration_ms: Math.round(performance.now() - stepStartedAt),
          finish_reason: finishReason,
          failure_reason: finishReason === "error" ? "provider_step_error" : undefined,
        });
      },
      experimental_onToolCallFinish: ({ toolCall, durationMs, success }) => {
        logChatEvent({
          event: "chat_tool",
          request_id: requestId,
          status: success ? "completed" : "failed",
          tool: toolCall.toolName,
          duration_ms: Math.round(durationMs),
          failure_reason: success ? undefined : "tool_error",
        });
      },
      onFinish: async ({ totalUsage }) => {
        usage.record(
          openAIUsage(
            "gpt-4o-mini",
            "chat",
            totalUsage.inputTokens,
            totalUsage.outputTokens,
          ),
        );
        await finishUsage("completed", null);
      },
      onError: async ({ error }) => {
        await finishUsage("failed", safeFailureReason(error));
      },
      onAbort: async () => {
        await finishUsage("timed_out", "aborted_or_timed_out");
      },
    });
  } catch (error) {
    await finishUsage("failed", safeFailureReason(error));
    return Response.json(
      { error: { code: "chat_start_failed", message: "Chat could not be started." } },
      { status: 502 },
    );
  }

  if (intent.science) {
    return createUIMessageStreamResponse({
      stream: enforceGroundedScienceStream(result.toUIMessageStream()),
    });
  }
  return result.toUIMessageStreamResponse();
}
