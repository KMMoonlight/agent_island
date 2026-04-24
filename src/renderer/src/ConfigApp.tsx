import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  type AgentTool,
  type CodexInstallVariantId,
} from '@shared/types/agent-hook';
import {
  formatFocusTimerConfigOptionLabel,
  type AppConfig,
  type AppLanguage,
  type FocusTimerConfigOption,
  type IslandWidthPreset,
  type RequestEntry,
  type RequestMethod,
  type SourceConfig,
} from '@shared/types/config';
import type { AgentInstallManagedHooksOptions } from '@shared/types/ipc';

const REQUEST_METHODS: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TABS = [
  { id: 'general', disabled: false },
  { id: 'scheduled', disabled: false },
  { id: 'polling', disabled: false },
  { id: 'agent', disabled: false },
] as const;
const EMPTY_ENTRY: RequestEntry = { key: '', value: '' };
const CUSTOM_FOCUS_TIMER_ID = 'custom';

type ConfigTabId = (typeof TABS)[number]['id'];
type ConfigText = {
  addHeader: string;
  addPollingRequest: string;
  agentHookStatus: string;
  agentSetupLoadFailed: string;
  agentSetupRefreshFailed: string;
  bridgeNotReady: string;
  bridgeReady: string;
  bridgeStatusFallback: string;
  confirm: string;
  defaultBadge: string;
  delete: string;
  details: string;
  fieldMappings: string;
  focusTimer: string;
  general: string;
  islandRotationInterval: string;
  islandWidth: string;
  language: string;
  languageOptions: Record<AppLanguage, string>;
  loading: string;
  minutes: string;
  minutesCountdown: (minutes: number) => string;
  name: string;
  noAgentStatuses: string;
  noPollingSources: string;
  polling: string;
  pollingEmptyDetail: string;
  pollingFrequency: string;
  requestContent: string;
  requestList: string;
  requestMethod: string;
  requestNumber: (index: number) => string;
  result: string;
  save: string;
  saved: string;
  saving: string;
  scheduled: string;
  seconds: string;
  selectLanguage: string;
  selectRequestMethod: string;
  title: string;
  unavailableTab: string;
  unableToLoad: string;
  unnamedRequest: string;
  updateAgentFailed: string;
  agent: string;
  widthOptions: Record<IslandWidthPreset, string>;
};

const CONFIG_TEXT: Record<AppLanguage, ConfigText> = {
  'zh-CN': {
    addHeader: '添加 Header',
    addPollingRequest: '添加轮询请求',
    agentHookStatus: 'Agent Hook 状态',
    agentSetupLoadFailed: '读取 Agent Hook 配置失败。',
    agentSetupRefreshFailed: '刷新 Agent Hook 状态失败。',
    bridgeNotReady: 'Bridge 未就绪',
    bridgeReady: 'Bridge 运行中',
    bridgeStatusFallback: '等待主进程提供 Hook bridge 状态。',
    confirm: '确认',
    defaultBadge: '默认',
    delete: '删除',
    details: '详情',
    fieldMappings: '字段映射',
    focusTimer: '专注时钟',
    general: '通用配置',
    islandRotationInterval: '灵动岛轮转间隔',
    islandWidth: '灵动岛宽度',
    language: '语言',
    languageOptions: {
      'zh-CN': '中文',
      'en-US': 'English',
    },
    loading: '正在加载配置...',
    minutes: '分钟',
    minutesCountdown: (minutes) => `${minutes} 分钟倒计时`,
    name: '名称',
    noAgentStatuses: '还没有可用的 Agent Hook 状态。',
    noPollingSources: '还没有轮询请求，点击右上角加号创建。',
    polling: '轮询请求',
    pollingEmptyDetail: '点击右上角的加号创建第一个轮询请求。',
    pollingFrequency: '轮询频率',
    requestContent: '请求内容',
    requestList: '请求列表',
    requestMethod: '请求方式',
    requestNumber: (index) => `请求 ${index + 1}`,
    result: '结果',
    save: '保存',
    saved: '设置已保存并重新触发轮询。',
    saving: '保存中...',
    scheduled: '专注时钟',
    seconds: '秒',
    selectLanguage: '选择语言',
    selectRequestMethod: '选择请求方式',
    title: '标题',
    unavailableTab: '该标签稍后开放。',
    unableToLoad: '无法加载配置。',
    unnamedRequest: '未命名请求',
    updateAgentFailed: '更新 Agent Hook 状态失败。',
    agent: 'Agent交互',
    widthOptions: {
      small: '小',
      medium: '中',
      large: '大',
    },
  },
  'en-US': {
    addHeader: 'Add Header',
    addPollingRequest: 'Add polling request',
    agentHookStatus: 'Agent Hook Status',
    agentSetupLoadFailed: 'Failed to load Agent Hook settings.',
    agentSetupRefreshFailed: 'Failed to refresh Agent Hook status.',
    bridgeNotReady: 'Bridge not ready',
    bridgeReady: 'Bridge running',
    bridgeStatusFallback: 'Waiting for the main process to provide Hook bridge status.',
    confirm: 'Confirm',
    defaultBadge: 'Default',
    delete: 'Delete',
    details: 'Details',
    fieldMappings: 'Field Mappings',
    focusTimer: 'Focus Timer',
    general: 'General',
    islandRotationInterval: 'Island rotation interval',
    islandWidth: 'Island width',
    language: 'Language',
    languageOptions: {
      'zh-CN': 'Chinese',
      'en-US': 'English',
    },
    loading: 'Loading settings...',
    minutes: 'minutes',
    minutesCountdown: (minutes) => `${minutes} min countdown`,
    name: 'Name',
    noAgentStatuses: 'No Agent Hook statuses are available yet.',
    noPollingSources: 'No polling requests yet. Use the plus button in the upper-right to create one.',
    polling: 'Polling Requests',
    pollingEmptyDetail: 'Use the plus button in the upper-right to create your first polling request.',
    pollingFrequency: 'Polling frequency',
    requestContent: 'Request Content',
    requestList: 'Request List',
    requestMethod: 'Request method',
    requestNumber: (index) => `Request ${index + 1}`,
    result: 'Result',
    save: 'Save',
    saved: 'Settings saved and polling restarted.',
    saving: 'Saving...',
    scheduled: 'Focus Timer',
    seconds: 'seconds',
    selectLanguage: 'Select language',
    selectRequestMethod: 'Select request method',
    title: 'Title',
    unavailableTab: 'This tab will be available later.',
    unableToLoad: 'Unable to load settings.',
    unnamedRequest: 'Untitled request',
    updateAgentFailed: 'Failed to update Agent Hook status.',
    agent: 'Agent',
    widthOptions: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
    },
  },
};

type KeyValueEditorProps = {
  addLabel: string;
  deleteLabel: string;
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
  variantId?: CodexInstallVariantId;
};

type HighlightedTemplateInputProps = {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

const TEMPLATE_INPUT_MIN_HEIGHT_PX = 36;

function createBlankSource(name: string): SourceConfig {
  return {
    id: `source-${Math.random().toString(36).slice(2, 8)}`,
    name,
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

function updateFocusTimerOption(
  config: AppConfig,
  optionId: string,
  updater: (option: FocusTimerConfigOption) => FocusTimerConfigOption
): AppConfig {
  return {
    ...config,
    focusTimers: {
      ...config.focusTimers,
      options: config.focusTimers.options.map((option) => (option.id === optionId ? updater(option) : option)),
    },
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

function formatRequestLabel(source: SourceConfig, index: number, text: ConfigText): string {
  const name = source.name.trim();
  return name.length > 0 ? name : text.requestNumber(index);
}

function getSaveValidationMessage(config: AppConfig, text: ConfigText): string | null {
  if (!Number.isFinite(config.rotationIntervalMs) || config.rotationIntervalMs < 1000) {
    return config.language === 'en-US'
      ? 'Island rotation interval must be at least 1 second.'
      : '灵动岛轮转间隔不能小于 1 秒。';
  }

  for (const [index, source] of config.sources.entries()) {
    const label = text.requestNumber(index);

    if (!source.name.trim()) {
      return config.language === 'en-US' ? `${label} name is required.` : `${label} 的名称不能为空。`;
    }

    if (!source.request.url.trim()) {
      return config.language === 'en-US' ? `${label} URL is required.` : `${label} 的 URL 不能为空。`;
    }

    if (!source.fieldMappings.title.trim()) {
      return config.language === 'en-US' ? `${label} title mapping is required.` : `${label} 的标题不能为空。`;
    }
  }

  return null;
}

function getFocusTimerDisplayLabel(option: FocusTimerConfigOption, language: AppLanguage): string {
  if (language === 'en-US') {
    if (option.id === CUSTOM_FOCUS_TIMER_ID) {
      return `Custom countdown ${option.durationMinutes} min`;
    }

    return `Countdown ${option.durationMinutes} min`;
  }

  return formatFocusTimerConfigOptionLabel(option);
}

function normalizeFocusTimerOption(option: FocusTimerConfigOption): FocusTimerConfigOption {
  const durationMinutes = Number.isFinite(option.durationMinutes)
    ? Math.max(1, Math.min(24 * 60, Math.round(option.durationMinutes)))
    : 1;

  return {
    ...option,
    label: option.id === CUSTOM_FOCUS_TIMER_ID
      ? '自定义倒计时'
      : option.label.trim(),
    durationMinutes,
  };
}

function formatJsonString(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return value;
  }

  try {
    return JSON.stringify(JSON.parse(trimmedValue), null, 2);
  } catch {
    return value;
  }
}

function normalizeConfigForEditor(config: AppConfig): AppConfig {
  return {
    ...config,
    sources: config.sources.map((source) => ({
      ...source,
      request: {
        ...source.request,
        body: typeof source.request.body === 'string'
          ? formatJsonString(source.request.body)
          : source.request.body,
      },
    })),
  };
}

function Field({ children, label }: FieldProps): JSX.Element {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label className="text-[11px]">{label}</Label>
      </div>
      {children}
    </div>
  );
}

function KeyValueEditor({ addLabel, deleteLabel, entries, keyPlaceholder, onChange, valuePlaceholder }: KeyValueEditorProps): JSX.Element {
  const safeEntries = entries.length > 0 ? entries : [EMPTY_ENTRY];

  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2.5">
        {safeEntries.map((entry, index) => (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={`${keyPlaceholder}-${index}`}>
            <Input
              className="h-9 text-xs file:text-xs"
              value={entry.key}
              placeholder={keyPlaceholder}
              onChange={(event) => {
                onChange(updateEntry(safeEntries, index, 'key', event.target.value));
              }}
            />
            <Input
              className="h-9 text-xs file:text-xs"
              value={entry.value}
              placeholder={valuePlaceholder}
              onChange={(event) => {
                onChange(updateEntry(safeEntries, index, 'value', event.target.value));
              }}
            />
            <Button
              className="h-9 text-xs sm:self-auto"
              size="sm"
              variant="outline"
              onClick={() => {
                onChange(safeEntries.filter((_, currentIndex) => currentIndex !== index));
              }}
            >
              {deleteLabel}
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          className="h-9 text-xs"
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

function renderHighlightedTemplate(value: string, placeholder: string): React.ReactNode {
  if (!value) {
    return <span className="text-zinc-400">{placeholder}</span>;
  }

  const parts = value.split(/(\{\{[\s\S]*?\}\})/g);

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    const isTemplateToken = /^\{\{[\s\S]*\}\}$/.test(part);
    if (!isTemplateToken) {
      return <span key={`text-${index}`}>{part}</span>;
    }

    return (
      <span
        key={`token-${index}`}
        className="text-emerald-600"
      >
        {part}
      </span>
    );
  });
}

function HighlightedTemplateInput({ onChange, placeholder, value }: HighlightedTemplateInputProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textareaElement = textareaRef.current;
    if (!textareaElement) {
      return;
    }

    textareaElement.style.height = '0px';
    textareaElement.style.height = `${Math.max(textareaElement.scrollHeight, TEMPLATE_INPUT_MIN_HEIGHT_PX)}px`;
  }, [value]);

  return (
    <div className="relative rounded-md border border-zinc-200 bg-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md px-2.5 py-1 text-xs font-normal leading-6 tracking-normal text-zinc-950 whitespace-pre-wrap break-words">
        {renderHighlightedTemplate(value, placeholder)}
      </div>
      <textarea
        ref={textareaRef}
        className="relative z-10 block min-h-9 w-full resize-none overflow-hidden rounded-md bg-transparent px-2.5 py-1 text-xs font-normal leading-6 tracking-normal text-transparent caret-zinc-950 outline-none selection:bg-emerald-100/45 selection:text-transparent"
        spellCheck={false}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function getLocalizedInstallStateBadge(status: AgentHookInstallStatus, text: ConfigText): { className: string; label: string } {
  const isEnglish = text === CONFIG_TEXT['en-US'];

  if (status.errorMessage) {
    return {
      className: 'bg-red-50 text-red-700',
      label: isEnglish ? 'Read failed' : '读取失败',
    };
  }

  if (status.isInstalled) {
    return {
      className: 'bg-emerald-50 text-emerald-700',
      label: isEnglish ? 'Installed' : '已安装',
    };
  }

  if (status.isPartiallyInstalled) {
    return {
      className: 'bg-amber-50 text-amber-700',
      label: isEnglish ? 'Partially installed' : '部分安装',
    };
  }

  return {
    className: 'bg-zinc-100 text-zinc-600',
    label: isEnglish ? 'Not installed' : '未安装',
  };
}

function getLocalizedAgentInstallStatusMessage(status: AgentHookInstallStatus, language: AppLanguage): string {
  if (language !== 'en-US') {
    return status.statusMessage;
  }

  switch (status.statusMessage) {
    case '已自动安装（含 PreToolUse）':
      return 'Auto-installed (with PreToolUse)';
    case '已自动安装（不含 PreToolUse）':
      return 'Auto-installed (without PreToolUse)';
    case '已自动安装':
      return 'Auto-installed';
    case '未安装':
      return 'Not installed';
    case '读取失败':
      return 'Read failed';
    case '部分已安装，建议重新安装一次':
      return 'Partially installed. Please reinstall once.';
    case '部分已安装，建议重新安装一次（当前记录为不含 PreToolUse）':
      return 'Partially installed. Please reinstall once. Current record excludes PreToolUse.';
    case '部分已安装，建议重新安装一次（当前记录为含 PreToolUse）':
      return 'Partially installed. Please reinstall once. Current record includes PreToolUse.';
    default:
      return status.statusMessage;
  }
}

export default function ConfigApp(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [agentSetup, setAgentSetup] = useState<AgentHookSetup | null>(null);
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const [agentActionMessage, setAgentActionMessage] = useState<string | null>(null);
  const [agentErrorMessage, setAgentErrorMessage] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pendingDeleteSourceId, setPendingDeleteSourceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConfigTabId>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const language = config?.language ?? 'zh-CN';
  const text = CONFIG_TEXT[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let disposed = false;

    void window.api.config.get().then((nextConfig) => {
      if (disposed) {
        return;
      }

      const normalizedConfig = normalizeConfigForEditor(nextConfig);
      setConfig(normalizedConfig);
      setSelectedSourceId(normalizedConfig.sources[0]?.id ?? null);
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
        setAgentErrorMessage(CONFIG_TEXT['zh-CN'].agentSetupLoadFailed);
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

  const refreshAgentSetup = async (): Promise<AgentHookSetup> => {
    const nextSetup = await window.api.agent.getSetup();
    setAgentSetup(nextSetup);
    setAgentErrorMessage(null);
    return nextSetup;
  };

  const handleManagedHookAction = async (
    source: AgentTool,
    mode: AgentAction['mode'],
    options?: AgentInstallManagedHooksOptions
  ): Promise<void> => {
    setAgentAction({ source, mode, variantId: options?.variantId });
    setAgentActionMessage(null);
    setAgentErrorMessage(null);

    try {
      const nextSetup = mode === 'install'
        ? await window.api.agent.installManagedHooks(source, options)
        : await window.api.agent.uninstallManagedHooks(source);
      setAgentSetup(nextSetup);
      const nextStatus = nextSetup.installStatuses.find((status) => status.source === source);
      const nextStatusMessage = nextStatus
        ? getLocalizedAgentInstallStatusMessage(nextStatus, language)
        : language === 'en-US' ? 'Installed.' : '安装完成。';
      setAgentActionMessage(mode === 'install'
        ? `${AGENT_TOOL_LABELS[source]}: ${nextStatusMessage}`
        : language === 'en-US' ? `${AGENT_TOOL_LABELS[source]} uninstalled.` : `${AGENT_TOOL_LABELS[source]} 已卸载。`);
    } catch (error) {
      await refreshAgentSetup().catch(() => undefined);
      setAgentErrorMessage(error instanceof Error ? error.message : text.updateAgentFailed);
    } finally {
      setAgentAction(null);
    }
  };

  const addPollingSource = (): void => {
    if (!config) {
      return;
    }

    const nextSource = createBlankSource(text.unnamedRequest);
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

    const saveValidationMessage = getSaveValidationMessage(config, text);
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
        rotationIntervalMs: Math.max(1000, Math.round(config.rotationIntervalMs)),
        language: config.language,
        islandWidthPreset: config.islandWidthPreset,
        focusTimers: {
          ...config.focusTimers,
          options: config.focusTimers.options.map(normalizeFocusTimerOption),
        },
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

      const savedConfig = normalizeConfigForEditor(await window.api.config.save(normalizedConfig));
      setConfig(savedConfig);
      setSelectedSourceId(savedConfig.sources.find((source) => source.id === selectedSourceId)?.id ?? savedConfig.sources[0]?.id ?? null);
      setValidationError(null);
      setSaveMessage(text.saved);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <main className="config-page grid min-h-screen place-items-center px-6 text-[11px] text-zinc-500">{text.loading}</main>;
  }

  if (!config) {
    return <main className="config-page grid min-h-screen place-items-center px-6 text-[11px] text-zinc-500">{text.unableToLoad}</main>;
  }

  return (
    <main className="config-page">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-4 px-4 py-5 lg:h-screen lg:grid-cols-[190px_minmax(0,1fr)] lg:overflow-hidden lg:px-5">
        <aside className="flex min-h-full self-stretch border-r border-zinc-200 pr-2.5 lg:sticky lg:top-0 lg:h-[calc(100vh-2.5rem)] lg:self-start">
          <nav aria-label="Configuration tabs" className="grid w-full content-start gap-1 py-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'flex h-9 items-center rounded-md px-3 text-[13px] transition-colors',
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
                {text[tab.id]}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {activeTab === 'general' ? (
            <div className="space-y-5">
              <div className="sticky top-0 z-10 space-y-5 bg-[#fafafa] pb-4">
                {validationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{validationError}</div> : null}
                {saveMessage ? <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] text-zinc-700">{saveMessage}</div> : null}

                <section className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.general}</h2>
                    <Button className="h-8 px-3 text-xs" size="sm" disabled={isSaving} onClick={() => void handleSave()}>
                      {isSaving ? text.saving : text.save}
                    </Button>
                  </div>
                </section>
              </div>

              <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <Field label={text.islandRotationInterval}>
                    <div className="inline-flex w-full max-w-[180px] items-center gap-2">
                      <Input
                        className="h-9 min-w-0 text-xs file:text-xs"
                        type="number"
                        min={1}
                        value={Math.max(1, Math.round(config.rotationIntervalMs / 1000))}
                        onChange={(event) => {
                          const parsedValue = Number(event.target.value);
                          const intervalSeconds = Number.isFinite(parsedValue)
                            ? Math.max(1, Math.round(parsedValue))
                            : 1;
                          applyConfig({
                            ...config,
                            rotationIntervalMs: intervalSeconds * 1000,
                          });
                        }}
                      />
                      <span className="shrink-0 whitespace-nowrap text-xs leading-none text-zinc-500">{text.seconds}</span>
                    </div>
                  </Field>

                  <Field label={text.language}>
                    <Select
                      value={config.language}
                      onValueChange={(value) => {
                        applyConfig({
                          ...config,
                          language: value as AppLanguage,
                        });
                      }}
                    >
                      <SelectTrigger className="h-9 px-2.5 text-xs">
                        <SelectValue placeholder={text.selectLanguage} />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        {(Object.keys(text.languageOptions) as AppLanguage[]).map((value) => (
                          <SelectItem className="py-1.5 text-xs" key={value} value={value}>
                            {text.languageOptions[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label={text.islandWidth}>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1">
                      {(Object.keys(text.widthOptions) as IslandWidthPreset[]).map((value) => {
                        const isSelected = config.islandWidthPreset === value;

                        return (
                          <button
                            key={value}
                            type="button"
                            className={cn(
                              'h-8 rounded-md px-3 text-xs font-medium transition-colors',
                              isSelected ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-950'
                            )}
                            onClick={() => {
                              applyConfig({
                                ...config,
                                islandWidthPreset: value,
                              });
                            }}
                          >
                            {text.widthOptions[value]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              </section>
            </div>
          ) : activeTab === 'scheduled' ? (
            <div className="space-y-5">
              <div className="sticky top-0 z-10 space-y-5 bg-[#fafafa] pb-4">
                {validationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{validationError}</div> : null}
                {saveMessage ? <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] text-zinc-700">{saveMessage}</div> : null}

                <section className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.focusTimer}</h2>
                    <Button className="h-8 px-3 text-xs" size="sm" disabled={isSaving} onClick={() => void handleSave()}>
                      {isSaving ? text.saving : text.save}
                    </Button>
                  </div>
                </section>
              </div>

              <section className="grid gap-2">
                {config.focusTimers.options.map((option) => {
                  const isCustomOption = option.id === CUSTOM_FOCUS_TIMER_ID;

                  return (
                    <div
                      key={option.id}
                      className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="grid gap-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="text-sm font-medium text-zinc-950">{getFocusTimerDisplayLabel(option, language)}</p>
                          {option.id === 'countdown-25' ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{text.defaultBadge}</span>
                          ) : null}
                        </div>
                        {isCustomOption ? (
                          <div className="inline-flex w-full max-w-[180px] items-center gap-2">
                            <Input
                              className="h-9 min-w-0 text-xs file:text-xs"
                              type="number"
                              min={1}
                              max={24 * 60}
                              value={option.durationMinutes}
                              onChange={(event) => {
                                const parsedValue = Number(event.target.value);
                                const durationMinutes = Number.isFinite(parsedValue)
                                  ? Math.max(1, Math.min(24 * 60, Math.round(parsedValue)))
                                  : 1;
                                applyConfig(updateFocusTimerOption(config, option.id, (currentOption) => ({
                                  ...currentOption,
                                  durationMinutes,
                                })));
                              }}
                            />
                            <span className="shrink-0 whitespace-nowrap text-xs leading-none text-zinc-500">{text.minutes}</span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-500">{text.minutesCountdown(option.durationMinutes)}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={option.enabled}
                        aria-label={`${getFocusTimerDisplayLabel(option, language)} ${language === 'en-US' ? 'switch' : '开关'}`}
                        className={cn(
                          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                          option.enabled ? 'bg-zinc-950' : 'bg-zinc-200'
                        )}
                        onClick={() => {
                          applyConfig(updateFocusTimerOption(config, option.id, (currentOption) => ({
                            ...currentOption,
                            enabled: !currentOption.enabled,
                          })));
                        }}
                      >
                        <span
                          className={cn(
                            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                            option.enabled ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </section>
            </div>
          ) : activeTab === 'agent' ? (
            <div className="space-y-5">
              {validationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{validationError}</div> : null}
              {saveMessage ? <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] text-zinc-700">{saveMessage}</div> : null}

              <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Agent Hook Bridge</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium',
                      agentSetup?.isServerRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      {agentSetup?.isServerRunning ? text.bridgeReady : text.bridgeNotReady}
                    </span>
                    <Button
                      className="h-8 px-3 text-xs"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void refreshAgentSetup().catch((error) => {
                          setAgentErrorMessage(error instanceof Error ? error.message : text.agentSetupRefreshFailed);
                        });
                      }}
                    >
                      {language === 'en-US' ? 'Refresh' : '刷新状态'}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                  <p>{agentSetup?.statusMessage ?? text.bridgeStatusFallback}</p>
                </div>
              </section>

              {agentErrorMessage ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  {agentErrorMessage}
                </div>
              ) : null}

              {agentActionMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                  {agentActionMessage}
                </div>
              ) : null}

              <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="grid gap-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.agentHookStatus}</h2>
                </div>

                {installStatuses.length > 0 ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {installStatuses.map((status) => {
                      const badge = getLocalizedInstallStateBadge(status, text);
                      const statusMessage = getLocalizedAgentInstallStatusMessage(status, language);
                      const isBusy = agentAction?.source === status.source;

                      return (
                        <section key={status.source} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid gap-1">
                              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600">
                                {AGENT_TOOL_LABELS[status.source]}
                              </h3>
                              {status.source === 'codex' ? (
                                <p className="text-[11px] text-zinc-500">{statusMessage}</p>
                              ) : null}
                            </div>
                            <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium', badge.className)}>
                              {badge.label}
                            </span>
                          </div>

                          {status.errorMessage ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                              {status.errorMessage}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            {status.source === 'codex' ? (
                              <>
                                <Button
                                  className="h-8 px-3 text-xs"
                                  size="sm"
                                  disabled={agentAction !== null}
                                  onClick={() => {
                                    void handleManagedHookAction(status.source, 'install', { variantId: 'standard' });
                                  }}
                                >
                                  {isBusy && agentAction?.mode === 'install' && agentAction.variantId === 'standard'
                                    ? (language === 'en-US' ? 'Installing...' : '安装中...')
                                    : language === 'en-US' ? 'Install standard' : '安装标准版'}
                                </Button>
                                <Button
                                  className="h-8 px-3 text-xs"
                                  size="sm"
                                  variant="outline"
                                  disabled={agentAction !== null}
                                  onClick={() => {
                                    void handleManagedHookAction(status.source, 'install', { variantId: 'no-pretooluse' });
                                  }}
                                >
                                  {isBusy && agentAction?.mode === 'install' && agentAction.variantId === 'no-pretooluse'
                                    ? (language === 'en-US' ? 'Installing...' : '安装中...')
                                    : language === 'en-US' ? 'Install without PreToolUse' : '安装无 PreToolUse 版'}
                                </Button>
                              </>
                            ) : (
                              <Button
                                className="h-8 px-3 text-xs"
                                size="sm"
                                disabled={agentAction !== null}
                                onClick={() => {
                                  void handleManagedHookAction(status.source, 'install');
                                }}
                              >
                                {isBusy && agentAction?.mode === 'install'
                                  ? (language === 'en-US' ? 'Installing...' : '安装中...')
                                  : (language === 'en-US' ? 'Install' : '安装')}
                              </Button>
                            )}
                            <Button
                              className="h-8 px-3 text-xs"
                              size="sm"
                              variant="outline"
                              disabled={agentAction !== null || (!status.isInstalled && !status.isPartiallyInstalled)}
                              onClick={() => {
                                void handleManagedHookAction(status.source, 'uninstall');
                              }}
                            >
                              {isBusy && agentAction?.mode === 'uninstall'
                                ? (language === 'en-US' ? 'Uninstalling...' : '卸载中...')
                                : (language === 'en-US' ? 'Uninstall' : '卸载')}
                            </Button>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-[160px] place-items-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 text-[11px] text-zinc-500">
                    {text.noAgentStatuses}
                  </div>
                )}
              </section>
            </div>
          ) : activeTab !== 'polling' ? (
            <div className="grid min-h-[240px] place-items-center rounded-xl border border-zinc-200 bg-white px-4 text-[11px] text-zinc-500">
              {text.unavailableTab}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="sticky top-0 z-10 space-y-5 bg-[#fafafa] pb-4">
                {validationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{validationError}</div> : null}
                {saveMessage ? <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] text-zinc-700">{saveMessage}</div> : null}

                <section className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.requestList}</h2>
                    <div className="flex items-center gap-2">
                      <Button
                        className="h-8 w-8"
                        size="icon"
                        variant="outline"
                        aria-label={text.addPollingRequest}
                        onClick={addPollingSource}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button className="h-8 px-3 text-xs" size="sm" disabled={isSaving} onClick={() => void handleSave()}>
                        {isSaving ? text.saving : text.save}
                      </Button>
                    </div>
                  </div>

                  {config.sources.length > 0 ? (
                    <div className="flex flex-wrap gap-1" role="tablist" aria-label={text.polling}>
                      {config.sources.map((source, index) => {
                        const isSelected = selectedSourceId === source.id;
                        const isDeletePending = pendingDeleteSourceId === source.id;

                        return (
                          <div
                            key={source.id}
                            className={cn(
                              'inline-flex items-center overflow-hidden rounded-md border bg-white text-[11px] transition-colors',
                              isSelected ? 'border-zinc-300 text-zinc-950 shadow-sm' : 'border-zinc-200 text-zinc-700'
                            )}
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={isSelected}
                              className={cn(
                                'flex h-8 items-center gap-1.5 px-3 transition-colors',
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
                              <span>{formatRequestLabel(source, index, text)}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={isDeletePending
                                ? `${text.confirm} ${text.delete} ${formatRequestLabel(source, index, text)}`
                                : `${text.delete} ${formatRequestLabel(source, index, text)}`}
                              className={cn(
                                'flex h-8 min-w-8 items-center justify-center border-l border-zinc-200 px-2.5 text-red-600 transition-colors hover:text-red-700',
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
                              {isDeletePending ? text.confirm : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid min-h-[72px] place-items-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 text-[11px] text-zinc-500">
                      {text.noPollingSources}
                    </div>
                  )}
                </section>
              </div>

              {selectedSource ? (
                <>
                  <section className="space-y-2.5">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{language === 'en-US' ? 'Basic Settings' : '基础配置'}</h2>
                    <div className="grid gap-4">
                      <div className="grid gap-2.5 xl:grid-cols-3">
                        <Field label={text.name}>
                          <Input
                            className="h-9 text-xs file:text-xs"
                            value={selectedSource.name}
                            placeholder={language === 'en-US' ? 'e.g. Service health' : '例如：Service health'}
                            onChange={(event) => {
                              applyConfig(updateSource(config, selectedSource.id, (source) => ({ ...source, name: event.target.value })));
                            }}
                          />
                        </Field>

                        <Field label={text.requestMethod}>
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
                            <SelectTrigger className="h-9 px-2.5 text-xs">
                              <SelectValue placeholder={text.selectRequestMethod} />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              {REQUEST_METHODS.map((method) => (
                                <SelectItem className="py-1.5 text-xs" key={method} value={method}>{method}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>

                        <Field label={text.pollingFrequency}>
                          <Input
                            className="h-9 text-xs file:text-xs"
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
                          className="h-9 text-xs file:text-xs"
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
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.requestContent}</h2>
                    <div className="grid gap-4">
                      <Field label="Headers">
                        <KeyValueEditor
                          addLabel={text.addHeader}
                          deleteLabel={text.delete}
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
                              className="text-xs leading-5"
                              value={selectedSource.request.body ?? ''}
                              placeholder={'{\n  "env": "prod"\n}'}
                              onChange={(event) => {
                                applyConfig(updateSource(config, selectedSource.id, (source) => ({
                                  ...source,
                                  request: {
                                    ...source.request,
                                    body: event.target.value,
                                  },
                                })));
                              }}
                              onBlur={(event) => {
                                const formattedBody = formatJsonString(event.target.value);
                                if (formattedBody === event.target.value) {
                                  return;
                                }

                                applyConfig(updateSource(config, selectedSource.id, (source) => ({
                                  ...source,
                                  request: {
                                    ...source.request,
                                    body: formattedBody,
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
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{text.fieldMappings}</h2>
                    <div className="grid gap-4">
                      <Field label={text.title}>
                        <HighlightedTemplateInput
                          value={selectedSource.fieldMappings.title}
                          placeholder={language === 'en-US' ? 'Required, e.g. {{ $data.label.trim() }}' : '请填写，如 {{ $data.label.trim() }}'}
                          onChange={(value) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                title: value,
                              },
                            })));
                          }}
                        />
                      </Field>

                      <Field label={text.result}>
                        <HighlightedTemplateInput
                          value={selectedSource.fieldMappings.summary ?? ''}
                          placeholder={language === 'en-US' ? 'e.g. {{ $data.value.toFixed(2) }}' : '请填写，如 {{ $data.value.toFixed(2) }}'}
                          onChange={(value) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                summary: value,
                              },
                            })));
                          }}
                        />
                      </Field>

                      <Field label={text.details}>
                        <HighlightedTemplateInput
                          value={selectedSource.fieldMappings.detail ?? ''}
                          placeholder={language === 'en-US' ? 'e.g. {{ $data.label.trim() }}' : '请填写，如 {{ $data.label.trim() }}'}
                          onChange={(value) => {
                            applyConfig(updateSource(config, selectedSource.id, (source) => ({
                              ...source,
                              fieldMappings: {
                                ...source.fieldMappings,
                                detail: value,
                              },
                            })));
                          }}
                        />
                      </Field>
                    </div>
                  </section>
                </>
              ) : (
                <div className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 text-[11px] text-zinc-500">
                  {text.pollingEmptyDetail}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
