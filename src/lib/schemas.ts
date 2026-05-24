import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/).nullable();

export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  improveWith: z.string().optional(),
});

export const nutritionSchema = z.object({
  calories: z.number().nonnegative().nullable(),
  proteinG: z.number().nonnegative().nullable(),
  fatG: z.number().nonnegative().nullable(),
  carbsG: z.number().nonnegative().nullable(),
});

export const parsedDailyItemSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["food", "water", "exercise", "note"]),
  label: z.string(),
  occurredTime: timeSchema.optional(),
  quantity: z.string().nullable().optional(),
  nutrition: nutritionSchema.optional(),
  waterMl: z.number().nonnegative().nullable().optional(),
  exerciseCalories: z.number().nonnegative().nullable().optional(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(warningSchema).default([]),
  remarks: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const dailyParseResultSchema = z.object({
  occurredTime: timeSchema.optional(),
  actionType: z.enum(["create", "edit", "delete", "clarify"]).default("create"),
  items: z.array(parsedDailyItemSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(warningSchema).default([]),
  remarks: z.string().nullable().optional(),
});

export const activityLevelSchema = z.enum(["sedentary", "light", "moderate", "active", "very_active"]);

export const profileSchema = z.object({
  age: z.number().int().positive().nullable().optional(),
  sex: z.enum(["female", "male"]).nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  activityLevel: activityLevelSchema.nullable().optional(),
  goal: z.string().nullable().optional(),
  country: z.string().default("Singapore"),
  remarks: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const bodyMeasurementSchema = z.object({
  measuredAt: z.string().datetime().optional(),
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  confidence: z.number().min(0).max(1),
  remarks: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const bodyParseResultSchema = z.object({
  profile: profileSchema.partial().optional(),
  measurements: z.array(bodyMeasurementSchema).default([]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(warningSchema).default([]),
  remarks: z.string().nullable().optional(),
});

export type Warning = z.infer<typeof warningSchema>;
export type ParsedDailyItem = z.infer<typeof parsedDailyItemSchema>;
export type DailyParseResult = z.infer<typeof dailyParseResultSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type BodyParseResult = z.infer<typeof bodyParseResultSchema>;
