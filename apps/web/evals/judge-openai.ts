import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type { Claim, Judge } from "./faithfulness";
import { splitClaims } from "./faithfulness";

const schema = z.object({
  claims: z.array(z.object({ text: z.string(), supported: z.boolean() })),
});

/** LLM-as-judge: asks a model whether each claim is supported by the contexts. */
export class OpenAIJudge implements Judge {
  async judge(answer: string, contexts: string[]): Promise<Claim[]> {
    const claims = splitClaims(answer);
    if (claims.length === 0) return [];
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema,
      system:
        "You check whether each claim is directly supported by the provided context " +
        "passages. Mark supported=true only if the context substantiates the claim; " +
        "otherwise false. Do not use outside knowledge.",
      prompt:
        `CONTEXTS:\n${contexts.join("\n---\n")}\n\n` +
        `CLAIMS:\n${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    });
    // align by index; fall back to unsupported if the model drops a claim
    return claims.map((text, i) => ({
      text,
      supported: object.claims[i]?.supported ?? false,
    }));
  }
}
