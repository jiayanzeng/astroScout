import type { KnowledgePassage } from "../src/lib/knowledge";
import { reciprocalRankFusion } from "./fusion";
import { stem, tokens } from "./text";

export type RetrievedPassage = Pick<KnowledgePassage, "target" | "content" | "similarity">;

export interface Retriever {
  readonly name: string;
  retrieve(query: string, k: number): Promise<RetrievedPassage[]>;
}

// Sparse keyword index (exact tokens, no stemming).
const KEYWORDS: Record<string, string[]> = {
  M31: ["andromeda", "galaxy", "spiral", "local", "group"],
  M42: ["orion", "nebula", "emission", "star", "formation", "ionized"],
  M45: ["pleiades", "open", "cluster", "taurus", "naked"],
  M51: ["whirlpool", "galaxy", "spiral", "interacting", "companion"],
  M13: ["hercules", "globular", "cluster"],
  M81: ["bode", "galaxy", "spiral"],
  M101: ["pinwheel", "galaxy", "spiral"],
  M27: ["dumbbell", "planetary", "nebula", "vulpecula"],
  M57: ["ring", "planetary", "nebula", "lyra"],
  NGC7000: ["north", "america", "emission", "nebula", "cygnus", "continent"],
  NGC869: ["double", "cluster", "open", "perseus"],
  IC434: ["horsehead", "dark", "nebula", "orion", "belt"],
  M8: ["lagoon", "emission", "nebula", "sagittarius"],
  M20: ["trifid", "emission", "nebula", "sagittarius"],
  M104: ["sombrero", "galaxy", "edge", "dust", "lane"],
};

// Descriptive blurbs (the "documents"). Dense signal + reranker read these.
const BLURBS: Record<string, string> = {
  M31: "The nearest large spiral galaxy, a distant island universe holding hundreds of billions of suns.",
  M42: "A glowing stellar nursery in Orion where brand new infant stars are being born inside ionized hydrogen.",
  M45: "A young open cluster of hot blue sibling stars, easily seen with the naked eye in Taurus.",
  M51: "An interacting spiral galaxy, an island universe of billions of stars pulling on a smaller companion.",
  M13: "An ancient tightly bound swarm of hundreds of thousands of very old stars orbiting the galaxy.",
  M81: "A grand design spiral galaxy, a distant island universe of billions of suns.",
  M101: "A large face-on spiral galaxy, an island universe with sprawling arms of billions of stars.",
  M27: "A planetary nebula, the glowing shell of gas puffed off by a dying sun-like star.",
  M57: "A planetary nebula, a glowing ring-shaped shell ejected by a dying sun-like star.",
  NGC7000: "A vast emission nebula in Cygnus whose shape resembles a continent, lit by hot young stars.",
  NGC869: "A pair of bright open clusters of young stars close together in Perseus.",
  IC434: "A dark dusty cloud silhouetted as a shadow against the bright glow behind it near Orion's belt.",
  M8: "A bright cloud of gas in Sagittarius collapsing into clusters of infant stars toward the galactic center.",
  M20: "A colorful star-forming cloud in Sagittarius where young stars are condensing out of collapsing gas.",
  M104: "An edge-on spiral galaxy, a distant island universe crossed by a dark lane of dust.",
};

const contentFor = (target: string): string => `${target} — ${BLURBS[target] ?? ""}`;

function rankToPassages(
  scored: { target: string; similarity: number }[],
  k: number,
): RetrievedPassage[] {
  return scored
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
    .map((s) => ({ target: s.target, content: contentFor(s.target), similarity: s.similarity }));
}

/** Sparse keyword baseline: exact-token overlap with a curated keyword index. */
export class LexicalRetriever implements Retriever {
  readonly name = "lexical(sparse)";
  async retrieve(query: string, k: number): Promise<RetrievedPassage[]> {
    const terms = new Set(tokens(query));
    const scored = Object.entries(KEYWORDS).map(([target, kws]) => ({
      target,
      similarity: kws.filter((w) => terms.has(w)).length / Math.max(kws.length, 1),
    }));
    return rankToPassages(scored, k);
  }
}

/** Dense-ish baseline: stemmed token Jaccard over descriptive blurbs (stands in for
 *  embeddings offline; captures paraphrase the sparse index misses). */
export class DenseRetriever implements Retriever {
  readonly name = "dense(offline)";
  async retrieve(query: string, k: number): Promise<RetrievedPassage[]> {
    const q = new Set(tokens(query).map(stem));
    const scored = Object.entries(BLURBS).map(([target, blurb]) => {
      const b = new Set(tokens(blurb).map(stem));
      let inter = 0;
      for (const t of q) if (b.has(t)) inter++;
      const union = new Set([...q, ...b]).size;
      return { target, similarity: union ? inter / union : 0 };
    });
    return rankToPassages(scored, k);
  }
}

/** Hybrid: fuse two retrievers' rankings with RRF. */
export class HybridRetriever implements Retriever {
  readonly name: string;
  constructor(
    private readonly sparse: Retriever,
    private readonly dense: Retriever,
  ) {
    this.name = `hybrid(${sparse.name}+${dense.name})`;
  }
  async retrieve(query: string, k: number): Promise<RetrievedPassage[]> {
    const [a, b] = await Promise.all([
      this.sparse.retrieve(query, k * 2),
      this.dense.retrieve(query, k * 2),
    ]);
    const targetsOf = (ps: RetrievedPassage[]) =>
      ps.map((p) => p.target).filter((t): t is string => !!t);
    const fused = reciprocalRankFusion([targetsOf(a), targetsOf(b)]);
    return fused
      .slice(0, k)
      .map((target, i) => ({ target, content: contentFor(target), similarity: 1 / (i + 1) }));
  }
}

/** Live retriever: the real pgvector + hybrid + rerank path used by the copilot. Needs keys. */
export class LiveRetriever implements Retriever {
  readonly name = "pgvector+rerank(live)";
  async retrieve(query: string, k: number): Promise<RetrievedPassage[]> {
    const { searchKnowledge } = await import("../src/lib/knowledge");
    const passages = await searchKnowledge(query);
    return passages
      .slice(0, k)
      .map((p) => ({ target: p.target, content: p.content, similarity: p.similarity }));
  }
}
