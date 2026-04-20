import type { SourceState } from '@shared/types/source-data';

type IslandCompactProps = {
  source: SourceState;
};

export function IslandCompact({ source }: IslandCompactProps): JSX.Element {
  const iconLabel = source.icon ?? source.name.slice(0, 2).toUpperCase();
  const statusLabel = source.status === 'error' ? 'Source error' : source.type.toUpperCase();

  return (
    <>
      <span className="island__icon" aria-hidden="true">
        {iconLabel}
      </span>
      <div className="island__content">
        <p className="island__eyebrow">{statusLabel}</p>
        <p className="island__title">{source.summary.title}</p>
      </div>
    </>
  );
}
