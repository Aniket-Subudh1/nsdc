import { useCallback, useRef, useState } from "react";

/**
 * Separates the first-load skeleton from later background refreshes so
 * existing UI stays visible while data is re-fetched.
 */
export function useRefreshableLoad() {
  const hasLoadedRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const begin = useCallback(() => {
    if (hasLoadedRef.current) {
      setIsRefreshing(true);
      return;
    }

    setIsInitialLoading(true);
  }, []);

  const end = useCallback(() => {
    hasLoadedRef.current = true;
    setIsInitialLoading(false);
    setIsRefreshing(false);
  }, []);

  const hasLoaded = useCallback(() => hasLoadedRef.current, []);

  return {
    begin,
    end,
    hasLoaded,
    isInitialLoading,
    isRefreshing,
  };
}
