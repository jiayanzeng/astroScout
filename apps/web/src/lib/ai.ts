import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

import { fetchNightPlan, fetchTargetDetail } from "@/lib/api";
import { searchKnowledge } from "@/lib/knowledge";

export const tools = {
  planNight: tool({
    description:
      "Rank the catalog of popular deep-sky targets for the upcoming astronomical " +
      "night at an observer location. Returns dark hours, moon illumination, and a " +
      "scored, sorted target list. Use this when the user asks what to observe tonight.",
    inputSchema: z.object({
      lat: z.number().describe("Observer latitude in degrees"),
      lon: z.number().describe("Observer longitude in degrees"),
    }),
    execute: async ({ lat, lon }) => fetchNightPlan(lat, lon),
  }),
  getTargetDetail: tool({
    description:
      "Get detailed night conditions (peak altitude, hours visible, moon separation, " +
      "score, rating) for one named target. Falls back to Simbad for objects outside " +
      "the built-in catalog.",
    inputSchema: z.object({
      name: z.string().describe("Object name, e.g. M31, NGC 7000, Horsehead"),
      lat: z.number().describe("Observer latitude in degrees"),
      lon: z.number().describe("Observer longitude in degrees"),
    }),
    execute: async ({ name, lat, lon }) => fetchTargetDetail(name, lat, lon),
  }),
  searchKnowledge: tool({
    description:
      "Search the AstroScout knowledge base (astronomy literature abstracts) for " +
      "grounded background on deep-sky objects. Use this to explain the science of a " +
      "target and cite real sources instead of relying on memory. Always cite the " +
      "returned titles/bibcodes when you use a passage.",
    inputSchema: z.object({
      query: z.string().describe("What to look up, e.g. 'star formation in the Orion Nebula'"),
      target: z
        .string()
        .optional()
        .describe("Optional catalog name to restrict results, e.g. M42"),
    }),
    execute: async ({ query, target }) => searchKnowledge(query, target),
  }),
};

export type ChatTools = InferUITools<typeof tools>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;
