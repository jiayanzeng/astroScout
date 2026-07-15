import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
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

export const maxDuration = 30;

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
  const body = (await req.json()) as { messages?: ChatMessage[]; observer?: unknown };
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }
  const observerResult = optionalObserverContextSchema.safeParse(body.observer);
  if (!observerResult.success) {
    return Response.json({ error: "invalid observer context" }, { status: 400 });
  }

  const observer = observerResult.data;
  const tools = createChatTools(observer);
  const intent = classifyChatIntent(latestUserText(body.messages));

  const result = streamText({
    // Multi-step tool loops must not depend on relay-persisted Responses item IDs.
    model: openai.chat("gpt-4o-mini"),
    system: baseSystemPrompt(observer),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(6),
    tools,
    prepareStep: createPrepareStep(intent, observer),
  });

  if (intent.science) {
    return createUIMessageStreamResponse({
      stream: enforceGroundedScienceStream(result.toUIMessageStream()),
    });
  }
  return result.toUIMessageStreamResponse();
}
