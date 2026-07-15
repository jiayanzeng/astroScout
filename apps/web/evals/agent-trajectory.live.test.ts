import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { describe, expect, it } from "vitest";

import {
  createChatTools,
  type ChatToolResult,
  type ChatToolDependencies,
} from "../src/lib/ai";
import type { NightPlan, TargetDetail } from "../src/lib/api";
import {
  INSUFFICIENT_EVIDENCE_MESSAGE,
  baseSystemPrompt,
  classifyChatIntent,
  createPrepareStep,
} from "../src/lib/chat-policy";
import { buildGroundedScienceResponse } from "../src/lib/grounded-response";
import type { KnowledgePassage } from "../src/lib/knowledge";
import type { ObserverContext } from "../src/lib/observer-context";
import { faithfulnessScore } from "./faithfulness";
import { OpenAIJudge } from "./judge-openai";

const LIVE_ENABLED =
  process.env.RUN_LIVE_AGENT_EVALS === "1" && Boolean(process.env.OPENAI_API_KEY);
const GROUNDED_THRESHOLD = 0.8;

const observer: ObserverContext = {
  lat: -36.85,
  lon: 174.76,
  source: "manual",
  when: "2026-07-15",
};

const nightPlan: NightPlan = {
  dusk_utc: "2026-07-15T06:00:00Z",
  dawn_utc: "2026-07-15T18:00:00Z",
  dark_hours: 10,
  moon_illumination: 0.2,
  bortle: 5,
  targets: [],
};

function targetDetail(name: string): TargetDetail {
  return {
    name,
    common_name: name,
    kind: "fixture target",
    score: 70,
    rating: "good",
    peak_altitude_deg: 45,
    hours_visible: 4,
    moon_separation_deg: 80,
    light_sensitivity: 0.5,
    dark_hours: 10,
    moon_illumination: 0.2,
    bortle: 5,
  };
}

const M101_PASSAGE: KnowledgePassage = {
  target: "M101",
  title: "The Pinwheel Galaxy in resolved starlight",
  source: "fixture",
  bibcode: "2024ApJ...101..001A",
  url: "https://ui.adsabs.harvard.edu/abs/2024ApJ...101..001A",
  content: "M101 is a face-on spiral galaxy with prominent star-forming regions in its arms.",
  similarity: 0.95,
};

const ALPHA_CENTAURI_PASSAGE: KnowledgePassage = {
  target: "Alpha Centauri",
  title: "The Alpha Centauri stellar system",
  source: "fixture",
  bibcode: "2023A&A...999A...1B",
  url: "https://ui.adsabs.harvard.edu/abs/2023A&A...999A...1B",
  content: "Alpha Centauri is a nearby multiple-star system whose principal stars are Alpha Centauri A and B.",
  similarity: 0.94,
};

function dependencies(passages: KnowledgePassage[]): ChatToolDependencies {
  return {
    planNight: async () => nightPlan,
    targetDetail: async (name) => targetDetail(name),
    knowledge: async () => passages,
  };
}

async function runTrajectory(prompt: string, passages: KnowledgePassage[] = []) {
  const intent = classifyChatIntent(prompt);
  const result = await generateText({
    model: openai.chat("gpt-4o-mini"),
    system: baseSystemPrompt(observer),
    prompt,
    tools: createChatTools(observer, dependencies(passages)),
    prepareStep: createPrepareStep(intent, observer),
    stopWhen: stepCountIs(6),
  });
  const calls = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
  );
  const retrievedPassages = result.steps.flatMap((step) =>
    step.toolResults.flatMap((toolResult) => {
      if (toolResult.toolName !== "searchKnowledge") return [];
      const output = toolResult.output as ChatToolResult;
      return output.status === "ok" && output.tool === "searchKnowledge"
        ? output.passages
        : [];
    }),
  );
  return {
    result,
    calls,
    groundedText: buildGroundedScienceResponse(retrievedPassages),
  };
}

function called(calls: Array<{ toolName: string; input: unknown }>, toolName: string) {
  return calls.filter((call) => call.toolName === toolName);
}

describe.skipIf(!LIVE_ENABLED)("live agent trajectory policy", () => {
  it(
    "compares M31 and M42 with one plan and both target details, without unnecessary retrieval",
    async () => {
      const { calls } = await runTrajectory("Compare M31 and M42 for imaging tonight.");
      expect(called(calls, "planNight")).toHaveLength(1);
      expect(called(calls, "getTargetDetail").map((call) => call.input)).toEqual([
        { name: "M31" },
        { name: "M42" },
      ]);
      expect(called(calls, "searchKnowledge")).toHaveLength(0);
    },
    60_000,
  );

  for (const fixture of [
    {
      name: "M101",
      prompt: "Why is M101 scientifically interesting?",
      passage: M101_PASSAGE,
    },
    {
      name: "Alpha Centauri",
      prompt: "Explain the science of Alpha Centauri.",
      passage: ALPHA_CENTAURI_PASSAGE,
    },
  ]) {
    it(
      `${fixture.name} retrieves literature, cites the displayed source, and stays grounded`,
      async () => {
        const { calls, groundedText } = await runTrajectory(fixture.prompt, [fixture.passage]);
        expect(called(calls, "searchKnowledge")).toHaveLength(1);
        expect(groundedText).toContain(fixture.passage.title);
        expect(groundedText).toContain(fixture.passage.bibcode);

        const claims = await new OpenAIJudge().judge(groundedText, [
          `${fixture.passage.content} ${fixture.passage.title} ${fixture.passage.bibcode}`,
        ]);
        expect(faithfulnessScore(claims)).toBeGreaterThanOrEqual(GROUNDED_THRESHOLD);
      },
      60_000,
    );
  }

  it(
    "withholds science prose when the corpus is empty",
    async () => {
      const { calls, groundedText } = await runTrajectory("Explain the science of M101.");
      expect(called(calls, "searchKnowledge")).toHaveLength(1);
      expect(groundedText).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    },
    60_000,
  );

  it(
    "normalizes the transcript's misspelled Jupiter request into auditable planning tools",
    async () => {
      const { calls } = await runTrajectory("Can I observe Jupter tonight?");
      expect(called(calls, "planNight")).toHaveLength(1);
      expect(called(calls, "getTargetDetail").map((call) => call.input)).toEqual([
        { name: "Jupiter" },
      ]);
      expect(called(calls, "searchKnowledge")).toHaveLength(0);
    },
    60_000,
  );
});
