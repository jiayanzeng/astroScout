export type FaithfulnessCase = {
  id: string;
  question: string;
  answer: string;
  contexts: string[];
  expected: "grounded" | "has-unsupported-claim";
};

/** Canned copilot-style answers for the live faithfulness regression pass. */
export const FAITHFULNESS_CASES: FaithfulnessCase[] = [
  {
    id: "m31-grounded",
    question: "What kind of object is M31?",
    answer: "M31 is the Andromeda Galaxy. It is a spiral galaxy in the Local Group.",
    contexts: [
      "M31 is also known as the Andromeda Galaxy. It is a spiral galaxy and a member " +
        "of the Local Group.",
    ],
    expected: "grounded",
  },
  {
    id: "m42-grounded",
    question: "What is the Orion Nebula?",
    answer:
      "The Orion Nebula is an emission nebula. It is a stellar nursery containing " +
      "ionized hydrogen.",
    contexts: [
      "The Orion Nebula, catalogued as M42, is an emission nebula and stellar nursery " +
        "with ionized hydrogen gas.",
    ],
    expected: "grounded",
  },
  {
    id: "m57-grounded",
    question: "What is M57 and where is it?",
    answer: "M57 is a planetary nebula in Lyra. It is commonly called the Ring Nebula.",
    contexts: [
      "M57 is a planetary nebula in the constellation Lyra and is commonly known as " +
        "the Ring Nebula.",
    ],
    expected: "grounded",
  },
  {
    id: "m31-planted-number",
    question: "What do we know about M31?",
    answer: "M31 is a spiral galaxy. It contains exactly seven black holes.",
    contexts: [
      "M31, the Andromeda Galaxy, is a spiral galaxy. The passage gives no complete " +
        "census of its black holes.",
    ],
    expected: "has-unsupported-claim",
  },
  {
    id: "m42-planted-age",
    question: "How old is the Orion Nebula?",
    answer: "The Orion Nebula is an emission nebula. It is 500 billion years old.",
    contexts: [
      "The Orion Nebula is an emission nebula and active star-forming region. This " +
        "passage does not state an age for the nebula.",
    ],
    expected: "has-unsupported-claim",
  },
  {
    id: "m57-planted-superlative",
    question: "Why is M57 notable?",
    answer: "M57 is a planetary nebula. It is the brightest object in the Milky Way.",
    contexts: [
      "M57 is a planetary nebula called the Ring Nebula. The passage makes no claim " +
        "that it is the Milky Way's brightest object.",
    ],
    expected: "has-unsupported-claim",
  },
];
