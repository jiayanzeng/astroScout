/**
 * Reciprocal Rank Fusion: combine several ranked id-lists into one. An id's score
 * is the sum over lists of 1/(k + rank). Robust, parameter-light, and the standard
 * way to fuse keyword (sparse) and vector (dense) retrieval. Pure — unit-tested.
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
