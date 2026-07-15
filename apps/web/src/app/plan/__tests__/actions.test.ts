import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createGearProfile,
  deleteGearProfile,
  logObservation,
  saveSession,
} from "@/app/plan/actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const GEAR_ID = "33333333-3333-4333-8333-333333333333";

function clientWithBuilder(builder: Record<string, unknown>) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
    },
    from: vi.fn().mockReturnValue(builder),
  };
}

function mutationBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["insert", "delete", "eq", "select"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

describe("validated plan server actions", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it("persists the exact future planned_for date and owner coordinates", async () => {
    const builder = mutationBuilder({ data: { id: SESSION_ID }, error: null });
    mocks.createClient.mockResolvedValue(clientWithBuilder(builder));

    const result = await saveSession({
      title: "Future Auckland plan",
      latitude: -36.85,
      longitude: 174.76,
      planned_for: "2026-08-15",
    });

    expect(result).toEqual({ status: "success", data: { id: SESSION_ID } });
    expect(builder.insert).toHaveBeenCalledWith({
      title: "Future Auckland plan",
      latitude: -36.85,
      longitude: 174.76,
      planned_for: "2026-08-15",
      user_id: USER_ID,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps the active planner mounted after logging an observation", async () => {
    const observationId = "44444444-4444-4444-8444-444444444444";
    const builder = mutationBuilder({ data: { id: observationId }, error: null });
    mocks.createClient.mockResolvedValue(clientWithBuilder(builder));

    const result = await logObservation({
      session_id: SESSION_ID,
      target: "M42",
      score: 45.9,
      rating: "good",
      integration_minutes: 120,
    });

    expect(result).toEqual({ status: "success", data: { id: observationId } });
    expect(builder.insert).toHaveBeenCalledWith({
      session_id: SESSION_ID,
      target: "M42",
      score: 45.9,
      rating: "good",
      integration_minutes: 120,
      notes: null,
      user_id: USER_ID,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [
      "session",
      () =>
        saveSession({
          title: "x".repeat(121),
          latitude: -36.85,
          longitude: 174.76,
          planned_for: "2026-08-15",
        }),
    ],
    [
      "observation",
      () =>
        logObservation({
          session_id: SESSION_ID,
          target: "x".repeat(81),
          score: 50,
          rating: "good",
        }),
    ],
    [
      "gear",
      () =>
        createGearProfile({
          name: "rig",
          f_ratio: Number.POSITIVE_INFINITY,
          filter_kind: "broadband",
        }),
    ],
    ["delete", () => deleteGearProfile("not-a-uuid")],
  ])("rejects invalid %s input before Supabase access", async (_name, call) => {
    await expect(call()).resolves.toMatchObject({ status: "validation_error" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("does not report a zero-row gear delete as success", async () => {
    const builder = mutationBuilder({ data: null, error: null });
    mocks.createClient.mockResolvedValue(clientWithBuilder(builder));

    const result = await deleteGearProfile(GEAR_ID);

    expect(result).toEqual({
      status: "no_affected_rows",
      error: "Gear profile was not found or already deleted",
    });
    expect(builder.select).toHaveBeenCalledWith("id");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("distinguishes database failure from validation and no-op outcomes", async () => {
    const builder = mutationBuilder({ data: null, error: new Error("database unavailable") });
    mocks.createClient.mockResolvedValue(clientWithBuilder(builder));

    await expect(
      logObservation({
        session_id: SESSION_ID,
        target: "M42",
        score: 21.1,
        rating: "marginal",
        integration_minutes: 60,
      }),
    ).resolves.toEqual({ status: "database_error", error: "Could not log observation" });
  });
});
