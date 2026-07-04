/** Retrieval eval set: each query is labelled with the target(s) it's about.
 *  Cases are tagged so we can see where sparse vs dense retrieval wins. */
export type EvalCase = {
  id: string;
  query: string;
  relevantTargets: string[];
  kind: "exact" | "semantic";
  referenceAnswer?: string;
};

export const RETRIEVAL_DATASET: EvalCase[] = [
  // exact-ish: share vocabulary with names/types (sparse keyword should do well)
  { id: "andromeda", query: "What kind of object is the Andromeda Galaxy?", relevantTargets: ["M31"], kind: "exact" },
  { id: "orion-sf", query: "star formation in the Orion Nebula", relevantTargets: ["M42"], kind: "exact" },
  { id: "ring", query: "What is the Ring Nebula?", relevantTargets: ["M57"], kind: "exact" },
  { id: "dumbbell", query: "planetary nebula in Vulpecula", relevantTargets: ["M27"], kind: "exact" },
  { id: "globular", query: "bright globular cluster in Hercules", relevantTargets: ["M13"], kind: "exact" },
  { id: "pleiades", query: "naked-eye open cluster in Taurus", relevantTargets: ["M45"], kind: "exact" },
  { id: "whirlpool", query: "interacting spiral galaxy with a companion", relevantTargets: ["M51"], kind: "exact" },
  { id: "north-america", query: "emission nebula in Cygnus shaped like a continent", relevantTargets: ["NGC7000"], kind: "exact" },

  // semantic/paraphrastic: little keyword overlap; needs meaning (dense should win)
  { id: "island-universe", query: "a faint smudge that is really a distant island universe of billions of suns", relevantTargets: ["M31", "M51", "M81", "M101", "M104"], kind: "semantic" },
  { id: "stellar-nursery", query: "where are brand new stars being born right now?", relevantTargets: ["M42", "M8", "M20"], kind: "semantic" },
  { id: "dying-star-shell", query: "the glowing shell puffed off by a dying sun-like star", relevantTargets: ["M57", "M27"], kind: "semantic" },
  { id: "ancient-swarm", query: "an ancient tightly bound swarm of hundreds of thousands of old stars", relevantTargets: ["M13"], kind: "semantic" },
  { id: "dust-silhouette", query: "a dark cloud blocking the light behind it like a shadow puppet", relevantTargets: ["IC434"], kind: "semantic" },
  { id: "baby-stars-sagittarius", query: "a cloud collapsing into infant stars toward the galactic center", relevantTargets: ["M8", "M20"], kind: "semantic" },
];
