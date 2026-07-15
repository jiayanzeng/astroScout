import type { ChatToolResult, ChatTools } from "@/lib/ai";
import type { ObserverContext } from "@/lib/observer-context";

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  "Insufficient corpus evidence: I cannot make a supported scientific claim from the available AstroScout literature.";

const SCIENCE_PATTERN =
  /\b(why|science|scientific|scientifically|explain|formed|formation|physics|composition|age|distance|mass|interesting|significant|what is|what are|tell me about)\b/i;
const PLANNING_PATTERN =
  /\b(observe|observing|visible|visibility|tonight|imaging|image|photograph|plan|conditions?|recommend|worth|best target|can i see)\b/i;

const NAMED_TARGETS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "M31", pattern: /\b(?:m\s*31|andromeda(?: galaxy)?)\b/i },
  { name: "M42", pattern: /\b(?:m\s*42|orion nebula)\b/i },
  { name: "M101", pattern: /\b(?:m\s*101|pinwheel galaxy)\b/i },
  { name: "Alpha Centauri", pattern: /\b(?:alpha|α)\s*centauri\b/i },
  { name: "Jupiter", pattern: /\b(?:jupiter|jupter)\b/i },
];

export type ChatIntent = {
  userText: string;
  science: boolean;
  planning: boolean;
  comparison: boolean;
  targets: string[];
};

export type ToolTraceEntry = {
  toolName: keyof ChatTools;
  input: unknown;
};

type PolicyStep = {
  toolCalls: Array<{ toolName: string; input: unknown }>;
  toolResults: Array<{ toolName: string; output: unknown }>;
};

export type RequiredToolAction =
  | { toolName: "searchKnowledge" }
  | { toolName: "planNight" }
  | { toolName: "getTargetDetail"; target: string };

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function extractTargets(text: string): string[] {
  const targets = NAMED_TARGETS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
  for (const match of text.matchAll(/\b(M\s*\d{1,3}|NGC\s*\d+|IC\s*\d+)\b/gi)) {
    targets.push(match[1].replace(/\s+/g, "").toUpperCase());
  }
  return unique(targets);
}

export function classifyChatIntent(userText: string): ChatIntent {
  const targets = extractTargets(userText);
  const comparison = /\b(compare|comparison|versus|vs\.?)\b/i.test(userText);
  const bareTarget =
    targets.length === 1 &&
    /^(?:M\s*\d{1,3}|NGC\s*\d+|IC\s*\d+|Alpha\s+Centauri|Jupiter|Jupter)$/i.test(
      userText.trim(),
    );
  const planning = PLANNING_PATTERN.test(userText) || comparison || bareTarget;
  return {
    userText,
    science: SCIENCE_PATTERN.test(userText) || (targets.length > 0 && !planning),
    planning,
    comparison,
    targets,
  };
}

export function requiredToolActions(
  intent: ChatIntent,
  observer: ObserverContext | null,
): RequiredToolAction[] {
  const actions: RequiredToolAction[] = [];
  if (intent.science) actions.push({ toolName: "searchKnowledge" });
  if (intent.planning) actions.push({ toolName: "planNight" });
  if (intent.planning && observer) {
    actions.push(
      ...intent.targets.map((target) => ({
        toolName: "getTargetDetail" as const,
        target,
      })),
    );
  }
  return actions;
}

function normalizedTarget(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("name" in value)) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name.replace(/\s+/g, "").toLowerCase() : null;
}

function actionSatisfied(action: RequiredToolAction, trace: ToolTraceEntry[]): boolean {
  return trace.some((entry) => {
    if (entry.toolName !== action.toolName) return false;
    if (action.toolName !== "getTargetDetail") return true;
    return normalizedTarget(entry.input) === action.target.replace(/\s+/g, "").toLowerCase();
  });
}

export function nextRequiredToolAction(
  intent: ChatIntent,
  observer: ObserverContext | null,
  trace: ToolTraceEntry[],
): RequiredToolAction | null {
  return requiredToolActions(intent, observer).find((action) => !actionSatisfied(action, trace)) ?? null;
}

export function baseSystemPrompt(observer: ObserverContext | null): string {
  const locationInstruction = observer
    ? `The application has bound every planning tool to ${observer.lat}, ${observer.lon} (${observer.source})${observer.when ? ` for ${observer.when}` : " for the upcoming night"}. Never claim or imply that another observer location was used.`
    : "No trusted observer location is available. Never infer coordinates from a target, a place name, prior model text, or general knowledge. A planning tool will return location_required; ask the user to set coordinates on /plan before offering location-specific advice.";

  return (
    "You are AstroScout, an astronomy observation-planning copilot for amateur astronomers. " +
    `${locationInstruction} ` +
    "Use planNight for a night ranking and getTargetDetail for named targets. Their coordinates are application-owned and are not tool arguments. " +
    "Before making any scientific or explanatory claim, call searchKnowledge. Cite each such claim with a returned title and bibcode, using the form [Title — bibcode]. " +
    `If searchKnowledge returns no passages, respond exactly with: ${INSUFFICIENT_EVIDENCE_MESSAGE} ` +
    "Do not supplement an empty or weak corpus from memory. Planning-only statements may use planning tools without literature retrieval."
  );
}

function traceFromSteps(steps: PolicyStep[]): ToolTraceEntry[] {
  return steps.flatMap((step) =>
    step.toolCalls.flatMap((call) => {
      if (
        call.toolName !== "planNight" &&
        call.toolName !== "getTargetDetail" &&
        call.toolName !== "searchKnowledge"
      ) {
        return [];
      }
      return [{ toolName: call.toolName, input: call.input }];
    }),
  );
}

function knowledgeOutputFromSteps(
  steps: PolicyStep[],
): Extract<ChatToolResult, { status: "ok"; tool: "searchKnowledge" }> | null {
  for (const step of [...steps].reverse()) {
    for (const result of [...step.toolResults].reverse()) {
      if (result.toolName !== "searchKnowledge") continue;
      const output = result.output as ChatToolResult;
      if (output.status === "ok" && output.tool === "searchKnowledge") return output;
    }
  }
  return null;
}

export function createPrepareStep(intent: ChatIntent, observer: ObserverContext | null) {
  const system = baseSystemPrompt(observer);
  return ({ steps }: { steps: PolicyStep[] }) => {
    const action = nextRequiredToolAction(intent, observer, traceFromSteps(steps));
    if (action) {
      const targetInstruction =
        action.toolName === "getTargetDetail"
          ? ` In this step, call getTargetDetail with name exactly ${action.target}.`
          : action.toolName === "searchKnowledge"
            ? ` In this step, call searchKnowledge for the user's exact science question: ${JSON.stringify(intent.userText)}.`
            : " In this step, call planNight.";
      return {
        system: `${system}${targetInstruction} Do not emit answer prose in this required-tool step.`,
        activeTools: [action.toolName],
        toolChoice: { type: "tool" as const, toolName: action.toolName },
      };
    }

    const knowledge = knowledgeOutputFromSteps(steps);
    if (intent.science && knowledge?.passages.length === 0) {
      return {
        system: `${system} The required search returned zero passages. Output only the exact insufficient-corpus sentence specified above.`,
        activeTools: [],
        toolChoice: "none" as const,
      };
    }

    const citationInstruction = knowledge?.passages.length
      ? ` You may use only these displayed citations: ${knowledge.passages
          .map((passage) => `[${passage.title ?? "Untitled"} — ${passage.bibcode ?? "no bibcode"}]`)
          .join(", ")}.`
      : "";
    return {
      system: `${system}${citationInstruction}`,
      activeTools: [],
      toolChoice: "none" as const,
    };
  };
}
