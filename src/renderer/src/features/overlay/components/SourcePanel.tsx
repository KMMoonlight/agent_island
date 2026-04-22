import type { OverlayItem, SourceState } from '@shared/types/source-data';

type SourcePanelProps = {
  source: SourceState;
  onOpenTarget: (targetUrl: string | undefined) => void;
};

function getTitleText(item: OverlayItem): string {
  const trimmedTitle = item.title?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : 'None';
}

function getPrimaryText(item: OverlayItem): string {
  const trimmedDetail = item.detail?.trim();
  return trimmedDetail && trimmedDetail.length > 0 ? trimmedDetail : 'None';
}

function renderItem(item: OverlayItem, onOpenTarget: (targetUrl: string | undefined) => void): JSX.Element {
  const isClickable = Boolean(item.clickTarget);
  const titleText = getTitleText(item);
  const primaryText = getPrimaryText(item);

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
        <div className="source-panel__item-copy">
          <p className="source-panel__item-title">{titleText}</p>
          <p className="source-panel__item-detail">{primaryText}</p>
        </div>
      </button>
    </li>
  );
}

export function SourcePanel({ source, onOpenTarget }: SourcePanelProps): JSX.Element {
  if (source.items.length === 0) {
    return (
      <article className={`source-panel source-panel--${source.status}`}>
        {source.lastError ? <p className="source-panel__error">{source.lastError.message}</p> : null}
        <ul className="source-panel__list">
          <li className="source-panel__empty">No items available yet.</li>
        </ul>
      </article>
    );
  }

  return (
    <article className={`source-panel source-panel--${source.status}`}>
      {source.lastError ? <p className="source-panel__error">{source.lastError.message}</p> : null}

      <ul className="source-panel__list">
        {source.items.map((item) => renderItem(item, onOpenTarget))}
      </ul>
    </article>
  );
}
