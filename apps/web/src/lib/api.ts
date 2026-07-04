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
};

export type NightPlan = {
  dusk_utc: string;
  dawn_utc: string;
  dark_hours: number;
  moon_illumination: number;
  bortle: number;
  targets: RankedTarget[];
};

export type TargetDetail = Omit<NightPlan, "targets" | "dusk_utc" | "dawn_utc"> &
  RankedTarget & { dark_hours: number };

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export function fetchVisibility(target: string, lat: number, lon: number): Promise<Visibility> {
  return get<Visibility>("/visibility", { target, lat, lon });
}

export function fetchNightPlan(lat: number, lon: number): Promise<NightPlan> {
  return get<NightPlan>("/plan/night", { lat, lon });
}

export function fetchTargetDetail(name: string, lat: number, lon: number): Promise<TargetDetail> {
  return get<TargetDetail>("/plan/target", { name, lat, lon });
}
