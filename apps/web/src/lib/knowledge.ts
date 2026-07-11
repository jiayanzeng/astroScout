import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { embed } from "ai";

import { rerankPassages, type RerankBackend } from "./rerank";

export type KnowledgePassage = {
  target: string | null;
  title: string | null;
  source: string | null;
  bibcode: string | null;
  url: string | null;
  content: string;
  similarity: number;
};

const NEAR_MATCH_TOKEN_RATIO = 0.8;
const NEAR_MATCH_JACCARD = 0.8;
const SHINGLE_SIZE = 3;

function normalizeContent(content: string): string {
  return content
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenShingles(tokens: string[]): Set<string> {
  const shingles = new Set<string>();
  for (let index = 0; index <= tokens.length - SHINGLE_SIZE; index += 1) {
    shingles.add(tokens.slice(index, index + SHINGLE_SIZE).join(" "));
  }
  return shingles;
}

function isNearDuplicate(first: string, second: string): boolean {
  if (first === second) return true;
  if (!first || !second) return false;

  // Require a token boundary so identifiers such as M3 and M31 remain distinct.
  if (first.startsWith(`${second} `) || second.startsWith(`${first} `)) return true;

  const firstTokens = first.split(" ");
  const secondTokens = second.split(" ");
  const tokenRatio =
    Math.min(firstTokens.length, secondTokens.length) /
    Math.max(firstTokens.length, secondTokens.length);
  if (tokenRatio < NEAR_MATCH_TOKEN_RATIO) return false;
  if (firstTokens.length < SHINGLE_SIZE || secondTokens.length < SHINGLE_SIZE) return false;

  const firstShingles = tokenShingles(firstTokens);
  const secondShingles = tokenShingles(secondTokens);
  let intersection = 0;
  for (const shingle of firstShingles) {
    if (secondShingles.has(shingle)) intersection += 1;
  }
  const union = firstShingles.size + secondShingles.size - intersection;
  return union > 0 && intersection / union >= NEAR_MATCH_JACCARD;
}

/** Collapse near-duplicate chunks within one target/document group. */
export function deduplicatePassages(passages: KnowledgePassage[]): KnowledgePassage[] {
  const grouped = new Map<
    string,
    { index: number; normalized: string; passage: KnowledgePassage }[]
  >();

  passages.forEach((passage, index) => {
    const groupKey = JSON.stringify([passage.target, passage.bibcode]);
    const group = grouped.get(groupKey) ?? [];
    group.push({ index, normalized: normalizeContent(passage.content), passage });
    grouped.set(groupKey, group);
  });

  const keptIndices = new Set<number>();
  for (const group of grouped.values()) {
    const higherPriority: typeof group = [];
    const byPriority = [...group].sort(
      (first, second) =>
        second.passage.similarity - first.passage.similarity || first.index - second.index,
    );
    for (const candidate of byPriority) {
      const hasHigherSimilarityMatch = higherPriority.some((existing) =>
        isNearDuplicate(candidate.normalized, existing.normalized),
      );
      higherPriority.push(candidate);
      if (hasHigherSimilarityMatch) {
        continue;
      }
      keptIndices.add(candidate.index);
    }
  }

  return passages.filter((_, index) => keptIndices.has(index));
}

/** Fetch the 15 first-stage hybrid candidates. Server-side integration edge. */
export async function retrieveKnowledgeCandidates(
  query: string,
  target?: string,
): Promise<KnowledgePassage[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: query,
    query_embedding: embedding,
    match_count: 15,
    filter_target: target ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgePassage[];
}

/**
 * Run hybrid retrieval against the shared knowledge base, optionally rerank, and return
 * the top five. Server-side only — uses OPENAI_API_KEY for the query embedding.
 */
export async function searchKnowledge(
  query: string,
  target?: string,
  opts?: { rerank?: boolean; rerankBackend?: RerankBackend },
): Promise<KnowledgePassage[]> {
  const candidates = await retrieveKnowledgeCandidates(query, target);
  if (opts?.rerank === false) return candidates.slice(0, 5);
  return rerankPassages(query, deduplicatePassages(candidates), 5, opts?.rerankBackend);
}
