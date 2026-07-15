export type UsageOperation = "chat" | "embedding" | "rerank";

export type ModelUsageRecord = {
  provider: "openai" | "cohere" | "local";
  model: string;
  operation: UsageOperation;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  billing_units?: Record<string, number>;
};

export type RecordModelUsage = (usage: ModelUsageRecord) => void;

const DEFAULT_PRICES_PER_MILLION = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
} as const;

function configuredPrice(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function openAIUsage(
  model: keyof typeof DEFAULT_PRICES_PER_MILLION,
  operation: UsageOperation,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): ModelUsageRecord {
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  const defaults = DEFAULT_PRICES_PER_MILLION[model];
  const envPrefix = model === "gpt-4o-mini" ? "GPT4O_MINI" : "EMBEDDING_3_SMALL";
  const inputPrice = configuredPrice(
    `OPENAI_${envPrefix}_INPUT_USD_PER_MILLION`,
    defaults.input,
  );
  const outputPrice = configuredPrice(
    `OPENAI_${envPrefix}_OUTPUT_USD_PER_MILLION`,
    defaults.output,
  );
  return {
    provider: "openai",
    model,
    operation,
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    estimated_cost_usd: Number(
      ((input * inputPrice + output * outputPrice) / 1_000_000).toFixed(8),
    ),
  };
}

export class UsageAccumulator {
  private readonly records: ModelUsageRecord[] = [];

  readonly record: RecordModelUsage = (usage) => {
    this.records.push(usage);
  };

  snapshot() {
    return {
      inputTokens: this.records.reduce((sum, record) => sum + record.input_tokens, 0),
      outputTokens: this.records.reduce((sum, record) => sum + record.output_tokens, 0),
      totalTokens: this.records.reduce((sum, record) => sum + record.total_tokens, 0),
      estimatedCostUsd: Number(
        this.records
          .reduce((sum, record) => sum + (record.estimated_cost_usd ?? 0), 0)
          .toFixed(8),
      ),
      breakdown: this.records.map((record) => ({ ...record })),
    };
  }
}
