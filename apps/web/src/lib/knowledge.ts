import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { embed } from "ai";

import { rerankPassages } from "./rerank";

export type KnowledgePassage = {
  target: string | null;
  title: string | null;
  source: string | null;
  bibcode: string | null;
  url: string | null;
  content: string;
  similarity: number;
};

/**
 * Embed the query and run cosine similarity search against the shared knowledge
 * base (public read via RLS). Server-side only — uses OPENAI_API_KEY.
 */
export async function searchKnowledge(
  query: string,
  target?: string,
  opts?: { rerank?: boolean },
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
  const candidates = (data ?? []) as KnowledgePassage[];
  if (opts?.rerank === false) return candidates.slice(0, 5);
  return rerankPassages(query, candidates, 5);
}
