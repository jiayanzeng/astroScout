"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NightPlan, RankedTarget } from "@/lib/api";
import { logObservation, saveSession } from "@/app/plan/actions";

export function PlanClient({ signedIn }: { signedIn: boolean }) {
  const [lat, setLat] = useState("-36.85");
  const [lon, setLon] = useState("174.76");
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function runPlan() {
    setLoading(true);
    setError(null);
    setSessionId(null);
    try {
      const params = new URLSearchParams({ lat, lon });
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
          <div className="flex gap-3">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
            <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" />
            <Button onClick={runPlan} disabled={loading}>
              {loading ? "Computing…" : "Rank targets"}
            </Button>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {plan.dark_hours}h dark · moon {Math.round(plan.moon_illumination * 100)}% · Bortle {plan.bortle}
            </CardTitle>
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
                    <th className="py-2 pr-3 font-medium">Moon sep</th>
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
                      <td className="py-2 pr-3">{t.moon_separation_deg}°</td>
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
