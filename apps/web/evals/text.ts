/** Tiny text utilities shared by the offline retrievers and reranker. Pure. */

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** crude stemmer so "stars"~"star", "forming"~"form" — enough to bridge paraphrase. */
export function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, "");
}

export function stemTokens(text: string): string[] {
  return tokens(text).map(stem);
}

export function tf(words: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

export function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv) dot += v * bv;
  }
  const na = Math.sqrt([...a.values()].reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt([...b.values()].reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}
