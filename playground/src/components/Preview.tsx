import { useState, useCallback } from 'react';

interface PreviewProps {
  url: string | null;
}

export function Preview({ url }: PreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setKey((k) => k + 1);
  }, []);

  if (!url) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#8b949e',
          fontSize: '14px',
          textAlign: 'center',
          padding: '24px',
          backgroundColor: '#0d1117',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
          🖥️
        </div>
        <p style={{ marginBottom: '12px' }}>No preview available</p>
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '16px',
            maxWidth: '300px',
            fontSize: '12px',
            textAlign: 'left',
          }}
        >
          <p style={{ marginBottom: '8px', color: '#c9d1d9' }}>
            Start the dev server:
          </p>
          <code
            style={{
              display: 'block',
              padding: '8px',
              backgroundColor: '#0d1117',
              borderRadius: '4px',
              color: '#3fb950',
            }}
          >
            cd consumer-app && npm run dev
          </code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Preview header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
        }}
      >
        <span style={{ color: '#c9d1d9', fontWeight: 500 }}>Preview</span>
        <div
          style={{
            flex: 1,
            marginLeft: '8px',
            padding: '4px 8px',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#8b949e',
            fontSize: '11px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {url}
        </div>
        <button
          onClick={handleRefresh}
          style={{
            padding: '4px 8px',
            backgroundColor: '#21262d',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#c9d1d9',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#30363d';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#21262d';
          }}
        >
          <span style={{ transform: isLoading ? 'rotate(360deg)' : 'none' }}>
            ↻
          </span>
          Refresh
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '4px 8px',
            backgroundColor: '#21262d',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#c9d1d9',
            textDecoration: 'none',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#30363d';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#21262d';
          }}
        >
          ↗ Open
        </a>
      </div>

      {/* Preview iframe */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#ffffff' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0d1117',
              zIndex: 10,
            }}
          >
            <div style={{ textAlign: 'center', color: '#8b949e' }}>
              <div
                className="animate-spin"
                style={{ fontSize: '24px', marginBottom: '12px' }}
              >
                ◐
              </div>
              <p>Loading preview...</p>
            </div>
          </div>
        )}
        <iframe
          key={key}
          src={url}
          onLoad={handleLoad}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
