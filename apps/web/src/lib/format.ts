import type { Visibility } from "@/lib/api";

export type LightSensitivityTier = "robust" | "moderate" | "fragile";

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
