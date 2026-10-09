import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  createLatestRead,
  readOptions,
  watchVisibleReads,
} from './browserFreshness.js';


const EMPTY_ATTENTION = Object.freeze({
  scope: 'NONE',
  graceHours: 24,
  candidateCountBeforeGrace: 0,
  graceSuppressedCount: 0,
  attentionCount: 0,
  unlinkedCount: 0,
  reviewExceptionCount: 0,
  items: [],
});


function validAttention(payload) {
  return (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && [
      'ADMIN',
      'PM',
      'OPERATIONS_REVIEW',
      'NONE',
    ].includes(payload.scope)
    && Number.isInteger(payload.attentionCount)
    && payload.attentionCount >= 0
    && Array.isArray(payload.items)
    && payload.items.length === payload.attentionCount
  );
}


export default function useOriginatingBidAttention(options) {
  const latest = useRef(options);
  latest.current = options;

  const [data, setData] = useState(EMPTY_ATTENTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scope = `${options.userKey ?? ''}:${Boolean(options.enabled)}`;

  const owner = useMemo(() => {
    const state = {
      alive: false,
    };

    const usable = () => (
      state.alive
      && latest.current.enabled
      && !latest.current.isEnding()
    );

    const read = createLatestRead({
      read: config => latest.current.fetchJson(
        '/api/originating-bid/attention',
        readOptions(config),
      ),

      publish: payload => {
        if (!usable()) {
          return false;
        }

        if (!validAttention(payload)) {
          throw new Error(
            'Originating-bid notifications returned an invalid response.',
          );
        }

        setData(payload);
        setError(null);
      },

      failed: readError => {
        if (!usable()) {
          return;
        }

        setError(
          readError.message
          || 'Unable to load originating-bid notifications.',
        );

        latest.current.onSessionError(readError);
      },
    });

    const load = async config => {
      if (!usable()) {
        return;
      }

      setLoading(true);

      try {
        return await read.load(config);
      } finally {
        if (usable() && !read.pending) {
          setLoading(false);
        }
      }
    };

    return {
      state,
      usable,
      read,
      load,
    };
  }, [scope]);


  useEffect(() => {
    owner.state.alive = true;
    setData(EMPTY_ATTENTION);
    setLoading(false);
    setError(null);

    return () => {
      owner.state.alive = false;
      owner.read.cancel();
    };
  }, [owner, options.enabled]);


  useEffect(() => {
    if (!options.enabled) {
      return undefined;
    }

    return watchVisibleReads(
      owner.load,
      {
        allowed: owner.usable,
      },
    );
  }, [owner, options.enabled]);


  return {
    data,
    loading,
    error,
    refresh: ({ passive = false } = {}) => (
      owner.load({
        replace: true,
        passive,
      })
    ),
  };
}
