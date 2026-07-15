import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { LoggedObservation, Session } from "@/lib/supabase/types";

export default async function SessionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle<Session>();
  if (sessionError) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
        <Link href="/sessions" className="text-sm underline underline-offset-4">
          ← Sessions
        </Link>
        <p className="text-destructive text-sm" role="alert">
          Could not load session: {sessionError.message}
        </p>
      </main>
    );
  }
  if (!session) notFound();

  const { data: observations, error: observationsError } = await supabase
    .from("logged_observations")
    .select("*")
    .eq("session_id", id)
    .order("observed_at", { ascending: false });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
        <Link href="/sessions" className="text-sm underline underline-offset-4">
          ← Sessions
        </Link>
      </header>
      <p className="text-muted-foreground text-sm">
        {session.planned_for} · {session.latitude}, {session.longitude}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logged observations</CardTitle>
        </CardHeader>
        <CardContent>
          {observationsError ? (
            <p className="text-destructive text-sm" role="alert">
              Could not load observations: {observationsError.message}
            </p>
          ) : !observations?.length ? (
            <p className="text-muted-foreground text-sm">
              Nothing logged yet. Go to the plan and hit “Log” on targets you observed.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {observations.map((o: LoggedObservation) => (
                <li key={o.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                  {o.rating && <Badge variant={o.rating}>{o.rating}</Badge>}
                  <span className="font-medium">{o.target}</span>
                  {o.score != null && (
                    <span className="text-muted-foreground font-mono text-xs">{o.score}</span>
                  )}
                  {o.integration_minutes != null && (
                    <span className="text-muted-foreground text-xs">
                      {o.integration_minutes} min integration
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(o.observed_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
