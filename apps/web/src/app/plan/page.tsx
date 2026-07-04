import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PlanClient } from "@/app/plan/PlanClient";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">AstroScout</h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/chat" className="underline underline-offset-4">
            Copilot
          </Link>
          {user ? (
            <>
              <Link href="/sessions" className="underline underline-offset-4">
                Sessions
              </Link>
              <form action="/auth/signout" method="post">
                <Button size="sm" variant="ghost" type="submit">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      {!user && (
        <p className="text-muted-foreground text-sm">
          You can plan without an account. <Link href="/login" className="underline">Sign in</Link>{" "}
          to save sessions and log what you observe.
        </p>
      )}

      <PlanClient signedIn={!!user} />
    </main>
  );
}
