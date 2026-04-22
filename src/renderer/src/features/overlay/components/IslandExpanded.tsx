import type { OverlayState } from '@shared/types/source-data';

import { SourcePanel } from './SourcePanel';

type IslandExpandedProps = {
  state: OverlayState;
  onOpenTarget: (targetUrl: string | undefined) => void;
  onRefreshSources: () => Promise<void>;
};

export function IslandExpanded({ state, onOpenTarget, onRefreshSources: _onRefreshSources }: IslandExpandedProps): JSX.Element {
  return (
    <div className="island__expanded-stage">
      <div className="island__expanded-grid">
        {state.sources.map((source) => (
          <SourcePanel key={source.id} source={source} onOpenTarget={onOpenTarget} />
        ))}
      </div>
    </div>
  );
}
