import type { ObservationProgress } from "@/lib/supabase/types";

export function targetProgressKey(target: string): string {
  return target.trim().replace(/\s+/g, " ").toUpperCase();
}

export function aggregateIntegrationMinutes(
  rows: readonly ObservationProgress[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    if (
      !row.target.trim() ||
      !Number.isFinite(row.integration_minutes) ||
      row.integration_minutes < 0
    ) {
      continue;
    }
    const key = targetProgressKey(row.target);
    totals[key] = (totals[key] ?? 0) + row.integration_minutes;
  }
  return totals;
}

export function formatIntegrationProgress(
  minutes: number,
  modeledLowHours?: number | null,
  modeledHighHours?: number | null,
): string {
  const hours = Math.max(0, minutes) / 60;
  const recorded = hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;
  if (
    modeledLowHours == null ||
    modeledHighHours == null ||
    modeledLowHours <= 0 ||
    modeledHighHours <= 0
  ) {
    return `${recorded} logged`;
  }
  const lowerPercent = Math.round((hours / modeledHighHours) * 100);
  const upperPercent = Math.round((hours / modeledLowHours) * 100);
  return `${recorded} logged · ${lowerPercent}–${upperPercent}% of modeled range`;
}
