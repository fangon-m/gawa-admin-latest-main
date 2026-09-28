import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for fetching data from the API.
 * Provides consistent loading/error/data state management.
 *
 * @param {Function} fetchFn - Async function that returns { data, ... }
 * @param {Array} deps - Dependency array to re-fetch on changes
 * @param {Object} options
 * @param {*} options.defaultValue - Default value for data (default: [])
 * @param {boolean} options.immediate - Whether to fetch on mount (default: true)
 * @param {Function} options.transform - Optional transform function for response data
 * @returns {{ data, loading, error, refetch }}
 */
export function useApiData(fetchFn, deps = [], options = {}) {
  const { defaultValue = [], immediate = true, transform } = options;
  const [data, setData] = useState(defaultValue);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFn();
      if (mountedRef.current) {
        const hasWrappedPayload = response && typeof response === 'object' && 'data' in response && ('stats' in response || 'pagination' in response || 'meta' in response || 'message' in response);
        const result = hasWrappedPayload ? response : (response?.data ?? response ?? defaultValue);
        setData(transform ? transform(result) : result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err?.error || err?.message || 'An error occurred');
        setData(defaultValue);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (immediate) fetch();

    const handleRevalidate = () => {
      if (document.visibilityState === 'visible') {
        fetch();
      }
    };

    window.addEventListener('focus', handleRevalidate);
    document.addEventListener('visibilitychange', handleRevalidate);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleRevalidate);
    };
  }, [fetch, immediate]);

  return { data, loading, error, refetch: fetch };
}

/**
 * Hook for executing a single mutation (POST/PUT/DELETE).
 * Returns [execute, { loading, error, data }]
 *
 * @param {Function} mutationFn - Async function for the mutation
 * @returns {[Function, { loading, error, data }]}
 */
export function useMutation(mutationFn) {
  const [state, setState] = useState({ loading: false, error: null, data: null });

  const execute = useCallback(async (...args) => {
    setState({ loading: true, error: null, data: null });
    try {
      const response = await mutationFn(...args);
      setState({ loading: false, error: null, data: response?.data ?? response });
      return response;
    } catch (err) {
      setState({ loading: false, error: err?.error || err?.message || 'An error occurred', data: null });
      throw err;
    }
  }, [mutationFn]);

  return [execute, state];
}
