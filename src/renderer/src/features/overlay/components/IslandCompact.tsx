import lightBulbIcon from '../../../assets/compact-icons/light-bulb.svg';
import faceIdIcon from '../../../assets/compact-icons/face-id.svg';
import helpIcon from '../../../assets/compact-icons/help.svg';
import clipIcon from '../../../assets/compact-icons/clip.svg';
import polaroidIcon from '../../../assets/compact-icons/polaroid.svg';
import coinIcon from '../../../assets/compact-icons/coin.svg';
import targetIcon from '../../../assets/compact-icons/target.svg';
import startupIcon from '../../../assets/compact-icons/startup.svg';
import androidIcon from '../../../assets/compact-icons/android.svg';

import { AGENT_TOOL_LABELS, type AgentReminder } from '@shared/types/agent-hook';
import type { SourceState } from '@shared/types/source-data';

export type PixelCompactIconVariant =
  | 'lightBulb'
  | 'faceId'
  | 'help'
  | 'clip'
  | 'polaroid'
  | 'coin'
  | 'target'
  | 'startup'
  | 'android';

type IslandCompactProps = {
  source: SourceState | null;
  reminder?: AgentReminder | null;
};

type PixelCompactIconProps = {
  variant: PixelCompactIconVariant;
};

const READY_ICON_VARIANTS: PixelCompactIconVariant[] = [
  'lightBulb',
  'faceId',
  'help',
  'clip',
  'polaroid',
  'coin',
  'target',
  'startup',
  'android',
];

function shuffleVariants(variants: readonly PixelCompactIconVariant[]): PixelCompactIconVariant[] {
  const next = [...variants];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    const swapped = next[swapIndex];

    if (!current || !swapped) {
      continue;
    }

    next[index] = swapped;
    next[swapIndex] = current;
  }

  return next;
}

const STARTUP_ICON_VARIANTS = shuffleVariants(READY_ICON_VARIANTS);

const ICON_ASSETS: Record<PixelCompactIconVariant, string> = {
  lightBulb: lightBulbIcon,
  faceId: faceIdIcon,
  help: helpIcon,
  clip: clipIcon,
  polaroid: polaroidIcon,
  coin: coinIcon,
  target: targetIcon,
  startup: startupIcon,
  android: androidIcon,
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

function pickStartupVariant(index: number): PixelCompactIconVariant {
  const normalizedIndex = ((index % STARTUP_ICON_VARIANTS.length) + STARTUP_ICON_VARIANTS.length) % STARTUP_ICON_VARIANTS.length;
  return STARTUP_ICON_VARIANTS[normalizedIndex] ?? 'lightBulb';
}

export function getPlaceholderIconVariant(kind: 'default' | 'loading' | 'error'): PixelCompactIconVariant {
  if (kind === 'loading') {
    return pickStartupVariant(1);
  }

  if (kind === 'error') {
    return pickStartupVariant(2);
  }

  return pickStartupVariant(0);
}

export function PixelCompactIcon({ variant }: PixelCompactIconProps): JSX.Element {
  const iconUrl = ICON_ASSETS[variant];

  return (
    <span className={`island__pixel-icon island__pixel-icon--${variant}`} aria-hidden="true">
      <span
        className={`island__pixel-icon-mask island__pixel-icon-mask--${variant}`}
        style={{
          WebkitMaskImage: `url("${iconUrl}")`,
          maskImage: `url("${iconUrl}")`,
        }}
      />
    </span>
  );
}

function getReadyIconVariant(source: SourceState): PixelCompactIconVariant {
  const seed = hashCompactSeed(`${source.id}:${source.name}`);
  return pickStartupVariant(seed);
}

function getSourceIconVariant(source: SourceState): PixelCompactIconVariant {
  switch (source.status) {
    case 'loading':
      return pickStartupVariant(1);
    case 'error':
      return pickStartupVariant(2);
    case 'idle':
      return pickStartupVariant(0);
    case 'ready':
    default:
      return getReadyIconVariant(source);
  }
}

function getReminderIconVariant(reminder: AgentReminder): PixelCompactIconVariant {
  if (reminder.tone === 'attention') {
    return pickStartupVariant(2);
  }

  if (reminder.tone === 'success') {
    return pickStartupVariant(3);
  }

  return pickStartupVariant(0);
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
        <PixelCompactIcon variant={pickStartupVariant(0)} />
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
