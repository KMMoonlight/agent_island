import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  AGENT_TOOL_LABELS,
  type AgentHookInstallStatus,
  type AgentHookSetup,
  type AgentHookSnippet,
  type AgentTool,
} from '@shared/types/agent-hook';
import type { AppConfig, RequestEntry, RequestMethod, SourceConfig } from '@shared/types/config';

const REQUEST_METHODS: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SUPPORTED_TERMINAL_LABELS = [
  'Terminal.app',
  'iTerm2',
  'Ghostty',
  'Warp（仅激活）',
  'cmux',
  'tmux',
  'Zellij',
  'WezTerm',
  'Kaku',
  'VS Code',
  'VS Code Insiders',
  'Cursor',
  'Windsurf',
  'Trae',
  'JetBrains IDEs',
  'Codex.app',
];
const TABS = [
  { id: 'scheduled', label: '定时任务', disabled: true },
  { id: 'polling', label: '轮询请求', disabled: false },
  { id: 'agent', label: 'Agent交互', disabled: false },
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

type AgentAction = {
  mode: 'install' | 'uninstall';
  source: AgentTool;
};

type SnippetCardProps = {
  title: string;
  description: string;
  configPath: string;
  value: string;
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

function SnippetCard({ title, description, configPath, value }: SnippetCardProps): JSX.Element {
  return (
    <article className="grid gap-2.5 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="grid gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600">{title}</h3>
        <p className="text-[10px] leading-5 text-zinc-500">{description}</p>
        <p className="font-mono text-[10px] text-zinc-400">{configPath}</p>
      </div>
      <Textarea className="min-h-[160px] font-mono text-[10px] leading-5" readOnly value={value} />
    </article>
  );
}

function getInstallStateBadge(status: AgentHookInstallStatus): { className: string; label: string } {
  if (status.errorMessage) {
    return {
      className: 'bg-red-50 text-red-700',
      label: '读取失败',
    };
  }

  if (status.isInstalled) {
    return {
      className: 'bg-emerald-50 text-emerald-700',
      label: '已安装',
    };
  }

  if (status.isPartiallyInstalled) {
    return {
      className: 'bg-amber-50 text-amber-700',
      label: '部分安装',
    };
  }

  return {
    className: 'bg-zinc-100 text-zinc-600',
    label: '未安装',
  };
}

export default function ConfigApp(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [agentSetup, setAgentSetup] = useState<AgentHookSetup | null>(null);
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const [agentActionMessage, setAgentActionMessage] = useState<string | null>(null);
  const [agentErrorMessage, setAgentErrorMessage] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pendingDeleteSourceId, setPendingDeleteSourceId] = useState<string | null>(null);
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

    void window.api.agent.getSetup().then((nextSetup) => {
      if (disposed) {
        return;
      }

      setAgentSetup(nextSetup);
      setAgentErrorMessage(null);
    }).catch(() => {
      if (!disposed) {
        setAgentSetup(null);
        setAgentErrorMessage('读取 Agent Hook 配置失败。');
      }
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
    setPendingDeleteSourceId(null);
    setSaveMessage(null);
  };

  const installStatuses = agentSetup?.installStatuses ?? [];
  const supportedAgentLabels = installStatuses.length > 0
    ? installStatuses.map((status) => status.title)
    : Object.values(AGENT_TOOL_LABELS);
  const snippetsBySource = (agentSetup?.snippets ?? []).reduce<Record<AgentTool, AgentHookSnippet[]>>((groups, snippet) => {
    const existingSnippets = groups[snippet.source] ?? [];
    groups[snippet.source] = [...existingSnippets, snippet];
    return groups;
  }, {} as Record<AgentTool, AgentHookSnippet[]>);

  const refreshAgentSetup = async (): Promise<AgentHookSetup> => {
    const nextSetup = await window.api.agent.getSetup();
    setAgentSetup(nextSetup);
    setAgentErrorMessage(null);
    return nextSetup;
  };

  const handleManagedHookAction = async (source: AgentTool, mode: AgentAction['mode']): Promise<void> => {
    setAgentAction({ source, mode });
    setAgentActionMessage(null);
    setAgentErrorMessage(null);

    try {
      const nextSetup = mode === 'install'
        ? await window.api.agent.installManagedHooks(source)
        : await window.api.agent.uninstallManagedHooks(source);
      setAgentSetup(nextSetup);
      setAgentActionMessage(mode === 'install'
        ? `已自动写入 ${AGENT_TOOL_LABELS[source]} 的 Hook 配置。`
        : `已移除 ${AGENT_TOOL_LABELS[source]} 的受管 Hook 配置。`);
    } catch (error) {
      await refreshAgentSetup().catch(() => undefined);
      setAgentErrorMessage(error instanceof Error ? error.message : '更新 Agent Hook 配置失败。');
    } finally {
      setAgentAction(null);
    }
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
    setPendingDeleteSourceId(null);
    setSelectedSourceId(nextSource.id);
  };

  const removeSource = (sourceId: string): void => {
    if (!config) {
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

          {activeTab === 'agent' ? (
            <div className="space-y-5">
              <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Agent Hook Bridge</h2>
                    <p className="max-w-2xl text-[10px] leading-5 text-zinc-600">
                      这里直接按 `open-vibe-island` 的接入思路做自动安装：每个 Agent 都可以单独安装 / 卸载受管 hook，配置文件会自动备份；如果你更想手动维护，下面也保留了对应片段。
                    </p>
                  </div>
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-medium',
                    agentSetup?.isServerRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  )}>
                    {agentSetup?.isServerRunning ? 'Bridge 运行中' : 'Bridge 未就绪'}
                  </span>
                </div>

                <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[10px] text-zinc-600">
                  <p>{agentSetup?.statusMessage ?? '等待主进程提供 Hook bridge 状态。'}</p>
                  <p>Bridge 脚本：{agentSetup?.bridgeScriptPath ?? '尚未生成'}</p>
                  <p>运行时配置：{agentSetup?.runtimeEnvPath ?? '尚未生成'}</p>
                  {agentSetup?.endpointBaseUrl ? <p>当前端点：{agentSetup.endpointBaseUrl}</p> : null}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">已接入 Agents</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {supportedAgentLabels.map((label) => (
                        <span key={label} className="inline-flex min-h-7 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-center text-[9px] leading-none text-zinc-600">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">已接入终端 / IDE 跳转</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {SUPPORTED_TERMINAL_LABELS.map((label) => (
                        <span key={label} className="inline-flex min-h-7 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-center text-[9px] leading-none text-zinc-600">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 text-[10px] leading-5 text-zinc-500">
                  <p>1. 点击安装后，会直接写入各自工具的真实配置文件，并只管理 Agent Island 自己插入的 hook。</p>
                  <p>2. 卸载时会尽量只移除受管段落，保留你原本已有的自定义 hooks。</p>
                  <p>3. Codex 会一并处理 `~/.codex/config.toml` 里的 `codex_hooks = true`，不用再手动补。</p>
                  <p>4. Codex、Claude-compatible、Cursor、Kimi 这些阻塞式 hook 会在岛上接管同意 / 拒绝；Gemini 仍是状态同步型通知。</p>
                </div>
              </section>

              {agentErrorMessage ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">
                  {agentErrorMessage}
                </div>
              ) : null}

              {agentActionMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700">
                  {agentActionMessage}
                </div>
              ) : null}

              <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">自动安装</h2>
                    <p className="max-w-2xl text-[10px] leading-5 text-zinc-600">
                      按 Agent 单独安装，避免无端在你的 home 目录创建一堆并不用的配置目录；如果某个工具只装了一半，也会在这里明确提示你重新安装一次。
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={agentAction !== null}
                    onClick={() => {
                      void refreshAgentSetup().catch((error) => {
                        setAgentErrorMessage(error instanceof Error ? error.message : '刷新 Agent Hook 状态失败。');
                      });
                    }}
                  >
                    刷新状态
                  </Button>
                </div>

                {installStatuses.length > 0 ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {installStatuses.map((status) => {
                      const badge = getInstallStateBadge(status);
                      const snippets = snippetsBySource[status.source] ?? [];
                      const isBusy = agentAction?.source === status.source;

                      return (
                        <article key={status.source} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid gap-1">
                              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600">{status.title}</h3>
                              <p className="text-[10px] leading-5 text-zinc-500">{status.statusMessage}</p>
                            </div>
                            <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-medium', badge.className)}>
                              {badge.label}
                            </span>
                          </div>

                          <div className="grid gap-1.5 rounded-lg border border-zinc-200 bg-white p-3 text-[10px] text-zinc-600">
                            <p className="font-medium text-zinc-700">配置文件</p>
                            {status.configPaths.map((configPath) => (
                              <p key={configPath} className="font-mono text-[9px] text-zinc-500">{configPath}</p>
                            ))}
                            {status.errorMessage ? (
                              <p className="text-red-600">{status.errorMessage}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={agentAction !== null}
                              onClick={() => {
                                void handleManagedHookAction(status.source, 'install');
                              }}
                            >
                              {isBusy && agentAction?.mode === 'install' ? '安装中...' : '安装'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={agentAction !== null || (!status.isInstalled && !status.isPartiallyInstalled)}
                              onClick={() => {
                                void handleManagedHookAction(status.source, 'uninstall');
                              }}
                            >
                              {isBusy && agentAction?.mode === 'uninstall' ? '卸载中...' : '卸载'}
                            </Button>
                          </div>

                          {snippets.length > 0 ? (
                            <details className="rounded-lg border border-zinc-200 bg-white p-3">
                              <summary className="cursor-pointer list-none text-[10px] font-medium text-zinc-700">
                                查看手动配置片段
                              </summary>
                              <div className="mt-3 grid gap-3">
                                {snippets.map((snippet) => (
                                  <SnippetCard
                                    key={snippet.id}
                                    title={snippet.title}
                                    description={snippet.description}
                                    configPath={snippet.configPath}
                                    value={snippet.value}
                                  />
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-[160px] place-items-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 text-[10px] text-zinc-500">
                    还没有可用的自动安装状态。
                  </div>
                )}
              </section>
            </div>
          ) : activeTab !== 'polling' ? (
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
                      const isDeletePending = pendingDeleteSourceId === source.id;

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
                            aria-label={isDeletePending ? `确认删除 ${formatRequestLabel(source, index)}` : `删除 ${formatRequestLabel(source, index)}`}
                            className={cn(
                              'flex h-7 min-w-7 items-center justify-center border-l border-zinc-200 px-2 text-red-600 transition-colors hover:text-red-700',
                              isDeletePending ? 'bg-red-50 font-medium' : 'hover:bg-red-50'
                            )}
                            onClick={() => {
                              if (isDeletePending) {
                                removeSource(source.id);
                                return;
                              }

                              setPendingDeleteSourceId(source.id);
                            }}
                          >
                            {isDeletePending ? '确认' : <Trash2 className="h-3.5 w-3.5" />}
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
