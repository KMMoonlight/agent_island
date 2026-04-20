import type { OverlayItem, SourceState } from '@shared/types/source-data';

type SourcePanelProps = {
  source: SourceState;
  onOpenTarget: (targetUrl: string | undefined) => void;
};

function formatTimestamp(timestampMs: number | null): string | null {
  if (timestampMs === null) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestampMs));
}

function renderItem(item: OverlayItem, onOpenTarget: (targetUrl: string | undefined) => void): JSX.Element {
  const timestamp = formatTimestamp(item.timestampMs);
  const isClickable = Boolean(item.clickTarget);

  return (
    <li key={item.id} className="source-panel__item">
      <button
        type="button"
        className="source-panel__item-button"
        onClick={() => {
          onOpenTarget(item.clickTarget);
        }}
        disabled={!isClickable}
      >
        <div className="source-panel__item-head">
          <strong>{item.title}</strong>
          {timestamp ? <span>{timestamp}</span> : null}
        </div>
        {item.summary ? <p>{item.summary}</p> : null}
        {item.detail && item.detail !== item.summary ? <p>{item.detail}</p> : null}
      </button>
    </li>
  );
}

export function SourcePanel({ source, onOpenTarget }: SourcePanelProps): JSX.Element {
  return (
    <article className={`source-panel source-panel--${source.status}`}>
      <header className="source-panel__header">
        <div>
          <p className="source-panel__eyebrow">{source.type.toUpperCase()}</p>
          <h2>{source.name}</h2>
        </div>
        <span className="source-panel__status">{source.status}</span>
      </header>

      {source.lastError ? <p className="source-panel__error">{source.lastError.message}</p> : null}

      <ul className="source-panel__list">
        {source.items.length > 0 ? (
          source.items.map((item) => renderItem(item, onOpenTarget))
        ) : (
          <li className="source-panel__empty">No items available yet.</li>
        )}
      </ul>
    </article>
  );
}
