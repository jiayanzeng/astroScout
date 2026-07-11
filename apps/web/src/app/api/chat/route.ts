import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

import { tools, type ChatMessage } from "@/lib/ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  const result = streamText({
    // Multi-step tool loops must not depend on relay-persisted Responses item IDs.
    model: openai.chat("gpt-4o-mini"),
    system:
      "You are AstroScout, an astronomy observation-planning copilot for amateur " +
      "astronomers. Decide what deep-sky objects are worth observing tonight and " +
      "explain the underlying astronomy. Ground every recommendation in real data: " +
      "use planNight to rank targets and getTargetDetail for a specific object. " +
      "When explaining the science of an object, call searchKnowledge and cite the " +
      "returned sources (title + bibcode); do not invent facts. If the knowledge base " +
      "has nothing relevant, say so rather than guessing.",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(6),
    tools,
  });

  return result.toUIMessageStreamResponse();
}
