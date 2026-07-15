import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

import type { RecordModelUsage } from "@/lib/chat-usage";
import {
  fetchNightPlan,
  fetchTargetDetail,
  type NightPlan,
  type TargetDetail,
} from "@/lib/api";
import { searchKnowledge, type KnowledgePassage } from "@/lib/knowledge";
import type { ObserverContext } from "@/lib/observer-context";

export type LocationRequiredResult = {
  status: "location_required";
  message: string;
};

export type PlanNightResult =
  | LocationRequiredResult
  | {
      status: "ok";
      tool: "planNight";
      observer: ObserverContext;
      plan: NightPlan;
    };

export type TargetDetailResult =
  | LocationRequiredResult
  | {
      status: "ok";
      tool: "getTargetDetail";
      observer: ObserverContext;
      target: TargetDetail;
    };

export type KnowledgeResult = {
  status: "ok";
  tool: "searchKnowledge";
  passages: KnowledgePassage[];
};

export type ChatToolResult = PlanNightResult | TargetDetailResult | KnowledgeResult;

export type ChatToolDependencies = {
  planNight: typeof fetchNightPlan;
  targetDetail: typeof fetchTargetDetail;
  knowledge: typeof searchKnowledge;
};

const DEFAULT_DEPENDENCIES: ChatToolDependencies = {
  planNight: fetchNightPlan,
  targetDetail: fetchTargetDetail,
  knowledge: searchKnowledge,
};

const LOCATION_REQUIRED: LocationRequiredResult = {
  status: "location_required",
  message:
    "A trusted observer location is required. Ask the user to set latitude and longitude on /plan, then retry.",
};

export const planNightInputSchema = z.object({}).strict();
export const targetDetailInputSchema = z
  .object({
    name: z.string().describe("Object name, e.g. M31, NGC 7000, Horsehead"),
  })
  .strict();

export async function runPlanNightTool(
  observer: ObserverContext | null,
  dependencies: ChatToolDependencies = DEFAULT_DEPENDENCIES,
): Promise<PlanNightResult> {
  if (!observer) return LOCATION_REQUIRED;
  const plan = await dependencies.planNight(observer.lat, observer.lon, observer.when);
  return { status: "ok", tool: "planNight", observer, plan };
}

export async function runTargetDetailTool(
  name: string,
  observer: ObserverContext | null,
  dependencies: ChatToolDependencies = DEFAULT_DEPENDENCIES,
): Promise<TargetDetailResult> {
  if (!observer) return LOCATION_REQUIRED;
  const target = await dependencies.targetDetail(name, observer.lat, observer.lon, observer.when);
  return { status: "ok", tool: "getTargetDetail", observer, target };
}

export function createChatTools(
  observer: ObserverContext | null,
  dependencies: ChatToolDependencies = DEFAULT_DEPENDENCIES,
  recordUsage?: RecordModelUsage,
) {
  return {
    planNight: tool({
      description:
        "Rank targets for the application-provided observer location and date. The " +
        "location is server-bound and is deliberately not an argument. Use this for " +
        "what-to-observe and night-planning requests.",
      inputSchema: planNightInputSchema,
      execute: async () => runPlanNightTool(observer, dependencies),
    }),
    getTargetDetail: tool({
      description:
        "Get detailed night conditions for one named target at the application-provided " +
        "observer location and date. The location is server-bound and is deliberately " +
        "not an argument.",
      inputSchema: targetDetailInputSchema,
      execute: async ({ name }) => runTargetDetailTool(name, observer, dependencies),
    }),
    searchKnowledge: tool({
      description:
        "Search the AstroScout astronomy-literature corpus. Scientific or explanatory " +
        "claims require this tool and must cite the returned title and bibcode. An " +
        "empty result means there is insufficient corpus evidence; never fill gaps from memory.",
      inputSchema: z.object({
        query: z.string().describe("The user's science question in specific search terms"),
        target: z.string().optional().describe("Optional catalog target, e.g. M42"),
      }),
      execute: async ({ query, target }): Promise<KnowledgeResult> => ({
        status: "ok",
        tool: "searchKnowledge",
        passages: await dependencies.knowledge(query, target, { recordUsage }),
      }),
    }),
  };
}

export type ChatTools = InferUITools<ReturnType<typeof createChatTools>>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;
