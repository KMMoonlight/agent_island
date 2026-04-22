import { z } from 'zod';

import { APP_CONFIG } from '../constants/config';

export const requestMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const requestEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const slotMappingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  timestamp: z.string().optional(),
  detail: z.string().optional(),
  icon: z.string().optional(),
  target: z.string().optional(),
});

export const requestConfigSchema = z.object({
  url: z.string().url(),
  method: requestMethodSchema.default('GET'),
  headers: z.array(requestEntrySchema).default([]),
  params: z.array(requestEntrySchema).default([]),
  body: z.string().optional(),
});

export const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().optional(),
  refreshIntervalMs: z
    .number()
    .int()
    .min(APP_CONFIG.polling.minRefreshIntervalMs)
    .default(APP_CONFIG.polling.defaultRefreshIntervalMs),
  detailItemCount: z.number().int().positive().optional(),
  request: requestConfigSchema,
  fieldMappings: slotMappingSchema,
  clickTarget: z
    .object({
      source: z.string().optional(),
      item: z.string().optional(),
    })
    .optional(),
});

export const appConfigSchema = z.object({
  rotationIntervalMs: z.number().int().positive().default(APP_CONFIG.rotationIntervalMs),
  sources: z.array(sourceConfigSchema).default([]),
});

export type RequestMethod = z.infer<typeof requestMethodSchema>;
export type RequestEntry = z.infer<typeof requestEntrySchema>;
export type RequestConfig = z.infer<typeof requestConfigSchema>;
export type SlotMapping = z.infer<typeof slotMappingSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
