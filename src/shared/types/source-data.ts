import { z } from 'zod';

import { agentOverlayStateSchema } from './agent-hook';

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

export const overlayStateSchema = z.object({
  rotationIntervalMs: z.number(),
  sources: z.array(sourceStateSchema),
  agent: agentOverlayStateSchema,
  updatedAtMs: z.number(),
  hasErrors: z.boolean(),
});

export type OverlayItem = z.infer<typeof overlayItemSchema>;
export type SourceErrorState = z.infer<typeof sourceErrorSchema>;
export type SourceState = z.infer<typeof sourceStateSchema>;
export type OverlayState = z.infer<typeof overlayStateSchema>;
