import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface PreviewProps {
  url: string | null;
}

const LOAD_TIMEOUT_MS = 30000; // 30 seconds

export function Preview({ url }: PreviewProps) {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [key, setKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset loading state when URL changes
  useEffect(() => {
    if (url) {
      setLoadState('loading');

      // Set timeout for loading
      timeoutRef.current = setTimeout(() => {
        setLoadState('error');
      }, LOAD_TIMEOUT_MS);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    } else {
      setLoadState('idle');
    }
  }, [url, key]);

  const handleLoad = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setLoadState('loaded');
  }, []);

  const handleError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setLoadState('error');
  }, []);

  const handleRefresh = useCallback(() => {
    setLoadState('loading');
    setKey((k) => k + 1);
  }, []);

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm text-center p-6 bg-bg">
        <div className="text-4xl mb-4 opacity-40" role="img" aria-label="Monitor">{'\uD83D\uDDA5\uFE0F'}</div>
        <p className="mb-4">No preview available</p>
        <div className="bg-bg-elevated border border-border rounded-lg p-4 max-w-[280px] text-left">
          <p className="text-text text-xs mb-2">Start the dev server:</p>
          <code className="block px-3 py-2 bg-bg rounded text-success text-xs font-mono">
            cd consumer-app && npm run dev
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Preview header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-border text-xs">
        <span className="text-text font-medium">Preview</span>
        <div
          className="flex-1 mx-2 px-2 py-1 bg-bg border border-border rounded text-[11px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
          title={url}
        >
          {url}
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-ghost p-1.5"
          aria-label="Refresh preview"
          disabled={loadState === 'loading'}
        >
          <span
            className={loadState === 'loading' ? 'animate-spin inline-block' : ''}
            aria-hidden="true"
          >
            {'\u21BB'}
          </span>
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost p-1.5"
          aria-label="Open preview in new tab"
        >
          <span aria-hidden="true">{'\u2197'}</span>
        </a>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 relative bg-white">
        {loadState === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-bg z-10"
          >
            <div className="w-32 h-1 bg-border rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-accent rounded-full"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ width: '50%' }}
              />
            </div>
            <p className="text-text-muted text-sm">Loading preview...</p>
          </motion.div>
        )}

        {loadState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg z-10">
            <div className="text-4xl mb-4" role="img" aria-label="Error">{'\u26A0\uFE0F'}</div>
            <p className="text-text-muted text-sm mb-4">Failed to load preview</p>
            <button onClick={handleRefresh} className="btn btn-primary text-sm">
              Retry
            </button>
          </div>
        )}

        <iframe
          key={key}
          src={url}
          onLoad={handleLoad}
          onError={handleError}
          className="w-full h-full border-none"
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
