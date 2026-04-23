import { useEffect, useState } from 'react';

import type { OverlayState } from '@shared/types/source-data';

type UseOverlayStateResult = {
  state: OverlayState | null;
  isLoading: boolean;
  loadError: string | null;
};

export function useOverlayState(): UseOverlayStateResult {
  const [state, setState] = useState<OverlayState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;

    async function loadInitialState(): Promise<void> {
      try {
        const nextState = await window.api.overlay.getState();

        if (isDisposed) {
          return;
        }

        setState(nextState);
        setLoadError(null);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        const normalizedError = error instanceof Error ? error : new Error('Failed to load overlay state');
        setLoadError(normalizedError.message);
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    }

    const unsubscribe = window.api.overlay.subscribe((nextState) => {
      if (isDisposed) {
        return;
      }

      setState(nextState);
      setLoadError(null);
      setIsLoading(false);
    });

    void loadInitialState();

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, []);

  return {
    state,
    isLoading,
    loadError,
  };
}
