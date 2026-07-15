import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/supabase/types";

export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("*")
    .order("planned_for", { ascending: false });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your sessions</h1>
        <Link href="/plan" className="text-sm underline underline-offset-4">
          ← Plan
        </Link>
      </header>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          Could not load sessions: {error.message}
        </p>
      ) : !sessions?.length ? (
        <p className="text-muted-foreground text-sm">
          No saved sessions yet. Plan a night and hit “Save session”.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {!error && sessions?.map((s: Session) => (
          <Link key={s.id} href={`/sessions/${s.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {s.planned_for} · {s.latitude}, {s.longitude}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
