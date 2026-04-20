import { createContext, useContext } from 'react';

import type { OverlayState } from '@shared/types/source-data';

type OverlayContextValue = {
  state: OverlayState | null;
  isLoading: boolean;
  loadError: string | null;
  reloadConfig: () => Promise<void>;
};

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlayContext(): OverlayContextValue {
  const context = useContext(OverlayContext);

  if (!context) {
    throw new Error('OverlayContext is not available');
  }

  return context;
}
