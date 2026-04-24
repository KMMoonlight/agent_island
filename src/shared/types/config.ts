import { z } from 'zod';

import { APP_CONFIG } from '../constants/config';

export const requestMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export const appLanguageSchema = z.enum(['zh-CN', 'en-US']);
export const islandWidthPresetSchema = z.enum(['small', 'medium', 'large']);

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

export const focusTimerConfigOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(24 * 60),
  enabled: z.boolean().default(false),
});

function getDefaultFocusTimerOptions(): FocusTimerConfigOption[] {
  return APP_CONFIG.focusTimers.defaultOptions.map((option) => ({ ...option }));
}

function normalizeFocusTimerOptions(options: FocusTimerConfigOption[]): FocusTimerConfigOption[] {
  const optionById = new Map(options.map((option) => [option.id, option]));

  return getDefaultFocusTimerOptions().map((defaultOption) => {
    const option = optionById.get(defaultOption.id);
    if (!option) {
      return defaultOption;
    }

    return {
      ...defaultOption,
      label: option.id === 'custom' ? option.label : defaultOption.label,
      durationMinutes: option.id === 'custom' ? option.durationMinutes : defaultOption.durationMinutes,
      enabled: option.enabled,
    };
  });
}

export const focusTimerSettingsSchema = z
  .object({
    options: z.array(focusTimerConfigOptionSchema).default(getDefaultFocusTimerOptions),
  })
  .default({
    options: getDefaultFocusTimerOptions(),
  })
  .transform((settings) => ({
    options: normalizeFocusTimerOptions(settings.options),
  }));

export const appConfigSchema = z.object({
  rotationIntervalMs: z.number().int().positive().default(APP_CONFIG.rotationIntervalMs),
  language: appLanguageSchema.default(APP_CONFIG.language),
  islandWidthPreset: islandWidthPresetSchema.default(APP_CONFIG.islandWidthPreset),
  sources: z.array(sourceConfigSchema).default([]),
  focusTimers: focusTimerSettingsSchema,
});

export type AppLanguage = z.infer<typeof appLanguageSchema>;
export type IslandWidthPreset = z.infer<typeof islandWidthPresetSchema>;
export type RequestMethod = z.infer<typeof requestMethodSchema>;
export type RequestEntry = z.infer<typeof requestEntrySchema>;
export type RequestConfig = z.infer<typeof requestConfigSchema>;
export type SlotMapping = z.infer<typeof slotMappingSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type FocusTimerConfigOption = z.infer<typeof focusTimerConfigOptionSchema>;
export type FocusTimerSettings = z.infer<typeof focusTimerSettingsSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;

export type IslandWindowDimensions = {
  compactWidth: number;
  expandedWidth: number;
};

export function getIslandWindowDimensions(preset: IslandWidthPreset): IslandWindowDimensions {
  return APP_CONFIG.window.widthPresets[preset] ?? APP_CONFIG.window.widthPresets[APP_CONFIG.islandWidthPreset];
}

export function formatFocusTimerConfigOptionLabel(option: FocusTimerConfigOption): string {
  if (option.id === 'custom') {
    return `${option.label} ${option.durationMinutes} 分钟`;
  }

  return option.label;
}

export function formatFocusTimerRuntimeLabel(option: FocusTimerConfigOption): string {
  if (option.id === 'custom') {
    return `倒计时 ${option.durationMinutes} 分钟`;
  }

  return option.label;
}
