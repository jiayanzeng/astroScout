/**
 * Answer-faithfulness (groundedness) scoring. An answer is broken into claims;
 * a Judge decides which are supported by the retrieved contexts. The aggregation
 * is pure and unit-tested; the judge implementation is pluggable.
 */

export type Claim = { text: string; supported: boolean };

export interface Judge {
  judge(answer: string, contexts: string[]): Promise<Claim[]>;
}

/** supported claims / total claims. Empty answer => 1 (vacuously faithful). */
export function faithfulnessScore(claims: Claim[]): number {
  if (claims.length === 0) return 1;
  return claims.filter((c) => c.supported).length / claims.length;
}

export function splitClaims(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Deterministic, offline judge: a claim is "supported" if every significant word
 * (>4 chars) appears somewhere in the contexts. Crude but reproducible — good for
 * harness tests and a no-keys demo. Swap in OpenAIJudge for real evaluation.
 */
export class MockJudge implements Judge {
  async judge(answer: string, contexts: string[]): Promise<Claim[]> {
    const ctx = contexts.join(" ").toLowerCase();
    return splitClaims(answer).map((text) => {
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const supported = words.length > 0 && words.every((w) => ctx.includes(w));
      return { text, supported };
    });
  }
}
