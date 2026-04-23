import { AGENT_TOOL_LABELS, type AgentReminder } from '@shared/types/agent-hook';
import type { SourceState } from '@shared/types/source-data';

export type PixelCompactIconVariant =
  | 'sync'
  | 'cat'
  | 'dog'
  | 'hamster'
  | 'dino'
  | 'plane'
  | 'rocket'
  | 'car'
  | 'octopus'
  | 'warn'
  | 'info';

type IslandCompactProps = {
  source: SourceState | null;
  reminder?: AgentReminder | null;
};

type PixelCompactIconProps = {
  variant: PixelCompactIconVariant;
};

function compactCopy(value: string, fallback: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return fallback;
  }

  return trimmed;
}

function hashCompactSeed(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function PixelCompactIcon({ variant }: PixelCompactIconProps): JSX.Element {
  return (
    <span className={`island__pixel-icon island__pixel-icon--${variant}`} aria-hidden="true">
      <span className="island__pixel-icon-layer island__pixel-icon-layer--outline" />
      <span className="island__pixel-icon-layer island__pixel-icon-layer--fill" />
      <span className="island__pixel-icon-layer island__pixel-icon-layer--eyes" />
      <span className="island__pixel-icon-layer island__pixel-icon-layer--mouth" />
    </span>
  );
}

function getReadyIconVariant(source: SourceState): PixelCompactIconVariant {
  const seed = hashCompactSeed(`${source.id}:${source.name}`) % 8;

  if (seed === 0) {
    return 'cat';
  }

  if (seed === 1) {
    return 'dog';
  }

  if (seed === 2) {
    return 'hamster';
  }

  if (seed === 3) {
    return 'dino';
  }

  if (seed === 4) {
    return 'plane';
  }

  if (seed === 5) {
    return 'rocket';
  }

  if (seed === 6) {
    return 'car';
  }

  return 'octopus';
}

function getSourceIconVariant(source: SourceState): PixelCompactIconVariant {
  switch (source.status) {
    case 'loading':
      return 'sync';
    case 'error':
      return 'warn';
    case 'idle':
      return 'info';
    case 'ready':
    default:
      return getReadyIconVariant(source);
  }
}

function getReminderIconVariant(reminder: AgentReminder): PixelCompactIconVariant {
  if (reminder.tone === 'attention') {
    return 'warn';
  }

  if (reminder.tone === 'success') {
    return 'rocket';
  }

  return 'info';
}

function getReminderTitle(reminder: AgentReminder): string {
  const toolLabel = AGENT_TOOL_LABELS[reminder.tool];
  return compactCopy(reminder.title, `${toolLabel} 提醒`);
}

function getReminderSummary(reminder: AgentReminder): string {
  return compactCopy(reminder.summary, '有新的 Agent 交互');
}

export function IslandCompact({ source, reminder = null }: IslandCompactProps): JSX.Element {
  if (reminder) {
    return (
      <>
        <PixelCompactIcon variant={getReminderIconVariant(reminder)} />
        <div className="island__content island__content--compact">
          <p className="island__title island__title--inline">{getReminderTitle(reminder)}</p>
          <p className="island__summary">{getReminderSummary(reminder)}</p>
        </div>
      </>
    );
  }

  if (!source) {
    return (
      <>
        <PixelCompactIcon variant="info" />
        <div className="island__content island__content--compact">
          <p className="island__title island__title--inline">No sources configured</p>
          <p className="island__summary">前往设置页启用内容</p>
        </div>
      </>
    );
  }

  const title = compactCopy(source.summary.title, source.name);
  const value = compactCopy(source.summary.text, source.status === 'error' ? '异常' : '更新中');
  const iconVariant = getSourceIconVariant(source);

  return (
    <>
      <PixelCompactIcon variant={iconVariant} />
      <div className="island__content island__content--compact">
        <p className="island__title island__title--inline">{title}</p>
        <p className="island__summary">{value}</p>
      </div>
    </>
  );
}
