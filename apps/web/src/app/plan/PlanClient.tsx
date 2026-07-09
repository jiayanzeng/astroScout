"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NightPlan, RankedTarget } from "@/lib/api";
import { lightSensitivityTier } from "@/lib/format";
import type { LightSensitivityTier } from "@/lib/format";
import { logObservation, saveSession } from "@/app/plan/actions";

const LP_TIER_VARIANT: Record<LightSensitivityTier, "good" | "marginal" | "poor"> = {
  robust: "good",
  moderate: "marginal",
  fragile: "poor",
};

export function PlanClient({ signedIn }: { signedIn: boolean }) {
  const [lat, setLat] = useState("-36.85");
  const [lon, setLon] = useState("174.76");
  const [when, setWhen] = useState("");
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    startTransition(async () => {
      const r = await saveSession({
        title: `Night plan @ ${lat}, ${lon}`,
        latitude: Number(lat),
        longitude: Number(lon),
      });
      if (r.error) setError(r.error);
      else if (r.id) setSessionId(r.id);
    });
  }

  function log(t: RankedTarget) {
    if (!sessionId) return;
    startTransition(async () => {
      const r = await logObservation({
        session_id: sessionId,
        target: t.name,
        score: t.score,
        rating: t.rating,
      });
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Plan tonight</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
            <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" />
            <Input
              type="date"
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                if (lat && lon) runPlan(e.target.value);
              }}
            />
            <Button onClick={() => runPlan()} disabled={loading}>
              {loading ? "Computing…" : "Rank targets"}
            </Button>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>
                {plan.dark_hours}h dark · moon {Math.round(plan.moon_illumination * 100)}% · Bortle {plan.bortle}
              </CardTitle>
              <p className="text-muted-foreground text-xs mt-1">
                {plan.dusk_utc.slice(0, 16)} → {plan.dawn_utc.slice(0, 16)} UTC
              </p>
            </div>
            {signedIn &&
              (sessionId ? (
                <Badge variant="good">Session saved</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={save} disabled={pending}>
                  Save session
                </Button>
              ))}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">Score</th>
                    <th className="py-2 pr-3 font-medium">Peak alt</th>
                    <th className="py-2 pr-3 font-medium">Hrs up</th>
                    <th className="py-2 pr-3 font-medium">LP sens.</th>
                    {sessionId && <th className="py-2 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {plan.targets.map((t) => (
                    <tr key={t.name} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={t.rating}>{t.rating}</Badge>
                          <span className="font-medium">{t.common_name}</span>
                          <span className="text-muted-foreground text-xs">
                            {t.name} · {t.kind}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono">{t.score}</td>
                      <td className="py-2 pr-3">{t.peak_altitude_deg}°</td>
                      <td className="py-2 pr-3">{t.hours_visible}h</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Badge
                          variant={LP_TIER_VARIANT[lightSensitivityTier(t.light_sensitivity)]}
                          title={`Light pollution sensitivity: ${t.light_sensitivity.toFixed(2)} (0=robust, 1=fragile)`}
                        >
                          {lightSensitivityTier(t.light_sensitivity)}
                        </Badge>
                      </td>
                      {sessionId && (
                        <td className="py-2">
                          <Button size="sm" variant="ghost" onClick={() => log(t)} disabled={pending}>
                            Log
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
