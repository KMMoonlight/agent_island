import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AppConfig, RequestEntry, RequestMethod, SourceConfig } from '@shared/types/config';

const REQUEST_METHODS: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TABS = [
  { id: 'scheduled', label: '定时任务', disabled: true },
  { id: 'polling', label: '轮询请求', disabled: false },
  { id: 'agent', label: 'Agent交互', disabled: true },
] as const;
const EMPTY_ENTRY: RequestEntry = { key: '', value: '' };

type ConfigTabId = (typeof TABS)[number]['id'];

type KeyValueEditorProps = {
  addLabel: string;
  entries: RequestEntry[];
  keyPlaceholder: string;
  onChange: (entries: RequestEntry[]) => void;
  valuePlaceholder: string;
};

type FieldProps = {
  children: React.ReactNode;
  label: string;
};

function createBlankSource(): SourceConfig {
  return {
    id: `source-${Math.random().toString(36).slice(2, 8)}`,
    name: '未命名请求',
    icon: '',
    refreshIntervalMs: 60_000,
    detailItemCount: 1,
    request: {
      url: '',
      method: 'GET',
      headers: [],
      params: [],
      body: '',
    },
    fieldMappings: {
      title: '',
      summary: '',
      detail: '',
      timestamp: '',
      icon: '',
      target: '',
    },
    clickTarget: {
      source: '',
      item: '',
    },
  };
}

function cloneConfig(config: AppConfig): AppConfig {
  return structuredClone(config);
}

function updateSource(config: AppConfig, sourceId: string, updater: (source: SourceConfig) => SourceConfig): AppConfig {
  return {
    ...config,
    sources: config.sources.map((source) => (source.id === sourceId ? updater(source) : source)),
  };
}

function updateEntry(entries: RequestEntry[], index: number, key: 'key' | 'value', value: string): RequestEntry[] {
  return entries.map((entry, currentIndex) => (currentIndex === index ? { ...entry, [key]: value } : entry));
}

function normalizeEntries(entries: RequestEntry[]): RequestEntry[] {
  return entries.filter((entry) => entry.key.trim().length > 0 || entry.value.trim().length > 0);
}

function shouldShowBody(method: RequestMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

function formatRequestLabel(source: SourceConfig, index: number): string {
  const name = source.name.trim();
  return name.length > 0 ? name : `请求 ${index + 1}`;
}

function getSaveValidationMessage(config: AppConfig): string | null {
  if (config.sources.length === 0) {
    return '请先添加至少一个轮询请求。';
  }

  for (const [index, source] of config.sources.entries()) {
    const label = `请求 ${index + 1}`;

    if (!source.name.trim()) {
      return `${label} 的名称不能为空。`;
    }

    if (!source.request.url.trim()) {
      return `${label} 的 URL 不能为空。`;
    }

    if (!source.fieldMappings.title.trim()) {
      return `${label} 的标题不能为空。`;
    }
  }

  return null;
}

function Field({ children, label }: FieldProps): JSX.Element {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label>{label}</Label>
      </div>
      {children}
    </div>
  );
}

function KeyValueEditor({ addLabel, entries, keyPlaceholder, onChange, valuePlaceholder }: KeyValueEditorProps): JSX.Element {
  const safeEntries = entries.length > 0 ? entries : [EMPTY_ENTRY];

  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2.5">
        {safeEntries.map((entry, index) => (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={`${keyPlaceholder}-${index}`}>
            <Input
              value={entry.key}
              placeholder={keyPlaceholder}
              onChange={(event) => {
                onChange(updateEntry(safeEntries, index, 'key', event.target.value));
              }}
            />
            <Input
              value={entry.value}
              placeholder={valuePlaceholder}
              onChange={(event) => {
                onChange(updateEntry(safeEntries, index, 'value', event.target.value));
              }}
            />
            <Button
              className="sm:self-auto"
              size="sm"
              variant="outline"
              onClick={() => {
                onChange(safeEntries.filter((_, currentIndex) => currentIndex !== index));
              }}
            >
              删除
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onChange([...safeEntries, { ...EMPTY_ENTRY }]);
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export default function ConfigApp(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConfigTabId>('polling');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void window.api.config.get().then((nextConfig) => {
      if (disposed) {
        return;
      }

      setConfig(nextConfig);
      setSelectedSourceId(nextConfig.sources[0]?.id ?? null);
      setIsLoading(false);
    }).catch((error) => {
      if (disposed) {
        return;
      }

      setValidationError(error instanceof Error ? error.message : 'Failed to load settings');
      setIsLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const selectedSource = useMemo(() => {
    if (!config || !selectedSourceId) {
      return null;
    }

    return config.sources.find((source) => source.id === selectedSourceId) ?? null;
  }, [config, selectedSourceId]);

  const applyConfig = (nextConfig: AppConfig): void => {
    setConfig(nextConfig);
    if (!selectedSourceId || !nextConfig.sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(nextConfig.sources[0]?.id ?? null);
    }
    setSaveMessage(null);
  };

  const addPollingSource = (): void => {
    if (!config) {
      return;
    }

    const nextSource = createBlankSource();
    applyConfig({
      ...config,
      sources: [...config.sources, nextSource],
    });
    setSelectedSourceId(nextSource.id);
  };

  const removeSource = (sourceId: string): void => {
    if (!config) {
      return;
    }

    const source = config.sources.find((item) => item.id === sourceId);
    const sourceLabel = source ? source.name.trim() || '未命名请求' : '该请求';
    const confirmed = window.confirm(`确认删除“${sourceLabel}”吗？`);

    if (!confirmed) {
      return;
    }

    const nextSources = config.sources.filter((item) => item.id !== sourceId);
    applyConfig({
      ...config,
      sources: nextSources,
    });
  };

  const handleValidate = async (nextConfig: AppConfig): Promise<boolean> => {
    const result = await window.api.config.validate(nextConfig);

    if (result.ok) {
      setValidationError(null);
      return true;
    }

    setValidationError(result.error);
    return false;
  };

  const handleSave = async (): Promise<void> => {
    if (!config) {
      return;
    }

    const saveValidationMessage = getSaveValidationMessage(config);
    if (saveValidationMessage) {
      setValidationError(saveValidationMessage);
      setSaveMessage(null);
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const normalizedConfig: AppConfig = {
        ...cloneConfig(config),
        sources: config.sources.map((source) => ({
          ...source,
          name: source.name.trim(),
          id: source.id.trim() || `source-${Math.random().toString(36).slice(2, 8)}`,
          icon: source.icon?.trim() ? source.icon.trim() : undefined,
          detailItemCount: source.detailItemCount ?? undefined,
          request: {
            ...source.request,
            url: source.request.url.trim(),
            headers: normalizeEntries(source.request.headers),
            params: normalizeEntries(source.request.params),
            body: source.request.body?.trim() ? source.request.body.trim() : undefined,
          },
          fieldMappings: {
            ...source.fieldMappings,
            title: source.fieldMappings.title.trim(),
            summary: source.fieldMappings.summary?.trim() || undefined,
            detail: source.fieldMappings.detail?.trim() || undefined,
            timestamp: source.fieldMappings.timestamp?.trim() || undefined,
            icon: source.fieldMappings.icon?.trim() || undefined,
            target: source.fieldMappings.target?.trim() || undefined,
          },
          clickTarget: {
            source: source.clickTarget?.source?.trim() || undefined,
            item: source.clickTarget?.item?.trim() || undefined,
          },
        })),
      };

      const isValid = await handleValidate(normalizedConfig);
      if (!isValid) {
        return;
      }

      const savedConfig = await window.api.config.save(normalizedConfig);
      setConfig(savedConfig);
      setSelectedSourceId(savedConfig.sources.find((source) => source.id === selectedSourceId)?.id ?? savedConfig.sources[0]?.id ?? null);
      setValidationError(null);
      setSaveMessage('设置已保存并重新触发轮询。');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <main className="config-page grid min-h-screen place-items-center px-6 text-[10px] text-zinc-500">Loading source settings...</main>;
  }

  if (!config) {
    return <main className="config-page grid min-h-screen place-items-center px-6 text-[10px] text-zinc-500">Unable to load source settings.</main>;
  }

  return (
    <main className="config-page">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:px-5">
        <aside className="flex min-h-full self-stretch border-r border-zinc-200 pr-2.5">
          <nav aria-label="Configuration tabs" className="grid w-full content-start gap-1 py-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'flex h-7 items-center rounded-md px-2.5 text-[9px] transition-colors',
                  activeTab === tab.id ? 'bg-zinc-100 font-medium text-zinc-950' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950',
                  tab.disabled && 'cursor-not-allowed opacity-50'
                )}
                disabled={tab.disabled}
                onClick={() => {
                  if (!tab.disabled) {
                    setActiveTab(tab.id);
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-5">
          {validationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] text-red-700">{validationError}</div> : null}
          {saveMessage ? <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[10px] text-zinc-700">{saveMessage}</div> : null}

          {activeTab !== 'polling' ? (
            <div className="grid min-h-[240px] place-items-center rounded-xl border border-zinc-200 bg-white px-4 text-[10px] text-zinc-500">
              该标签稍后开放。
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">请求列表</h2>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label="添加轮询请求" onClick={addPollingSource}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
                      {isSaving ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </div>

                {config.sources.length > 0 ? (
                  <div className="flex flex-wrap gap-1" role="tablist" aria-label="轮询请求列表">
                    {config.sources.map((source, index) => {
                      const isSelected = selectedSourceId === source.id;

                      return (
                        <div
                          key={source.id}
                          className={cn(
                            'inline-flex items-center overflow-hidden rounded-md border bg-white text-[9px] transition-colors',
                            isSelected ? 'border-zinc-300 text-zinc-950 shadow-sm' : 'border-zinc-200 text-zinc-700'
                          )}
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            className={cn(
                              'flex h-7 items-center gap-1.5 px-2.5 transition-colors',
                              isSelected ? 'bg-zinc-50 text-zinc-950' : 'hover:bg-zinc-100 hover:text-zinc-950'
                            )}
                            onClick={() => {
                              setSelectedSourceId(source.id);
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                'h-1.5 w-1.5 rounded-full transition-colors',
                                isSelected ? 'bg-green-500' : 'bg-zinc-300'
                              )}
                            />
                            <span>{formatRequestLabel(source, index)}</span>
                          </button>
                          <button
                            type="button"
                            aria-label={`删除 ${formatRequestLabel(source, index)}`}
                            className="flex h-7 w-7 items-center justify-center border-l border-zinc-200 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              removeSource(source.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-[72px] place-items-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 text-[10px] text-zinc-500">
                    还没有轮询请求，点击右上角加号创建。
                  </div>
                )}
              </section>

              {selectedSource ? (
                <>
                  <section className="space-y-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">基础配置</h2>
                    <div className="grid gap-4">
                      <div className="grid gap-2.5 xl:grid-cols-3">
                        <Field label="名称">
                          <Input
                            value={selectedSource.name}
                            placeholder="例如：Service health"
                            onChange={(event) => {
                              applyConfig(updateSource(config, selectedSource.id, (source) => ({ ...source, name: event.target.value })));
                            }}
                          />
                        </Field>

                        <Field label="请求方式">
                          <Select
                            value={selectedSource.request.method}
                            onValueChange={(value) => {
                              const nextMethod = value as RequestMethod;
                              applyConfig(updateSource(config, selectedSource.id, (source) => ({
                                ...source,
                                request: {
                                  ...source.request,
                                  method: nextMethod,
                                  body: shouldShowBody(nextMethod) ? source.request.body ?? '' : '',
                                },
                              })));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择请求方式" />
                            </SelectTrigger>
                            <SelectContent>
                              {REQUEST_METHODS.map((method) => (
                                <SelectItem key={method} value={method}>{method}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>

                        <Field label="轮询频率">
                          <Input
                            type="number"
                            min={1}
                            placeholder="60"
                            value={Math.max(1, Math.round(selectedSource.refreshIntervalMs / 1000))}
                            onChange={(event) => {
                              applyConfig(updateSource(config, selectedSource.id, (source) => ({
                                ...source,
                                refreshIntervalMs: Number(event.target.value) * 1000,
                              })));
                            }}
                          />
                        </Field>
                      </div>

                      <Field label="URL">
                        <Input
                          value={selectedSource.request.url}
                          placeholder="https://api.example.com/status"
                          onChange={(event) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              request: {
                                ...source.request,
                                url: event.target.value,
                              },
                            })));
                          }}
                        />
                      </Field>
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">请求内容</h2>
                    <div className="grid gap-4">
                      <Field label="Headers">
                        <KeyValueEditor
                          addLabel="添加 Header"
                          entries={selectedSource.request.headers}
                          keyPlaceholder="Header"
                          valuePlaceholder="Value"
                          onChange={(entries) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              request: {
                                ...source.request,
                                headers: entries,
                              },
                            })));
                          }}
                        />
                      </Field>

                      {shouldShowBody(selectedSource.request.method) ? (
                        <>
                          <Separator />
                          <Field label="Body">
                            <Textarea
                              value={selectedSource.request.body ?? ''}
                              placeholder='例如：{ "env": "prod" }'
                              onChange={(event) => {
                                applyConfig(updateSource(config, selectedSource.id, (source) => ({
                                  ...source,
                                  request: {
                                    ...source.request,
                                    body: event.target.value,
                                  },
                                })));
                              }}
                            />
                          </Field>
                        </>
                      ) : null}
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">字段映射</h2>
                    <div className="grid gap-4">
                      <Field label="标题">
                        <Input
                          value={selectedSource.fieldMappings.title}
                          placeholder="请填写，如 {{ $data.label.trim() }}"
                          onChange={(event) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                title: event.target.value,
                              },
                            })));
                          }}
                        />
                      </Field>

                      <Field label="结果">
                        <Input
                          value={selectedSource.fieldMappings.summary ?? ''}
                          placeholder="请填写，如 {{ $data.value.toFixed(2) }}"
                          onChange={(event) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                summary: event.target.value,
                              },
                            })));
                          }}
                        />
                      </Field>

                      <Field label="详情">
                        <Input
                          value={selectedSource.fieldMappings.detail ?? ''}
                          placeholder="请填写，如 {{ $data.label.trim() }}"
                          onChange={(event) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                detail: event.target.value,
                              },
                            })));
                          }}
                        />
                      </Field>
                    </div>
                  </section>
                </>
              ) : (
                <div className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 text-[10px] text-zinc-500">
                  点击右上角的加号创建第一个轮询请求。
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
