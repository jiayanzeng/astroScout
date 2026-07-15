import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import type { KnowledgeResult } from "../ai";
import { INSUFFICIENT_EVIDENCE_MESSAGE } from "../chat-policy";
import {
  buildGroundedScienceResponse,
  enforceGroundedScienceStream,
} from "../grounded-response";
import type { KnowledgePassage } from "../knowledge";

const passage: KnowledgePassage = {
  target: "M101",
  title: "Resolved stars in M101",
  source: "fixture",
  bibcode: "2026ApJ...101..001A",
  url: "https://example.test/m101",
  content: "M101 is a face-on spiral galaxy with star-forming regions in its arms.",
  similarity: 0.9,
};

function chunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

describe("grounded science response policy", () => {
  it("builds cited prose only from a short corpus excerpt", () => {
    expect(buildGroundedScienceResponse([passage])).toBe(
      "M101 is a face-on spiral galaxy with star-forming regions in its arms " +
        "[Resolved stars in M101 — 2026ApJ...101..001A].",
    );
  });

  it("withholds science when no passage has complete displayed provenance", () => {
    expect(buildGroundedScienceResponse([])).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(buildGroundedScienceResponse([{ ...passage, bibcode: null }])).toBe(
      INSUFFICIENT_EVIDENCE_MESSAGE,
    );
  });

  it("preserves tool cards but suppresses model prose in the UI stream", async () => {
    const knowledge: KnowledgeResult = {
      status: "ok",
      tool: "searchKnowledge",
      passages: [passage],
    };
    const output = await collect(
      enforceGroundedScienceStream(
        chunkStream([
          { type: "text-start", id: "model-text" },
          { type: "text-delta", id: "model-text", delta: "Unsupported model claim." },
          { type: "text-end", id: "model-text" },
          {
            type: "tool-output-available",
            toolCallId: "knowledge-1",
            output: knowledge,
          },
          { type: "finish", finishReason: "stop" },
        ]),
      ),
    );

    expect(output).toContainEqual({
      type: "tool-output-available",
      toolCallId: "knowledge-1",
      output: knowledge,
    });
    expect(
      output
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
    ).toBe(buildGroundedScienceResponse([passage]));
  });
});
