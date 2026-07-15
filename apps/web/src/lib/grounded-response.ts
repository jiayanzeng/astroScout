import type { UIMessageChunk } from "ai";

import type { ChatToolResult } from "@/lib/ai";
import { INSUFFICIENT_EVIDENCE_MESSAGE } from "@/lib/chat-policy";
import type { KnowledgePassage } from "@/lib/knowledge";

const MAX_EXCERPT_WORDS = 24;
const MAX_EVIDENCE_PASSAGES = 3;
const GROUNDED_TEXT_ID = "grounded-science-response";

function groundedPassages(passages: KnowledgePassage[]): KnowledgePassage[] {
  return passages.filter(
    (passage) =>
      Boolean(passage.content.trim()) && Boolean(passage.title?.trim()) && Boolean(passage.bibcode?.trim()),
  );
}

function shortEvidence(passage: KnowledgePassage): string {
  const firstSentence = passage.content.trim().split(/(?<=[.!?])\s+/, 1)[0];
  const words = firstSentence.split(/\s+/);
  const excerpt = words
    .slice(0, MAX_EXCERPT_WORDS)
    .join(" ")
    .replace(/[.!?]+$/, "");
  const truncation = words.length > MAX_EXCERPT_WORDS ? "…" : "";
  return `${excerpt}${truncation} [${passage.title} — ${passage.bibcode}].`;
}

/**
 * Produce science prose only from displayed corpus evidence. This intentionally uses a
 * short verbatim evidence sentence rather than asking the model to paraphrase and risk
 * adding facts that are absent from the retrieved passages.
 */
export function buildGroundedScienceResponse(passages: KnowledgePassage[]): string {
  const usable = groundedPassages(passages);
  if (usable.length === 0) return INSUFFICIENT_EVIDENCE_MESSAGE;
  return usable.slice(0, MAX_EVIDENCE_PASSAGES).map(shortEvidence).join("\n\n");
}

/**
 * Preserve tool cards while replacing all model-authored science text with the
 * deterministic corpus-only response immediately before the UI stream finishes.
 */
export function enforceGroundedScienceStream(
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  let passages: KnowledgePassage[] = [];
  let wroteGroundedText = false;

  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "tool-output-available") {
          const output = chunk.output as ChatToolResult;
          if (output.status === "ok" && output.tool === "searchKnowledge") {
            passages = output.passages;
          }
        }

        if (
          chunk.type === "text-start" ||
          chunk.type === "text-delta" ||
          chunk.type === "text-end"
        ) {
          return;
        }

        if (chunk.type === "finish" && !wroteGroundedText) {
          wroteGroundedText = true;
          controller.enqueue({ type: "text-start", id: GROUNDED_TEXT_ID });
          controller.enqueue({
            type: "text-delta",
            id: GROUNDED_TEXT_ID,
            delta: buildGroundedScienceResponse(passages),
          });
          controller.enqueue({ type: "text-end", id: GROUNDED_TEXT_ID });
        }

        controller.enqueue(chunk);
      },
    }),
  );
}
