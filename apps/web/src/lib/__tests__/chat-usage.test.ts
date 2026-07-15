import { describe, expect, it } from "vitest";

import { openAIUsage, UsageAccumulator } from "@/lib/chat-usage";

describe("chat usage accounting", () => {
  it("calculates the configured GPT-4o mini token estimate", () => {
    expect(openAIUsage("gpt-4o-mini", "chat", 1_000_000, 1_000_000)).toMatchObject({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      total_tokens: 2_000_000,
      estimated_cost_usd: 0.75,
    });
  });

  it("aggregates chat, rerank, and embedding calls without content", () => {
    const usage = new UsageAccumulator();
    usage.record(openAIUsage("text-embedding-3-small", "embedding", 1_000, 0));
    usage.record(openAIUsage("gpt-4o-mini", "rerank", 2_000, 100));
    usage.record(openAIUsage("gpt-4o-mini", "chat", 3_000, 200));

    expect(usage.snapshot()).toMatchObject({
      inputTokens: 6_000,
      outputTokens: 300,
      totalTokens: 6_300,
      breakdown: [{ operation: "embedding" }, { operation: "rerank" }, { operation: "chat" }],
    });
  });
});
