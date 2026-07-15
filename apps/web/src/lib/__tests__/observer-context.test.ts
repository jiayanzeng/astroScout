import { describe, expect, it } from "vitest";

import {
  OBSERVER_CONTEXT_STORAGE_KEY,
  formatObserverContext,
  optionalObserverContextSchema,
  parseObserverContext,
  readObserverContext,
  writeObserverContext,
  type ObserverContext,
} from "../observer-context";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("observer context", () => {
  const observer: ObserverContext = {
    lat: -36.85,
    lon: 174.76,
    source: "geolocation",
    when: "2026-07-15",
  };

  it("round-trips the trusted application state", () => {
    const storage = memoryStorage();
    writeObserverContext(storage, observer);
    expect(readObserverContext(storage)).toEqual(observer);
    expect(storage.getItem(OBSERVER_CONTEXT_STORAGE_KEY)).toContain('"source":"geolocation"');
  });

  it("rejects invalid or invented coordinate state", () => {
    expect(parseObserverContext({ lat: 91, lon: 0, source: "manual" })).toBeNull();
    expect(parseObserverContext({ lat: 0, lon: 181, source: "manual" })).toBeNull();
    expect(parseObserverContext({ lat: 0, lon: 0, source: "model" })).toBeNull();
  });

  it("accepts both omitted and explicit-null request context as no location", () => {
    expect(optionalObserverContextSchema.parse(undefined)).toBeNull();
    expect(optionalObserverContextSchema.parse(null)).toBeNull();
  });

  it("formats coordinates, source, and date for audit cards", () => {
    expect(formatObserverContext(observer)).toBe(
      "-36.8500, 174.7600 · browser geolocation · 2026-07-15",
    );
  });
});
