/**
 * Optional: forward eval results to Braintrust. Activated only when
 * BRAINTRUST_API_KEY is set AND `braintrust` is installed (`pnpm add -D braintrust`).
 * The variable specifier keeps it out of the typecheck/build graph so it stays
 * truly optional — this file compiles whether or not braintrust is installed.
 */
import type { CaseResult } from "./run";
import { recallAtK } from "./metrics";

type BraintrustModule = {
  Eval: (
    project: string,
    opts: {
      data: () => { input: string; expected: string[] }[];
      task: (input: string) => Promise<string[]>;
      scores: ((args: { output: string[]; expected: string[] }) => {
        name: string;
        score: number;
      })[];
    },
  ) => Promise<unknown>;
};

export async function pushToBraintrust(
  project: string,
  results: CaseResult[],
): Promise<boolean> {
  if (!process.env.BRAINTRUST_API_KEY) return false;
  const specifier = "braintrust";
  let bt: BraintrustModule;
  try {
    bt = (await import(specifier)) as unknown as BraintrustModule;
  } catch {
    console.warn("braintrust not installed — run `pnpm add -D braintrust` to enable.");
    return false;
  }
  const byQuery = new Map(results.map((r) => [r.query, r.retrievedTargets]));
  await bt.Eval(project, {
    data: () => results.map((r) => ({ input: r.query, expected: r.relevant })),
    task: async (input) => byQuery.get(input) ?? [],
    scores: [
      ({ output, expected }) => ({
        name: "recall@3",
        score: recallAtK(output, new Set(expected), 3),
      }),
    ],
  });
  return true;
}
