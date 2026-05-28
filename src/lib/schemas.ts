import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/).nullable();
export const parseStatusSchema = z.enum(["pending", "parsed", "failed"]);

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
  alcoholG: z.number().nonnegative().nullable(),
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

export const reasoningSchema = z.object({
  assumptions: z.array(z.string()).default([]),
  profileSignalsUsed: z.array(z.string()).default([]),
  unresolvedAmbiguities: z.array(z.string()).default([]),
}).default({ assumptions: [], profileSignalsUsed: [], unresolvedAmbiguities: [] });

export const adminAlertSchema = z.object({
  severity: z.enum(["warn", "critical"]),
  code: z.string(),
  message: z.string(),
}).nullable().default(null);

export const dailyParseResultSchema = z.object({
  occurredTime: timeSchema.optional(),
  actionType: z.enum(["create", "clarify"]).default("create"),
  items: z.array(parsedDailyItemSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(warningSchema).default([]),
  remarks: z.string().nullable().optional(),
  reasoning: reasoningSchema,
  adminAlert: adminAlertSchema,
});

export const activityLevelSchema = z.enum(["sedentary", "light", "moderate", "active", "very_active"]);

export const profileOverrideKeySchema = z.enum(["waterTargetMl", "bmr", "neatCalories"]);
export const profileMemoryCategorySchema = z.enum([
  "lifestyle",
  "diet",
  "exercise_context",
  "food_context",
  "medical_context",
  "preference",
  "other",
]);

export const profileMemoryItemSchema = z.object({
  id: z.string(),
  category: profileMemoryCategorySchema,
  label: z.string(),
  value: z.string(),
  sourceNoteId: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export const profileOverridesSchema = z.object({
  waterTargetMl: z.number().positive().optional(),
  bmr: z.number().positive().optional(),
  neatCalories: z.number().nonnegative().optional(),
});

export const profileSchema = z.object({
  age: z.number().int().positive().nullable().optional(),
  sex: z.enum(["female", "male"]).nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  activityLevel: activityLevelSchema.nullable().optional(),
  goal: z.string().nullable().optional(),
  country: z.string().default("Singapore"),
  city: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const profileSnapshotDerivedSchema = z.object({
  value: z.number().nullable(),
  status: z.enum(["estimated", "overridden", "missing"]),
});

export const profileSnapshotSchema = z.object({
  age: z.number().int().positive().nullable(),
  sex: z.enum(["female", "male"]).nullable(),
  heightCm: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  activityLevel: activityLevelSchema.nullable(),
  bmr: profileSnapshotDerivedSchema,
  neat: profileSnapshotDerivedSchema,
  waterTarget: profileSnapshotDerivedSchema,
  overrides: z.object({
    waterTargetMl: z.number().positive().nullable(),
    bmr: z.number().positive().nullable(),
    neatCalories: z.number().nonnegative().nullable(),
  }),
  snapshotAt: z.string().datetime(),
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

export const profileNoteParseResultSchema = z.object({
  action: z.enum(["add", "update", "delete", "clarify", "no_change"]).default("update"),
  profile: profileSchema.partial().optional(),
  metadataUpserts: z.array(profileMemoryItemSchema).default([]),
  metadataDeletes: z.array(z.string()).default([]),
  overrides: profileOverridesSchema.partial().optional(),
  overrideDeletes: z.array(profileOverrideKeySchema).default([]),
  measurements: z.array(bodyMeasurementSchema).default([]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(warningSchema).default([]),
  remarks: z.string().nullable().optional(),
  reasoning: reasoningSchema,
  adminAlert: adminAlertSchema,
});

export type Warning = z.infer<typeof warningSchema>;
export type Reasoning = z.infer<typeof reasoningSchema>;
export type AdminAlert = z.infer<typeof adminAlertSchema>;
export type ParsedDailyItem = z.infer<typeof parsedDailyItemSchema>;
export type DailyParseResult = z.infer<typeof dailyParseResultSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ProfileNoteParseResult = z.infer<typeof profileNoteParseResultSchema>;
export type ParseStatus = z.infer<typeof parseStatusSchema>;
export type ProfileMemoryItem = z.infer<typeof profileMemoryItemSchema>;
export type ProfileMemoryCategory = z.infer<typeof profileMemoryCategorySchema>;
export type ProfileOverrideKey = z.infer<typeof profileOverrideKeySchema>;
export type ProfileOverrides = z.infer<typeof profileOverridesSchema>;
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

export const analysisEnergySplitEntrySchema = z.object({
  label: z.enum(["protein", "carbs", "fat", "alcohol"]),
  calories: z.number().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export const analysisEnergySplitSchema = z.object({
  totalCalories: z.number().nonnegative(),
  entries: z.array(analysisEnergySplitEntrySchema),
});

export const analysisStatsSchema = z.object({
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  completeDays: z.number().nonnegative(),
  totalIntakeCalories: z.number().nonnegative(),
  averageIntakeCalories: z.number().nonnegative(),
  averageQuotaCalories: z.number().nonnegative().nullable(),
  averageNetCalories: z.number().nullable(),
  totalProteinG: z.number().nonnegative(),
  averageProteinG: z.number().nonnegative(),
  totalFatG: z.number().nonnegative(),
  averageFatG: z.number().nonnegative(),
  totalCarbsG: z.number().nonnegative(),
  averageCarbsG: z.number().nonnegative(),
  totalAlcoholG: z.number().nonnegative(),
  averageAlcoholG: z.number().nonnegative(),
  energySplit: analysisEnergySplitSchema,
  averageWaterMl: z.number().nonnegative(),
  averageExerciseCalories: z.number().nonnegative(),
  consistencyScore: z.number().min(0).max(1),
});

export const logTimelineItemSchema = z.object({
  date: z.string(),
  time: z.string().nullable(),
  rawNote: z.string(),
  parsedInfo: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(warningSchema).optional(),
});

export const analysisEvidenceSchema = z.object({
  topCalorieFoods: z.array(parsedDailyItemSchema),
  alcoholContributors: z.array(parsedDailyItemSchema),
  waterContributors: z.array(parsedDailyItemSchema),
  exerciseContributors: z.array(parsedDailyItemSchema),
  highCalorieLowProteinCandidates: z.array(parsedDailyItemSchema),
  logTimeline: z.array(logTimelineItemSchema).optional(),
});

export const focusAreaSchema = z.object({
  action: z.string(),
  rationale: z.string(),
});

export const profileGapSchema = z.object({
  parameter: z.string(),
  whyItMatters: z.string(),
  improveAdvice: z.string(),
});

export const categoryAnalysisSchema = z.object({
  status: z.enum(["good", "watch"]),
  message: z.string(),
});

export const deeperCategoryExampleSchema = z.object({
  date: z.string(),
  time: z.string().nullable(),
  parsedSummary: z.string(),
  reason: z.string(),
  confidence: z.number().nullable().optional(),
});

export const deeperCategorySchema = z.object({
  status: z.enum(["good", "watch"]),
  message: z.string(),
  examples: z.array(deeperCategoryExampleSchema).optional(),
});

export const analysisReportPayloadSchema = z.object({
  stats: analysisStatsSchema,
  evidence: analysisEvidenceSchema,
  summary: z.string(),
  rootCauses: z.array(z.string()),
  focusAreas: z.array(focusAreaSchema),
  profileGaps: z.array(profileGapSchema),
  confidence: z.enum(["low", "medium", "high"]),
  waterAnalysis: deeperCategorySchema.optional(),
  calorieAnalysis: deeperCategorySchema.optional(),
  proteinAnalysis: deeperCategorySchema.optional(),
  macroAnalysis: deeperCategorySchema.optional(),
  loggingHabitAnalysis: deeperCategorySchema.optional(),
  mealChoiceAnalysis: deeperCategorySchema.optional(),
  exerciseHabitAnalysis: deeperCategorySchema.optional(),
});

export type FocusArea = z.infer<typeof focusAreaSchema>;
export type ProfileGap = z.infer<typeof profileGapSchema>;
export type AnalysisStats = z.infer<typeof analysisStatsSchema>;
export type AnalysisEvidence = z.infer<typeof analysisEvidenceSchema>;
export type AnalysisReportPayload = z.infer<typeof analysisReportPayloadSchema>;
export type AnalysisEnergySplit = z.infer<typeof analysisEnergySplitSchema>;
