import type { Visibility } from "@/lib/api";

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
