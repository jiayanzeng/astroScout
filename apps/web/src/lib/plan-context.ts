import { z } from "zod";

import { isoCalendarDateSchema } from "@/lib/action-validation";
import type { NightPlan } from "@/lib/api";
import {
  observerSourceLabel,
  type ObserverContext,
  type ObserverLocationSource,
} from "@/lib/observer-context";

const planGearContextSchema = z
  .object({
    profileId: z.string().min(1).max(100),
    profileName: z.string().min(1).max(80),
    fRatio: z.number().finite().gt(0).max(32),
    filter: z.enum(["broadband", "dual_nb", "mono_nb"]),
    tier: z.enum(["clean", "showcase"]),
    sqm: z.number().finite().min(15).max(22.1).nullable(),
  })
  .strict();

export const planRequestInputSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    when: isoCalendarDateSchema.nullable(),
    source: z.enum(["manual", "geolocation", "saved_session"]),
    gear: planGearContextSchema.nullable(),
  })
  .strict();

export const planRequestContextSchema = planRequestInputSchema.extend({
  plannedFor: isoCalendarDateSchema,
});

export type PlanRequestInput = z.infer<typeof planRequestInputSchema>;
export type PlanRequestContext = z.infer<typeof planRequestContextSchema>;

function freezeRequest<T extends PlanRequestInput>(request: T): Readonly<T> {
  if (request.gear) Object.freeze(request.gear);
  return Object.freeze(request);
}

export function parsePlanRequestInput(value: unknown): Readonly<PlanRequestInput> | null {
  const parsed = planRequestInputSchema.safeParse(value);
  return parsed.success ? freezeRequest(parsed.data) : null;
}

export function createPlanRequestContext(
  request: PlanRequestInput,
  plan: Pick<NightPlan, "dusk_utc">,
): Readonly<PlanRequestContext> {
  const normalized = planRequestInputSchema.parse(request);
  const plannedFor = normalized.when ?? plan.dusk_utc.slice(0, 10);
  const context = planRequestContextSchema.parse({ ...normalized, plannedFor });
  return freezeRequest(context);
}

export function planRequestMatchesContext(
  context: PlanRequestContext,
  request: PlanRequestInput | null,
): boolean {
  if (!request) return false;
  if (
    context.lat !== request.lat ||
    context.lon !== request.lon ||
    context.when !== request.when ||
    context.source !== request.source
  ) {
    return false;
  }
  if (context.gear === null || request.gear === null) return context.gear === request.gear;
  return (
    context.gear.profileId === request.gear.profileId &&
    context.gear.profileName === request.gear.profileName &&
    context.gear.fRatio === request.gear.fRatio &&
    context.gear.filter === request.gear.filter &&
    context.gear.tier === request.gear.tier &&
    context.gear.sqm === request.gear.sqm
  );
}

export function planSearchParams(request: PlanRequestInput): URLSearchParams {
  const params = new URLSearchParams({ lat: String(request.lat), lon: String(request.lon) });
  if (request.when) params.set("when", request.when);
  if (request.gear) {
    params.set("f_ratio", String(request.gear.fRatio));
    params.set("filter", request.gear.filter);
    params.set("tier", request.gear.tier);
    if (request.gear.sqm !== null) params.set("sqm", String(request.gear.sqm));
  }
  return params;
}

export function projectSearchParams(
  context: PlanRequestContext,
  target: string,
  nights = 30,
): URLSearchParams | null {
  if (!context.gear) return null;
  const params = planSearchParams(context);
  params.set("name", target);
  params.set("nights", String(nights));
  return params;
}

export function observerContextFromPlan(
  context: PlanRequestContext,
  options?: { source?: ObserverLocationSource; sessionId?: string },
): ObserverContext {
  return {
    lat: context.lat,
    lon: context.lon,
    source: options?.source ?? context.source,
    ...(context.when ? { when: context.when } : {}),
    ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
  };
}

export function formatPlanRequestContext(context: PlanRequestContext): string {
  const date = context.when ?? `${context.plannedFor} (upcoming-night request)`;
  const gear = context.gear
    ? ` · ${context.gear.profileName} · f/${context.gear.fRatio} · ${context.gear.filter}${
        context.gear.sqm === null ? "" : ` · SQM ${context.gear.sqm}`
      }`
    : " · no gear profile";
  return `${context.lat.toFixed(4)}, ${context.lon.toFixed(4)} · ${date} · ${observerSourceLabel(context.source)}${gear}`;
}
