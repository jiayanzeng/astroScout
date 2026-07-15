"use client";

import { type FormEvent, useState, useTransition } from "react";

import { createGearProfile, deleteGearProfile } from "@/app/plan/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GearProfile } from "@/lib/supabase/types";

const FILTER_LABELS: Record<GearProfile["filter_kind"], string> = {
  broadband: "Broadband / OSC",
  dual_nb: "Dual narrowband",
  mono_nb: "Mono narrowband",
};

type GearCardProps = {
  profiles: GearProfile[];
  initialError: string | null;
  selectedProfileId: string | null;
  onProfilesChange: (profiles: GearProfile[]) => void;
  onSelect: (profileId: string | null) => void;
};

export function GearCard({
  profiles,
  initialError,
  selectedProfileId,
  onProfilesChange,
  onSelect,
}: GearCardProps) {
  const [name, setName] = useState("");
  const [fRatio, setFRatio] = useState("5.0");
  const [filterKind, setFilterKind] = useState<GearProfile["filter_kind"]>("broadband");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGearProfile({
        name,
        f_ratio: Number(fRatio),
        filter_kind: filterKind,
      });
      if (result.status !== "success") {
        setError(result.error);
        return;
      }
      onProfilesChange([result.data.profile, ...profiles]);
      onSelect(result.data.profile.id);
      setName("");
    });
  }

  function remove(profile: GearProfile) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGearProfile(profile.id);
      if (result.status !== "success") {
        setError(result.error);
        return;
      }
      onProfilesChange(profiles.filter((item) => item.id !== profile.id));
      if (selectedProfileId === profile.id) onSelect(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imaging gear</CardTitle>
        <p className="text-muted-foreground text-sm">
          Save the focal ratio and filter inputs used by integration-time estimates.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="text-muted-foreground flex flex-col gap-1 text-xs">
          Active profile
          <select
            value={selectedProfileId ?? ""}
            onChange={(event) => onSelect(event.target.value || null)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">No profile selected</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · f/{profile.f_ratio} · {FILTER_LABELS[profile.filter_kind]}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Profile name
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Widefield rig"
            />
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Focal ratio
            <Input
              required
              type="number"
              min="0.1"
              max="32"
              step="0.1"
              value={fRatio}
              onChange={(event) => setFRatio(event.target.value)}
            />
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Filter
            <select
              value={filterKind}
              onChange={(event) =>
                setFilterKind(event.target.value as GearProfile["filter_kind"])
              }
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              {Object.entries(FILTER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add gear"}
          </Button>
        </form>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            Could not load or save gear profiles: {error}
          </p>
        )}

        {profiles.length > 0 ? (
          <ul className="divide-border divide-y">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                <span className="min-w-32 flex-1 text-sm font-medium">{profile.name}</span>
                <Badge variant={selectedProfileId === profile.id ? "good" : "poor"}>
                  f/{profile.f_ratio}
                </Badge>
                <Badge variant="poor">{FILTER_LABELS[profile.filter_kind]}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(profile)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : !error ? (
          <p className="text-muted-foreground text-sm">No gear profiles yet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
