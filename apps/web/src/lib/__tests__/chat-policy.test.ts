import { describe, expect, it } from "vitest";

import {
  classifyChatIntent,
  extractTargets,
  nextRequiredToolAction,
  requiredToolActions,
  type ToolTraceEntry,
} from "../chat-policy";
import type { ObserverContext } from "../observer-context";

const observer: ObserverContext = {
  lat: -36.85,
  lon: 174.76,
  source: "manual",
  when: "2026-07-15",
};

describe("chat trajectory policy", () => {
  it("requires one night plan and details for every comparison target", () => {
    const intent = classifyChatIntent("Compare M31 and M42 for imaging tonight.");
    expect(requiredToolActions(intent, observer)).toEqual([
      { toolName: "planNight" },
      { toolName: "getTargetDetail", target: "M31" },
      { toolName: "getTargetDetail", target: "M42" },
    ]);
  });

  it("forces literature retrieval for science but not planning-only prompts", () => {
    expect(
      requiredToolActions(
        classifyChatIntent("Why is M101 scientifically interesting?"),
        observer,
      ),
    ).toEqual([{ toolName: "searchKnowledge" }]);
    expect(
      requiredToolActions(classifyChatIntent("What should I observe tonight?"), observer),
    ).toEqual([{ toolName: "planNight" }]);
    expect(
      requiredToolActions(classifyChatIntent("What kind of object is M31?"), observer),
    ).toEqual([{ toolName: "searchKnowledge" }]);
  });

  it("normalizes the transcript's misspelled Jupiter query", () => {
    expect(extractTargets("Can I observe Jupter tonight?")).toEqual(["Jupiter"]);
  });

  it("does not request target details without trusted coordinates", () => {
    const intent = classifyChatIntent("Compare M31 and M42 for imaging tonight.");
    expect(requiredToolActions(intent, null)).toEqual([{ toolName: "planNight" }]);
  });

  it("treats a bare catalog reply as planning instead of unsupported science prose", () => {
    expect(requiredToolActions(classifyChatIntent("M1"), null)).toEqual([
      { toolName: "planNight" },
    ]);
    expect(requiredToolActions(classifyChatIntent("M1"), observer)).toEqual([
      { toolName: "planNight" },
      { toolName: "getTargetDetail", target: "M1" },
    ]);
  });

  it("keeps forcing a comparison target until that exact target was called", () => {
    const intent = classifyChatIntent("Compare M31 and M42 for imaging tonight.");
    const trace: ToolTraceEntry[] = [
      { toolName: "planNight", input: {} },
      { toolName: "getTargetDetail", input: { name: "M31" } },
    ];
    expect(nextRequiredToolAction(intent, observer, trace)).toEqual({
      toolName: "getTargetDetail",
      target: "M42",
    });
  });
});
