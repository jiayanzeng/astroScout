import { z } from "zod";

export const OBSERVER_CONTEXT_STORAGE_KEY = "astroscout:observer-context";

export const observerContextSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    source: z.enum(["manual", "geolocation", "saved_session"]),
    when: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sessionId: z.string().min(1).optional(),
    label: z.string().min(1).max(80).optional(),
  })
  .strict();

export const optionalObserverContextSchema = observerContextSchema
  .nullish()
  .transform((value) => value ?? null);

export type ObserverContext = z.infer<typeof observerContextSchema>;
export type ObserverLocationSource = ObserverContext["source"];

export function parseObserverContext(value: unknown): ObserverContext | null {
  const parsed = observerContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readObserverContext(
  storage: Pick<Storage, "getItem">,
): ObserverContext | null {
  const serialized = storage.getItem(OBSERVER_CONTEXT_STORAGE_KEY);
  if (!serialized) return null;
  try {
    return parseObserverContext(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function writeObserverContext(
  storage: Pick<Storage, "setItem">,
  context: ObserverContext,
): void {
  storage.setItem(OBSERVER_CONTEXT_STORAGE_KEY, JSON.stringify(observerContextSchema.parse(context)));
}

export function observerSourceLabel(source: ObserverLocationSource): string {
  if (source === "geolocation") return "browser geolocation";
  if (source === "saved_session") return "saved session";
  return "manual coordinates";
}

export function formatObserverContext(context: ObserverContext): string {
  const date = context.when ? ` · ${context.when}` : " · upcoming night";
  return `${context.lat.toFixed(4)}, ${context.lon.toFixed(4)} · ${observerSourceLabel(context.source)}${date}`;
}
