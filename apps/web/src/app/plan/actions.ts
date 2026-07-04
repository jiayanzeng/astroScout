"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function saveSession(input: {
  title: string;
  latitude: number;
  longitude: number;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("sessions")
    .insert({ ...input, user_id: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/sessions");
  return { id: data.id };
}

export async function logObservation(input: {
  session_id: string;
  target: string;
  score: number | null;
  rating: "poor" | "marginal" | "good" | null;
  notes?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("logged_observations")
    .insert({ ...input, user_id: user.id });

  if (error) return { error: error.message };
  revalidatePath(`/sessions/${input.session_id}`);
  return {};
}
