"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, type ActionResult } from "@/lib/action-result";
import {
  createGearProfileInputSchema,
  deleteGearProfileInputSchema,
  logObservationInputSchema,
  saveSessionInputSchema,
  type CreateGearProfileInput,
  type LogObservationInput,
  type SaveSessionInput,
} from "@/lib/action-validation";
import { createClient } from "@/lib/supabase/server";
import type { GearProfile } from "@/lib/supabase/types";

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function saveSession(
  input: SaveSessionInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = saveSessionInputSchema.safeParse(input);
  if (!parsed.success) return actionFailure("validation_error", "Invalid session details");

  const { supabase, user } = await authenticatedUser();
  if (!user) return actionFailure("auth_required", "Not signed in");

  const { data, error } = await supabase
    .from("sessions")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .maybeSingle();

  if (error) return actionFailure("database_error", "Could not save session");
  if (!data) return actionFailure("no_affected_rows", "Session was not created");
  // Revalidating from this server action remounts the active /plan client tree, which
  // discards the successful ranking before it can bind the returned session id. Session
  // pages are authenticated dynamic renders and read the inserted row on navigation.
  return { status: "success", data: { id: data.id } };
}

export async function logObservation(
  input: LogObservationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = logObservationInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure("validation_error", "Invalid observation details");
  }

  const { supabase, user } = await authenticatedUser();
  if (!user) return actionFailure("auth_required", "Not signed in");

  const { data, error } = await supabase
    .from("logged_observations")
    .insert({
      ...parsed.data,
      notes: parsed.data.notes || null,
      integration_minutes: parsed.data.integration_minutes ?? null,
      user_id: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return actionFailure("database_error", "Could not log observation");
  if (!data) return actionFailure("no_affected_rows", "Observation was not created");
  // Keep the planner mounted so its local progress update and "Logged" acknowledgement
  // survive. The session detail reads current owner data when it is opened.
  return { status: "success", data: { id: data.id } };
}

export async function createGearProfile(
  input: CreateGearProfileInput,
): Promise<ActionResult<{ profile: GearProfile }>> {
  const parsed = createGearProfileInputSchema.safeParse(input);
  if (!parsed.success) return actionFailure("validation_error", "Invalid gear profile");

  const { supabase, user } = await authenticatedUser();
  if (!user) return actionFailure("auth_required", "Not signed in");

  const { data, error } = await supabase
    .from("gear_profiles")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id,user_id,name,f_ratio,filter_kind,created_at")
    .maybeSingle();

  if (error) return actionFailure("database_error", "Could not save gear profile");
  if (!data) return actionFailure("no_affected_rows", "Gear profile was not created");
  revalidatePath("/plan");
  return { status: "success", data: { profile: data as GearProfile } };
}

export async function deleteGearProfile(id: string): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteGearProfileInputSchema.safeParse(id);
  if (!parsed.success) return actionFailure("validation_error", "Invalid gear profile id");

  const { supabase, user } = await authenticatedUser();
  if (!user) return actionFailure("auth_required", "Not signed in");

  const { data, error } = await supabase
    .from("gear_profiles")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return actionFailure("database_error", "Could not delete gear profile");
  if (!data) {
    return actionFailure("no_affected_rows", "Gear profile was not found or already deleted");
  }
  revalidatePath("/plan");
  return { status: "success", data: { id: data.id } };
}
