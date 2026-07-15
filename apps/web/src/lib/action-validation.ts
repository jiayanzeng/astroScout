import { z } from "zod";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isoCalendarDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date");

export const saveSessionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    planned_for: isoCalendarDateSchema,
  })
  .strict();

export const logObservationInputSchema = z
  .object({
    session_id: z.string().uuid(),
    target: z.string().trim().min(1).max(80),
    score: z.number().finite().min(0).max(100).nullable(),
    rating: z.enum(["poor", "marginal", "good"]).nullable(),
    notes: z.string().trim().max(2_000).optional(),
    integration_minutes: z.number().finite().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const createGearProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    f_ratio: z.number().finite().gt(0).max(32),
    filter_kind: z.enum(["broadband", "dual_nb", "mono_nb"]),
  })
  .strict();

export const deleteGearProfileInputSchema = z.string().uuid();

export type SaveSessionInput = z.infer<typeof saveSessionInputSchema>;
export type LogObservationInput = z.infer<typeof logObservationInputSchema>;
export type CreateGearProfileInput = z.infer<typeof createGearProfileInputSchema>;
