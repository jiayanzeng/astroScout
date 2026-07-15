import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { PlanClient } from "@/app/plan/PlanClient";
import type { GearProfile } from "@/lib/supabase/types";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let gearProfiles: GearProfile[] = [];
  let gearProfilesError: string | null = null;
  if (user) {
    const { data, error } = await supabase
      .from("gear_profiles")
      .select("id,user_id,name,f_ratio,filter_kind,created_at")
      .order("created_at", { ascending: false });
    gearProfiles = (data ?? []) as GearProfile[];
    gearProfilesError = error?.message ?? null;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plan an observing night</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Rank targets for your location, sky brightness, and the Moon.
        </p>
      </header>

      {!user && (
        <p className="text-muted-foreground text-sm">
          You can plan without an account. <Link href="/login" className="underline">Sign in</Link>{" "}
          to save sessions and log what you observe.
        </p>
      )}

      <PlanClient
        signedIn={!!user}
        initialGearProfiles={gearProfiles}
        initialGearProfilesError={gearProfilesError}
      />
    </main>
  );
}
