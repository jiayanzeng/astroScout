import { describe, expect, it } from "vitest";

import { FAITHFULNESS_CASES } from "./faithfulness-cases";
import { faithfulnessScore, splitClaims } from "./faithfulness";
import { OpenAIJudge } from "./judge-openai";

const GROUNDED_THRESHOLD = 0.8;

describe.skipIf(!process.env.OPENAI_API_KEY)("OpenAIJudge live faithfulness", () => {
  const judge = new OpenAIJudge();

  for (const fixture of FAITHFULNESS_CASES) {
    it(`${fixture.id}: ${fixture.question}`, async () => {
      const claims = await judge.judge(fixture.answer, fixture.contexts);
      const score = faithfulnessScore(claims);

      expect(claims).toHaveLength(splitClaims(fixture.answer).length);
      if (fixture.expected === "grounded") {
        expect(score).toBeGreaterThanOrEqual(GROUNDED_THRESHOLD);
      } else {
        expect(score).toBeLessThan(GROUNDED_THRESHOLD);
      }
    });
  }
});
