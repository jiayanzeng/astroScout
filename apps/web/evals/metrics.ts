/**
 * Pure information-retrieval metrics. Operate on ordered lists of item ids
 * (here: target names) and a set of relevant ids. No I/O — unit-tested in CI.
 */

export function hitAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  return retrieved.slice(0, k).some((r) => relevant.has(r)) ? 1 : 0;
}

export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return 0;
  const hits = retrieved.slice(0, k).filter((r) => relevant.has(r)).length;
  return hits / k;
}

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const topk = new Set(retrieved.slice(0, k));
  let hits = 0;
  for (const r of relevant) if (topk.has(r)) hits++;
  return hits / relevant.size;
}

export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/** nDCG@k with binary relevance. */
export function ndcgAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  let dcg = 0;
  retrieved.slice(0, k).forEach((r, i) => {
    if (relevant.has(r)) dcg += 1 / Math.log2(i + 2);
  });
  const ideal = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Collapse a passage-level ranked list to unique targets, preserving order. */
export function uniqueInOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!seen.has(it)) {
      seen.add(it);
      out.push(it);
    }
  }
  return out;
}
