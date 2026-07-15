"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectPlan } from "@/lib/api";
import { formatHoursRange } from "@/lib/format";

function sessionSummary(project: ProjectPlan): string {
  if (!project.budget_applicable) {
    return "Lucky-imaging target — any clear night works.";
  }
  const finish = project.nights_to_finish;
  if (!finish || finish.high === null) {
    return "Won't finish in 30 nights from this sky — consider narrowband or a darker site.";
  }
  const low = finish.low ?? finish.high;
  return `~${low}–${finish.high} sessions in the next ${project.horizon_nights} nights`;
}

export function ProjectDetailCard({
  project,
  targetName,
  loading,
  error,
  onClose,
}: {
  project: ProjectPlan | null;
  targetName: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const maxUsable = project
    ? Math.max(0.1, ...project.nights.map((night) => night.usable_hours))
    : 0.1;
  const includesContinuousDarkness = project?.nights.some(
    (night) => night.dark_window_status === "continuous_astronomical_darkness",
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{project?.common_name ?? targetName}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">30-night imaging projection</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && (
          <div className="flex flex-col gap-2" aria-label="Loading target projection">
            <div className="bg-muted h-5 w-56 animate-pulse rounded" />
            <div className="bg-muted h-16 w-full animate-pulse rounded" />
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {project && !loading && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={project.budget_applicable ? "marginal" : "good"}>
                {project.hours_needed
                  ? formatHoursRange(project.hours_needed.low, project.hours_needed.high)
                  : "Lucky imaging"}
              </Badge>
              <span>{sessionSummary(project)}</span>
              {project.filter_mismatch && (
                <span
                  className="text-amber-400"
                  title="narrowband filter won't help on this target — estimate assumes broadband"
                >
                  Filter mismatch
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              Best projected night: <strong className="text-foreground">{project.best_night}</strong>
            </p>
            {includesContinuousDarkness && (
              <p className="text-muted-foreground text-xs">
                Polar-night dates use explicit bounded 24-hour planning windows because
                astronomical dusk and dawn do not occur.
              </p>
            )}
            <div>
              <div
                className="flex h-20 items-end gap-1"
                role="img"
                aria-label="Usable imaging hours over the next 30 nights"
              >
                {project.nights.map((night) => (
                  <div
                    key={night.date}
                    className="bg-primary/70 min-w-0 flex-1 rounded-t-sm"
                    style={{
                      height:
                        night.usable_hours === 0
                          ? "0%"
                          : `${Math.max(4, (night.usable_hours / maxUsable) * 100)}%`,
                    }}
                    title={`${night.date}: ${night.usable_hours} usable hours`}
                  />
                ))}
              </div>
              <p className="text-muted-foreground mt-1 flex justify-between text-xs">
                <span>{project.nights[0]?.date}</span>
                <span>{project.nights.at(-1)?.date}</span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
