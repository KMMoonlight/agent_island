import type { ReactNode } from 'react';

import { useOverlayState } from '../hooks/useOverlayState';
import { OverlayContext } from './overlay-context';

type OverlayProviderProps = {
  children: ReactNode;
};

export function OverlayProvider({ children }: OverlayProviderProps): JSX.Element {
  const value = useOverlayState();

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

