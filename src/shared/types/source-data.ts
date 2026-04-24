import { z } from 'zod';

import { agentOverlayStateSchema } from './agent-hook';
import { appLanguageSchema, islandWidthPresetSchema } from './config';

export const overlayItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  detail: z.string().optional(),
  timestampMs: z.number().nullable(),
  icon: z.string().optional(),
  clickTarget: z.string().optional(),
});

export const sourceErrorSchema = z.object({
  message: z.string(),
  timestampMs: z.number(),
});

export const sourceStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('json'),
  icon: z.string().optional(),
  status: z.enum(['idle', 'loading', 'ready', 'error']),
  summary: z.object({
    title: z.string(),
    text: z.string(),
  }),
  items: z.array(overlayItemSchema),
  lastFetchedAtMs: z.number().nullable(),
  lastError: sourceErrorSchema.nullable(),
});

export const activeFocusTimerSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  label: z.string(),
  durationMs: z.number().int().positive(),
  startedAtMs: z.number().int(),
  endsAtMs: z.number().int(),
});

export const completedFocusTimerSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  label: z.string(),
  durationMs: z.number().int().positive(),
  completedAtMs: z.number().int(),
  expiresAtMs: z.number().int(),
});

export const focusTimerStateSchema = z.object({
  active: activeFocusTimerSchema.nullable(),
  completed: completedFocusTimerSchema.nullable(),
});

export const overlayStateSchema = z.object({
  rotationIntervalMs: z.number(),
  language: appLanguageSchema,
  islandWidthPreset: islandWidthPresetSchema,
  sources: z.array(sourceStateSchema),
  agent: agentOverlayStateSchema,
  focusTimer: focusTimerStateSchema,
  updatedAtMs: z.number(),
  hasErrors: z.boolean(),
});

export type OverlayItem = z.infer<typeof overlayItemSchema>;
export type SourceErrorState = z.infer<typeof sourceErrorSchema>;
export type SourceState = z.infer<typeof sourceStateSchema>;
export type ActiveFocusTimer = z.infer<typeof activeFocusTimerSchema>;
export type CompletedFocusTimer = z.infer<typeof completedFocusTimerSchema>;
export type FocusTimerState = z.infer<typeof focusTimerStateSchema>;
export type OverlayState = z.infer<typeof overlayStateSchema>;
