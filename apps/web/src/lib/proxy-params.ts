export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

type NumberBounds = {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  integer?: boolean;
};

export function requiredText(params: URLSearchParams, name: string): string {
  const value = params.get(name)?.trim();
  if (!value) throw new QueryValidationError(`${name} is required`);
  return value;
}

export function finiteNumber(
  params: URLSearchParams,
  name: string,
  bounds: NumberBounds = {},
): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") {
    throw new QueryValidationError(`${name} is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new QueryValidationError(`${name} must be a finite number`);
  }
  if (bounds.integer && !Number.isInteger(value)) {
    throw new QueryValidationError(`${name} must be an integer`);
  }
  if (bounds.min !== undefined) {
    const invalid = bounds.minExclusive ? value <= bounds.min : value < bounds.min;
    if (invalid) {
      const operator = bounds.minExclusive ? "greater than" : "at least";
      throw new QueryValidationError(`${name} must be ${operator} ${bounds.min}`);
    }
  }
  if (bounds.max !== undefined && value > bounds.max) {
    throw new QueryValidationError(`${name} must be at most ${bounds.max}`);
  }
  return value;
}

export function optionalFiniteNumber(
  params: URLSearchParams,
  name: string,
  bounds: NumberBounds = {},
): number | undefined {
  if (params.get(name) === null) return undefined;
  return finiteNumber(params, name, bounds);
}

export function coordinates(params: URLSearchParams): { lat: number; lon: number } {
  return {
    lat: finiteNumber(params, "lat", { min: -90, max: 90 }),
    lon: finiteNumber(params, "lon", { min: -180, max: 180 }),
  };
}
