"use client";

import { useEffect, useState, useTransition } from "react";

import { logObservation, saveSession } from "@/app/plan/actions";
import { GearCard } from "@/app/plan/GearCard";
import { ProjectDetailCard } from "@/app/plan/ProjectDetailCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NightPlan, ProjectPlan, RankedTarget } from "@/lib/api";
import {
  bortleLabel,
  deviceTimeZoneLabel,
  formatHoursRange,
  formatLocalDateTime,
  lightSensitivityTier,
  type LightSensitivityTier,
} from "@/lib/format";
import {
  readObserverContext,
  writeObserverContext,
  type ObserverContext,
  type ObserverLocationSource,
} from "@/lib/observer-context";
import {
  aggregateIntegrationMinutes,
  formatIntegrationProgress,
  targetProgressKey,
} from "@/lib/progress";
import type { GearProfile, ObservationProgress } from "@/lib/supabase/types";

const SELECTED_GEAR_STORAGE_KEY = "astroscout:selected-gear-profile";
const SKY_SQM_STORAGE_KEY = "astroscout:sky-sqm";

const LP_TIER_VARIANT: Record<LightSensitivityTier, "good" | "marginal" | "poor"> = {
  robust: "good",
  moderate: "marginal",
  fragile: "poor",
};

const KIND_FILTERS = ["all", "galaxies", "nebulae", "clusters", "planets"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

function matchesKindFilter(target: RankedTarget, filter: KindFilter): boolean {
  if (filter === "all") return true;
  if (filter === "galaxies") return target.kind === "galaxy";
  if (filter === "nebulae") return target.kind.includes("nebula");
  if (filter === "clusters") return target.kind.includes("cluster");
  return target.kind === "planet";
}

function bortleBadgeClass(bortle: number): string {
  if (bortle <= 3) return "border-emerald-400/20 bg-emerald-500/15 text-emerald-300";
  if (bortle <= 6) return "border-amber-400/20 bg-amber-500/15 text-amber-300";
  return "border-rose-400/20 bg-rose-500/15 text-rose-300";
}

function LoadingRows({
  showBudget,
  showProgress,
}: {
  showBudget: boolean;
  showProgress: boolean;
}) {
  return Array.from({ length: 5 }, (_, index) => (
    <tr key={index} className="border-b last:border-0">
      <td className="py-3 pr-3">
        <div className="bg-muted h-4 w-44 animate-pulse rounded" />
      </td>
      <td className="py-3 pr-3">
        <div className="bg-muted h-6 w-16 animate-pulse rounded" />
      </td>
      <td className="py-3 pr-3">
        <div className="bg-muted h-4 w-12 animate-pulse rounded" />
      </td>
      <td className="hidden py-3 pr-3 sm:table-cell">
        <div className="bg-muted h-4 w-12 animate-pulse rounded" />
      </td>
      <td className="py-3 pr-3">
        <div className="bg-muted h-5 w-16 animate-pulse rounded" />
      </td>
      {showBudget && (
        <td className="hidden py-3 pr-3 sm:table-cell">
          <div className="bg-muted h-4 w-20 animate-pulse rounded" />
        </td>
      )}
      {showProgress && (
        <td className="hidden py-3 pr-3 md:table-cell">
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
        </td>
      )}
      {showBudget && (
        <td className="py-3">
          <div className="bg-muted h-7 w-16 animate-pulse rounded" />
        </td>
      )}
    </tr>
  ));
}

export function PlanClient({
  signedIn,
  initialGearProfiles,
  initialGearProfilesError,
  initialObservationProgress,
  initialObservationProgressError,
}: {
  signedIn: boolean;
  initialGearProfiles: GearProfile[];
  initialGearProfilesError: string | null;
  initialObservationProgress: ObservationProgress[];
  initialObservationProgressError: string | null;
}) {
  const [lat, setLat] = useState("-36.85");
  const [lon, setLon] = useState("174.76");
  const [when, setWhen] = useState("");
  const [locationSource, setLocationSource] = useState<ObserverLocationSource>("manual");
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [gearProfiles, setGearProfiles] = useState(initialGearProfiles);
  const [selectedGearProfileId, setSelectedGearProfileId] = useState<string | null>(null);
  const [gearSelectionLoaded, setGearSelectionLoaded] = useState(false);
  const [skySqm, setSkySqm] = useState("");
  const [project, setProject] = useState<ProjectPlan | null>(null);
  const [projectTarget, setProjectTarget] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progressMinutes, setProgressMinutes] = useState<Record<string, number>>(() =>
    aggregateIntegrationMinutes(initialObservationProgress),
  );
  const [integrationInputs, setIntegrationInputs] = useState<Record<string, string>>({});
  const [lastLoggedTarget, setLastLoggedTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const savedId = window.localStorage.getItem(SELECTED_GEAR_STORAGE_KEY);
      if (savedId && initialGearProfiles.some((profile) => profile.id === savedId)) {
        setSelectedGearProfileId(savedId);
      }
      const savedSqm = window.localStorage.getItem(SKY_SQM_STORAGE_KEY);
      if (savedSqm) setSkySqm(savedSqm);
      const observer = readObserverContext(window.localStorage);
      if (observer) {
        setLat(String(observer.lat));
        setLon(String(observer.lon));
        setWhen(observer.when ?? "");
        setLocationSource(observer.source);
      }
      setGearSelectionLoaded(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [initialGearProfiles]);

  useEffect(() => {
    if (!gearSelectionLoaded) return;
    if (selectedGearProfileId) {
      window.localStorage.setItem(SELECTED_GEAR_STORAGE_KEY, selectedGearProfileId);
    } else {
      window.localStorage.removeItem(SELECTED_GEAR_STORAGE_KEY);
    }
    if (skySqm) {
      window.localStorage.setItem(SKY_SQM_STORAGE_KEY, skySqm);
    } else {
      window.localStorage.removeItem(SKY_SQM_STORAGE_KEY);
    }
  }, [gearSelectionLoaded, selectedGearProfileId, skySqm]);

  const selectedGearProfile =
    gearProfiles.find((profile) => profile.id === selectedGearProfileId) ?? null;

  function parsedSkySqm(): number | undefined {
    if (!skySqm.trim()) return undefined;
    const value = Number(skySqm);
    return Number.isFinite(value) && value >= 15 && value <= 22.1 ? value : undefined;
  }

  function validateSkySqm(): number | undefined | null {
    const value = parsedSkySqm();
    if (skySqm.trim() && value === undefined) {
      setError("Measured SQM must be between 15.0 and 22.1.");
      return null;
    }
    return value;
  }

  function selectGear(profileId: string | null) {
    setSelectedGearProfileId(profileId);
    setPlan(null);
    setProject(null);
    setProjectTarget(null);
  }

  function observerContext(
    date: string,
    source: ObserverLocationSource = locationSource,
    sessionId?: string,
  ): ObserverContext | null {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    return {
      lat: latitude,
      lon: longitude,
      source,
      ...(date ? { when: date } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
  }

  function persistObserverContext(
    date: string,
    source: ObserverLocationSource = locationSource,
    sessionId?: string,
  ) {
    const context = observerContext(date, source, sessionId);
    if (context) writeObserverContext(window.localStorage, context);
  }

  async function runPlan(whenOverride?: string) {
    const w = whenOverride ?? when;
    const observer = observerContext(w);
    if (!observer) {
      setError("Latitude must be -90 to 90 and longitude must be -180 to 180.");
      return;
    }
    const sqm = selectedGearProfile ? validateSkySqm() : undefined;
    if (sqm === null) return;
    setLoading(true);
    setError(null);
    setSessionId(null);
    try {
      const params = new URLSearchParams({ lat: String(observer.lat), lon: String(observer.lon) });
      if (w) params.set("when", w);
      if (selectedGearProfile) {
        params.set("f_ratio", String(selectedGearProfile.f_ratio));
        params.set("filter", selectedGearProfile.filter_kind);
        params.set("tier", "clean");
        if (sqm !== undefined) params.set("sqm", String(sqm));
      }
      const res = await fetch(`/api/plan?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setPlan(data as NightPlan);
      writeObserverContext(window.localStorage, observer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadProject(target: RankedTarget) {
    if (!selectedGearProfile) return;
    const sqm = validateSkySqm();
    if (sqm === null) return;
    setProjectTarget(target.name);
    setProject(null);
    setProjectError(null);
    setProjectLoading(true);
    try {
      const params = new URLSearchParams({
        name: target.name,
        lat,
        lon,
        f_ratio: String(selectedGearProfile.f_ratio),
        filter: selectedGearProfile.filter_kind,
        tier: "clean",
        nights: "30",
      });
      if (when) params.set("when", when);
      if (sqm !== undefined) params.set("sqm", String(sqm));
      const response = await fetch(`/api/project?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "request failed");
      setProject(data as ProjectPlan);
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProjectLoading(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Location is not available in this browser. Enter coordinates manually.");
      return;
    }

    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(2));
        setLon(coords.longitude.toFixed(2));
        setLocationSource("geolocation");
        setLocating(false);
      },
      () => {
        setError("We could not access your location. Check permission or enter coordinates.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  function save() {
    startTransition(async () => {
      const result = await saveSession({
        title: `Night plan @ ${lat}, ${lon}`,
        latitude: Number(lat),
        longitude: Number(lon),
      });
      if (result.error) setError(result.error);
      else if (result.id) {
        setSessionId(result.id);
        setLocationSource("saved_session");
        persistObserverContext(when, "saved_session", result.id);
      }
    });
  }

  function log(target: RankedTarget) {
    if (!sessionId) return;
    const rawMinutes = (integrationInputs[target.name] ?? "").trim();
    const minutes = rawMinutes ? Number(rawMinutes) : undefined;
    if (
      minutes !== undefined &&
      (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 0)
    ) {
      setError("Integration minutes must be a non-negative whole number.");
      return;
    }
    setError(null);
    setLastLoggedTarget(null);
    startTransition(async () => {
      const result = await logObservation({
        session_id: sessionId,
        target: target.name,
        score: target.score,
        rating: target.rating,
        ...(minutes === undefined ? {} : { integration_minutes: minutes }),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (minutes !== undefined) {
        const key = targetProgressKey(target.name);
        setProgressMinutes((current) => ({
          ...current,
          [key]: (current[key] ?? 0) + minutes,
        }));
      }
      setIntegrationInputs((current) => ({ ...current, [target.name]: "" }));
      setLastLoggedTarget(target.name);
    });
  }

  const filteredTargets = plan?.targets.filter((target) => matchesKindFilter(target, kindFilter));
  const estimatesShown = plan?.sky_source !== undefined;
  const progressShown = signedIn && estimatesShown;

  return (
    <div className="flex flex-col gap-6">
      {signedIn && (
        <GearCard
          profiles={gearProfiles}
          initialError={initialGearProfilesError}
          selectedProfileId={selectedGearProfileId}
          onProfilesChange={setGearProfiles}
          onSelect={selectGear}
        />
      )}
      {signedIn && initialObservationProgressError && (
        <p className="text-destructive text-sm" role="alert">
          Could not load observation progress: {initialObservationProgressError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plan tonight</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-muted-foreground flex min-w-32 flex-1 flex-col gap-1 text-xs">
              Latitude
              <Input
                value={lat}
                onChange={(event) => {
                  setLat(event.target.value);
                  setLocationSource("manual");
                }}
                inputMode="decimal"
                placeholder="Latitude"
              />
            </label>
            {selectedGearProfile && (
              <label className="text-muted-foreground flex min-w-32 flex-1 flex-col gap-1 text-xs">
                My sky (SQM)
                <Input
                  type="number"
                  min="15"
                  max="22.1"
                  step="0.1"
                  value={skySqm}
                  onChange={(event) => {
                    setSkySqm(event.target.value);
                    setPlan(null);
                    setProject(null);
                    setProjectTarget(null);
                  }}
                  placeholder="Optional"
                />
              </label>
            )}
            <label className="text-muted-foreground flex min-w-32 flex-1 flex-col gap-1 text-xs">
              Longitude
              <Input
                value={lon}
                onChange={(event) => {
                  setLon(event.target.value);
                  setLocationSource("manual");
                }}
                inputMode="decimal"
                placeholder="Longitude"
              />
            </label>
            <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
              {locating ? "Locating…" : "Use my location"}
            </Button>
            <label className="text-muted-foreground flex min-w-40 flex-1 flex-col gap-1 text-xs">
              Observing date
              <Input
                type="date"
                value={when}
                onChange={(event) => {
                  setWhen(event.target.value);
                  if (lat && lon) void runPlan(event.target.value);
                }}
              />
            </label>
            <Button onClick={() => void runPlan()} disabled={loading}>
              {loading ? "Computing…" : "Rank targets"}
            </Button>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      {(plan || loading) && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            {loading || !plan ? (
              <div className="flex flex-1 flex-col gap-2">
                <div className="bg-muted h-5 w-64 animate-pulse rounded" />
                <div className="bg-muted h-3 w-48 animate-pulse rounded" />
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>
                    {plan.dark_hours}h {plan.dark_window_status ? "bounded window" : "dark"} · moon{" "}
                    {Math.round(plan.moon_illumination * 100)}%
                  </CardTitle>
                  {plan.dark_window_status === "continuous_astronomical_darkness" && (
                    <Badge variant="good">Continuous astronomical darkness</Badge>
                  )}
                  <Badge className={bortleBadgeClass(plan.bortle)}>
                    Bortle {plan.bortle}: {bortleLabel(plan.bortle)}
                  </Badge>
                  {estimatesShown && (
                    <Badge variant="poor">
                      {plan.sky_source === "user" && plan.sky_sqm != null
                        ? `your SQM ${plan.sky_sqm.toFixed(1)}`
                        : plan.sky_source === "grid" && plan.sky_sqm != null
                          ? `grid SQM ${plan.sky_sqm.toFixed(1)}`
                          : "Bortle-class sky"}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {plan.dark_window_status === "continuous_astronomical_darkness"
                    ? "Bounded 24-hour planning window: "
                    : "Astronomical dusk to dawn: "}
                  <time dateTime={plan.dusk_utc} title={plan.dusk_utc}>
                    {formatLocalDateTime(plan.dusk_utc)}
                  </time>{" "}
                  →{" "}
                  <time dateTime={plan.dawn_utc} title={plan.dawn_utc}>
                    {formatLocalDateTime(plan.dawn_utc)}
                  </time>{" "}
                  device time · {deviceTimeZoneLabel(plan.dusk_utc, plan.dawn_utc)}
                </p>
              </div>
            )}
            {plan &&
              !loading &&
              signedIn &&
              (sessionId ? (
                <Badge variant="good">Session saved</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={save} disabled={pending}>
                  Save session
                </Button>
              ))}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {plan && !loading && (
              <div className="flex flex-wrap gap-2" aria-label="Filter targets by kind">
                {KIND_FILTERS.map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={kindFilter === filter ? "secondary" : "outline"}
                    aria-pressed={kindFilter === filter}
                    onClick={() => setKindFilter(filter)}
                    className="capitalize"
                  >
                    {filter}
                  </Button>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">Score</th>
                    <th className="py-2 pr-3 font-medium">Peak alt</th>
                    <th className="hidden py-2 pr-3 font-medium sm:table-cell">Hrs up</th>
                    <th className="py-2 pr-3 font-medium">LP sens.</th>
                    {estimatesShown && (
                      <th className="hidden py-2 pr-3 font-medium sm:table-cell">
                        Est. hours (your sky)
                      </th>
                    )}
                    {progressShown && (
                      <th className="hidden py-2 pr-3 font-medium md:table-cell">
                        Recorded progress
                      </th>
                    )}
                    {selectedGearProfile && <th className="py-2 font-medium" />}
                    {sessionId && <th className="py-2 font-medium">Record</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows
                      showBudget={selectedGearProfile !== null}
                      showProgress={signedIn && selectedGearProfile !== null}
                    />
                  ) : filteredTargets?.length ? (
                    filteredTargets.map((target, index) => (
                      <tr
                        key={target.name}
                        className={index === 0 ? "bg-accent/40 border-b" : "border-b last:border-0"}
                      >
                        <td className="min-w-56 py-2 pr-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={target.rating}>{target.rating}</Badge>
                            <span className="font-medium">{target.common_name}</span>
                            <span className="text-muted-foreground text-xs">
                              {target.name} · {target.kind}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          <div className="bg-muted/60 relative h-7 min-w-20 overflow-hidden rounded">
                            <div
                              className="bg-primary/10 absolute inset-y-0 left-0"
                              style={{ width: `${Math.max(0, Math.min(100, target.score))}%` }}
                            />
                            <span className="relative flex h-full items-center px-2">
                              {target.score}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3">{target.peak_altitude_deg}°</td>
                        <td className="hidden py-2 pr-3 sm:table-cell">
                          {target.hours_visible}h
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <Badge
                            variant={
                              LP_TIER_VARIANT[lightSensitivityTier(target.light_sensitivity)]
                            }
                            title={`Light pollution sensitivity: ${target.light_sensitivity.toFixed(2)} (0=robust, 1=fragile)`}
                          >
                            {lightSensitivityTier(target.light_sensitivity)}
                          </Badge>
                        </td>
                        {estimatesShown && (
                          <td className="hidden py-2 pr-3 whitespace-nowrap sm:table-cell">
                            {target.budget_applicable === false ? (
                              <span title="lucky imaging — integration budgeting doesn't apply">
                                n/a
                              </span>
                            ) : target.hours_needed_low != null &&
                              target.hours_needed_high != null ? (
                              <span>
                                {formatHoursRange(
                                  target.hours_needed_low,
                                  target.hours_needed_high,
                                )}
                                {target.filter_mismatch && (
                                  <span
                                    className="ml-1 text-amber-400"
                                    title="narrowband filter won't help on this target — estimate assumes broadband"
                                  >
                                    !
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {progressShown && (
                          <td className="text-muted-foreground hidden py-2 pr-3 text-xs md:table-cell">
                            {formatIntegrationProgress(
                              progressMinutes[targetProgressKey(target.name)] ?? 0,
                              target.hours_needed_low,
                              target.hours_needed_high,
                            )}
                          </td>
                        )}
                        {selectedGearProfile && (
                          <td className="py-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={projectLoading && projectTarget === target.name}
                              onClick={() => void loadProject(target)}
                            >
                              {projectLoading && projectTarget === target.name
                                ? "Projecting…"
                                : "Details"}
                            </Button>
                          </td>
                        )}
                        {sessionId && (
                          <td className="py-2">
                            <div className="flex min-w-40 items-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={integrationInputs[target.name] ?? ""}
                                onChange={(event) =>
                                  setIntegrationInputs((current) => ({
                                    ...current,
                                    [target.name]: event.target.value,
                                  }))
                                }
                                placeholder="min"
                                aria-label={`Integration minutes for ${target.name}`}
                                className="h-8 w-20"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => log(target)}
                                disabled={pending}
                              >
                                {pending ? "Saving…" : "Log"}
                              </Button>
                              {lastLoggedTarget === target.name && (
                                <span className="text-emerald-300 text-xs">Logged</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={
                          5 +
                          (estimatesShown ? 1 : 0) +
                          (progressShown ? 1 : 0) +
                          (selectedGearProfile ? 1 : 0) +
                          (sessionId ? 1 : 0)
                        }
                        className="text-muted-foreground py-8 text-center"
                      >
                        No targets match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {estimatesShown && (
              <p className="text-muted-foreground text-xs">
                Sky estimate from the World Atlas 2015 satellite survey at ~27 km cells —
                dense city cores can read darker than reality; enter your measured SQM to
                refine. Hours are community-anchored ranges, not promises.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {projectTarget && (
        <ProjectDetailCard
          project={project}
          targetName={projectTarget}
          loading={projectLoading}
          error={projectError}
          onClose={() => {
            setProjectTarget(null);
            setProject(null);
            setProjectError(null);
          }}
        />
      )}
    </div>
  );
}
