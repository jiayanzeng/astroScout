const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export type Visibility = {
  target: string;
  altitude_deg: number;
  azimuth_deg: number;
  is_up: boolean;
  next_transit_utc: string;
  moon_illumination: number;
  rating: "poor" | "marginal" | "good";
};

export type RankedTarget = {
  name: string;
  common_name: string;
  kind: string;
  score: number;
  rating: "poor" | "marginal" | "good";
  peak_altitude_deg: number;
  hours_visible: number;
  moon_separation_deg: number;
  light_sensitivity: number;
  hours_needed_low?: number | null;
  hours_needed_high?: number | null;
  filter_mismatch?: boolean | null;
  budget_applicable?: boolean;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type NightPlan = {
  dusk_utc: string;
  dawn_utc: string;
  dark_hours: number;
  moon_illumination: number;
  bortle: number;
  sky_sqm?: number | null;
  sky_source?: "user" | "grid" | "bortle-class";
  dark_window_status?: "continuous_astronomical_darkness";
  targets: RankedTarget[];
};

export type GearPlanParams = {
  f_ratio: number;
  filter: "broadband" | "dual_nb" | "mono_nb";
  tier?: "clean" | "showcase";
  sqm?: number;
};

export type ProjectNight = {
  date: string;
  dusk_utc: string;
  dawn_utc: string;
  dark_hours: number;
  moon_illumination: number;
  moon_separation_deg: number;
  hours_visible: number;
  usable_hours: number;
  dark_window_status?: "continuous_astronomical_darkness";
};

export type ProjectPlan = {
  target: string;
  common_name: string;
  kind: string;
  bortle: number;
  sky_sqm: number | null;
  sky_source: "user" | "grid" | "bortle-class";
  filter_kind: GearPlanParams["filter"];
  tier: "clean" | "showcase";
  f_ratio: number;
  hours_needed: { low: number; high: number } | null;
  filter_mismatch: boolean | null;
  budget_applicable: boolean;
  nights: ProjectNight[];
  nights_to_finish: { low: number | null; high: number | null } | null;
  horizon_nights: number;
  best_night: string;
};

export type TargetDetail = Omit<NightPlan, "targets" | "dusk_utc" | "dawn_utc"> &
  RankedTarget & { dark_hours: number };

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    let message = `API ${res.status}: ${body}`;
    let detail: unknown;
    try {
      const json = JSON.parse(body) as { detail?: unknown };
      detail = json.detail;
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail === "object" && "message" in detail) {
        message = String(detail.message);
      }
    } catch {
      /* not JSON, use raw body */
    }
    throw new ApiError(res.status, message, detail);
  }
  return (await res.json()) as T;
}

export function fetchVisibility(target: string, lat: number, lon: number): Promise<Visibility> {
  return get<Visibility>("/visibility", { target, lat, lon });
}

export function fetchNightPlan(
  lat: number,
  lon: number,
  when?: string,
  gear?: GearPlanParams,
): Promise<NightPlan> {
  const params: Record<string, string | number> = { lat, lon };
  if (when) params.when = when;
  if (gear) {
    params.f_ratio = gear.f_ratio;
    params.filter = gear.filter;
    params.tier = gear.tier ?? "clean";
    if (gear.sqm !== undefined) params.sqm = gear.sqm;
  }
  return get<NightPlan>("/plan/night", params);
}

export function fetchTargetDetail(name: string, lat: number, lon: number, when?: string): Promise<TargetDetail> {
  const params: Record<string, string | number> = { name, lat, lon };
  if (when) params.when = when;
  return get<TargetDetail>("/plan/target", params);
}

export function fetchProject(
  name: string,
  lat: number,
  lon: number,
  gear: GearPlanParams,
  when?: string,
  nights = 30,
): Promise<ProjectPlan> {
  const params: Record<string, string | number> = {
    name,
    lat,
    lon,
    f_ratio: gear.f_ratio,
    filter: gear.filter,
    tier: gear.tier ?? "clean",
    nights,
  };
  if (when) params.when = when;
  if (gear.sqm !== undefined) params.sqm = gear.sqm;
  return get<ProjectPlan>("/plan/project", params);
}
