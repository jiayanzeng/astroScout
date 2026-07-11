"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { GearProfile } from "@/lib/supabase/types";

type GearFilterKind = GearProfile["filter_kind"];

const GEAR_FILTER_KINDS: ReadonlySet<string> = new Set([
  "broadband",
  "dual_nb",
  "mono_nb",
]);

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

export async function createGearProfile(input: {
  name: string;
  f_ratio: number;
  filter_kind: GearFilterKind;
}): Promise<{ profile?: GearProfile; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const name = input.name.trim();
  if (!name) return { error: "Profile name is required" };
  if (!Number.isFinite(input.f_ratio) || input.f_ratio <= 0 || input.f_ratio > 32) {
    return { error: "Focal ratio must be greater than 0 and at most 32" };
  }
  if (!GEAR_FILTER_KINDS.has(input.filter_kind)) {
    return { error: "Invalid filter kind" };
  }

  const { data, error } = await supabase
    .from("gear_profiles")
    .insert({ ...input, name, user_id: user.id })
    .select("id,user_id,name,f_ratio,filter_kind,created_at")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/plan");
  return { profile: data as GearProfile };
}

export async function deleteGearProfile(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("gear_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/plan");
  return {};
}
