import { z } from 'zod';

import { APP_CONFIG } from '../constants/config';

export const sourceTypeSchema = z.enum(['json', 'rss']);

export const slotMappingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  timestamp: z.string().optional(),
  detail: z.string().optional(),
  icon: z.string().optional(),
  target: z.string().optional(),
});

export const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: sourceTypeSchema,
  url: z.string().url(),
  icon: z.string().optional(),
  refreshIntervalMs: z
    .number()
    .int()
    .min(APP_CONFIG.polling.minRefreshIntervalMs)
    .default(APP_CONFIG.polling.defaultRefreshIntervalMs),
  detailItemCount: z.number().int().positive().optional(),
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
  sources: z.array(sourceConfigSchema).min(1),
});

export type SlotMapping = z.infer<typeof slotMappingSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
