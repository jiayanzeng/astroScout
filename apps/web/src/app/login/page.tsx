"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to AstroScout</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {sent ? (
            <p className="text-sm">Check your email for a magic link.</p>
          ) : (
            <>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
                placeholder="you@example.com"
              />
              <Button onClick={signIn} disabled={loading}>
                {loading ? "Sending…" : "Send magic link"}
              </Button>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
