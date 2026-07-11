import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import "./globals.css";

export const metadata: Metadata = {
  title: "AstroScout",
  description: "Plan tonight's deep-sky targets — and understand why.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh antialiased">
        <header className="bg-background/90 sticky top-0 z-50 border-b backdrop-blur">
          <div className="mx-auto flex h-12 max-w-5xl items-center gap-1 px-3 text-sm sm:gap-3 sm:px-4">
            <Link href="/plan" className="shrink-0 font-semibold tracking-tight">
              AstroScout
            </Link>
            <nav aria-label="Primary" className="flex min-w-0 items-center">
              <Link
                href="/plan"
                className="text-muted-foreground hover:text-foreground rounded-md px-1.5 py-2 transition-colors sm:px-2.5"
              >
                Plan
              </Link>
              <Link
                href="/sessions"
                className="text-muted-foreground hover:text-foreground rounded-md px-1.5 py-2 transition-colors sm:px-2.5"
              >
                Sessions
              </Link>
              <Link
                href="/chat"
                className="text-muted-foreground hover:text-foreground rounded-md px-1.5 py-2 transition-colors sm:px-2.5"
              >
                Chat
              </Link>
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              {user ? (
                <>
                  <span className="text-muted-foreground hidden max-w-40 truncate sm:inline">
                    {user.email}
                  </span>
                  <form action="/auth/signout" method="post">
                    <Button size="sm" variant="ghost" type="submit">
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
