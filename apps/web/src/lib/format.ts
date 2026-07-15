import type { Visibility } from "@/lib/api";

export type LightSensitivityTier = "robust" | "moderate" | "fragile";

const BORTLE_LABELS = [
  "excellent-dark",
  "truly dark",
  "rural sky",
  "rural transition",
  "suburban",
  "bright suburban",
  "urban transition",
  "city sky",
  "inner-city",
] as const;

/** Pure presentation helper — unit-tested in CI. */
export function ratingLabel(rating: Visibility["rating"]): string {
  switch (rating) {
    case "good":
      return "Great target tonight";
    case "marginal":
      return "Workable, with caveats";
    case "poor":
      return "Skip it tonight";
    default:
      return "Unknown";
  }
}

/**
 * Map a light_sensitivity value (0=robust, 1=fragile) to a human-readable tier.
 * Thresholds: ≤0.3 → robust, ≤0.6 → moderate, >0.6 → fragile.
 */
export function lightSensitivityTier(sensitivity: number): LightSensitivityTier {
  if (sensitivity <= 0.3) return "robust";
  if (sensitivity <= 0.6) return "moderate";
  return "fragile";
}

/** Format an ISO timestamp in the browser's local time zone. */
export function formatLocalDateTime(value: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function shortTimeZoneName(value: string, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "short" })
      .formatToParts(new Date(value))
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

/** Label the browser/device zone explicitly, including a DST change across the window. */
export function deviceTimeZoneLabel(
  duskUtc: string,
  dawnUtc: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const duskZone = shortTimeZoneName(duskUtc, timeZone);
  const dawnZone = shortTimeZoneName(dawnUtc, timeZone);
  const abbreviation = duskZone === dawnZone ? duskZone : `${duskZone} → ${dawnZone}`;
  return `${timeZone} (${abbreviation})`;
}

/** Return a concise observing-context label for a Bortle class. */
export function bortleLabel(bortle: number): string {
  const normalized = Math.min(9, Math.max(1, Math.round(bortle)));
  return BORTLE_LABELS[normalized - 1];
}

/** Format an honest integration-time range without implying single-value precision. */
export function formatHoursRange(low: number, high: number): string {
  return `~${low}–${high} h`;
}
