import type { OverlayState } from '@shared/types/source-data';

import { SourcePanel } from './SourcePanel';

type IslandExpandedProps = {
  state: OverlayState;
  onOpenTarget: (targetUrl: string | undefined) => void;
  onReloadConfig: () => Promise<void>;
};

export function IslandExpanded({ state, onOpenTarget, onReloadConfig }: IslandExpandedProps): JSX.Element {
  return (
    <>
      <header className="island__expanded-header">
        <div>
          <p className="island__eyebrow">All sources</p>
          <h1 className="island__expanded-title">{state.sources.length} configured feed{state.sources.length === 1 ? '' : 's'}</h1>
        </div>
        <button
          type="button"
          className="island__reload"
          onClick={() => {
            void onReloadConfig();
          }}
        >
          Reload config
        </button>
      </header>

      <div className="island__expanded-grid">
        {state.sources.map((source) => (
          <SourcePanel key={source.id} source={source} onOpenTarget={onOpenTarget} />
        ))}
      </div>
    </>
  );
}
