"use client";

import { useEffect, useState, useTransition } from "react";

import { logObservation, saveSession } from "@/app/plan/actions";
import { GearCard } from "@/app/plan/GearCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NightPlan, RankedTarget } from "@/lib/api";
import {
  bortleLabel,
  formatLocalDateTime,
  lightSensitivityTier,
  type LightSensitivityTier,
} from "@/lib/format";
import type { GearProfile } from "@/lib/supabase/types";

const SELECTED_GEAR_STORAGE_KEY = "astroscout:selected-gear-profile";

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

function LoadingRows() {
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
    </tr>
  ));
}

export function PlanClient({
  signedIn,
  initialGearProfiles,
}: {
  signedIn: boolean;
  initialGearProfiles: GearProfile[];
}) {
  const [lat, setLat] = useState("-36.85");
  const [lon, setLon] = useState("174.76");
  const [when, setWhen] = useState("");
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [gearProfiles, setGearProfiles] = useState(initialGearProfiles);
  const [selectedGearProfileId, setSelectedGearProfileId] = useState<string | null>(null);
  const [gearSelectionLoaded, setGearSelectionLoaded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
  }, [gearSelectionLoaded, selectedGearProfileId]);

  async function runPlan(whenOverride?: string) {
    const w = whenOverride ?? when;
    setLoading(true);
    setError(null);
    setSessionId(null);
    try {
      const params = new URLSearchParams({ lat, lon });
      if (w) params.set("when", w);
      const res = await fetch(`/api/plan?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setPlan(data as NightPlan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPlan(null);
    } finally {
      setLoading(false);
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
      else if (result.id) setSessionId(result.id);
    });
  }

  function log(target: RankedTarget) {
    if (!sessionId) return;
    startTransition(async () => {
      const result = await logObservation({
        session_id: sessionId,
        target: target.name,
        score: target.score,
        rating: target.rating,
      });
      if (result.error) setError(result.error);
    });
  }

  const filteredTargets = plan?.targets.filter((target) => matchesKindFilter(target, kindFilter));

  return (
    <div className="flex flex-col gap-6">
      {signedIn && (
        <GearCard
          profiles={gearProfiles}
          selectedProfileId={selectedGearProfileId}
          onProfilesChange={setGearProfiles}
          onSelect={setSelectedGearProfileId}
        />
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
                onChange={(event) => setLat(event.target.value)}
                inputMode="decimal"
                placeholder="Latitude"
              />
            </label>
            <label className="text-muted-foreground flex min-w-32 flex-1 flex-col gap-1 text-xs">
              Longitude
              <Input
                value={lon}
                onChange={(event) => setLon(event.target.value)}
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
                    {plan.dark_hours}h dark · moon {Math.round(plan.moon_illumination * 100)}%
                  </CardTitle>
                  <Badge className={bortleBadgeClass(plan.bortle)}>
                    Bortle {plan.bortle}: {bortleLabel(plan.bortle)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  <time dateTime={plan.dusk_utc} title={plan.dusk_utc}>
                    {formatLocalDateTime(plan.dusk_utc)}
                  </time>{" "}
                  →{" "}
                  <time dateTime={plan.dawn_utc} title={plan.dawn_utc}>
                    {formatLocalDateTime(plan.dawn_utc)}
                  </time>{" "}
                  local time
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
                    {sessionId && <th className="py-2 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows />
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
                        {sessionId && (
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => log(target)}
                              disabled={pending}
                            >
                              Log
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={sessionId ? 6 : 5} className="text-muted-foreground py-8 text-center">
                        No targets match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
