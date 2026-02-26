import { useState, useCallback, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useWebContainer } from './hooks/useWebContainer';
import { FileTree, Editor, Terminal, Preview, Tutorial } from './components';

function BrowserWarning() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>⚠️</div>
      <h1 style={{ marginBottom: '16px', color: '#f85149' }}>
        Browser Not Supported
      </h1>
      <p style={{ maxWidth: '400px', color: '#8b949e', lineHeight: 1.6 }}>
        The Plunk Playground requires SharedArrayBuffer, which is not available in
        your browser. Please use one of the following browsers:
      </p>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginTop: '24px',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#161b22',
            borderRadius: '8px',
            border: '1px solid #30363d',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌐</div>
          <div style={{ fontWeight: 500 }}>Chrome</div>
        </div>
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#161b22',
            borderRadius: '8px',
            border: '1px solid #30363d',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🦊</div>
          <div style={{ fontWeight: 500 }}>Firefox</div>
        </div>
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#161b22',
            borderRadius: '8px',
            border: '1px solid #30363d',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📘</div>
          <div style={{ fontWeight: 500 }}>Edge</div>
        </div>
      </div>
      <p style={{ marginTop: '24px', fontSize: '12px', color: '#6e7681' }}>
        Safari is not supported due to SharedArrayBuffer restrictions.
      </p>
    </div>
  );
}

function LoadingScreen({ status }: { status: string }) {
  const messages = {
    idle: 'Initializing...',
    booting: 'Booting WebContainer...',
    mounting: 'Mounting file system...',
    installing: 'Installing plunk CLI...',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          marginBottom: '24px',
          borderRadius: '16px',
          backgroundColor: '#161b22',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
        }}
      >
        <span className="animate-pulse">⚡</span>
      </div>
      <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>Plunk Playground</h1>
      <p style={{ color: '#8b949e' }}>
        {messages[status as keyof typeof messages] || status}
      </p>
      <div
        style={{
          marginTop: '24px',
          width: '200px',
          height: '4px',
          backgroundColor: '#30363d',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          className="animate-pulse"
          style={{
            width: '50%',
            height: '100%',
            backgroundColor: '#58a6ff',
            borderRadius: '2px',
          }}
        />
      </div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>❌</div>
      <h1 style={{ marginBottom: '16px', color: '#f85149' }}>
        Failed to Start Playground
      </h1>
      <p
        style={{
          maxWidth: '500px',
          color: '#8b949e',
          lineHeight: 1.6,
          marginBottom: '24px',
        }}
      >
        {error}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 24px',
          backgroundColor: '#238636',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        Try Again
      </button>
    </div>
  );
}

export default function App() {
  const { status, error, previewUrl, spawnShell, readFile, writeFile, readdir } =
    useWebContainer();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [tutorialCollapsed, setTutorialCollapsed] = useState(false);

  // Check for SharedArrayBuffer support
  const isSupported = typeof SharedArrayBuffer !== 'undefined';

  // Load file content when selected
  useEffect(() => {
    if (!selectedFile || status !== 'ready') return;

    async function loadFile() {
      const content = await readFile(selectedFile!);
      if (content !== null) {
        setFileContent(content);
        setIsDirty(false);
      }
    }

    loadFile();
  }, [selectedFile, readFile, status]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  const handleContentChange = useCallback((content: string) => {
    setFileContent(content);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !isDirty) return;

    await writeFile(selectedFile, fileContent);
    setIsDirty(false);
  }, [selectedFile, fileContent, isDirty, writeFile]);

  // Show browser warning for unsupported browsers
  if (!isSupported) {
    return <BrowserWarning />;
  }

  // Show loading screen while booting
  if (status !== 'ready' && status !== 'error') {
    return <LoadingScreen status={status} />;
  }

  // Show error screen if boot failed
  if (status === 'error' && error) {
    return <ErrorScreen error={error} />;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          height: '48px',
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <span style={{ fontWeight: 600, color: '#c9d1d9' }}>
            Plunk Playground
          </span>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {isDirty && (
            <span
              style={{
                padding: '4px 8px',
                backgroundColor: '#d29922',
                color: '#0d1117',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              Unsaved
            </span>
          )}
          <a
            href="https://github.com/olegkuibar/plunk"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#8b949e',
              textDecoration: 'none',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ opacity: 0.8 }}
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@olegkuibar/plunk"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#8b949e',
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            npm
          </a>
        </div>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PanelGroup direction="horizontal">
          {/* Left sidebar - File tree */}
          <Panel defaultSize={15} minSize={10} maxSize={25}>
            <div
              style={{
                height: '100%',
                backgroundColor: '#0d1117',
                borderRight: '1px solid #30363d',
                overflow: 'auto',
              }}
            >
              <div
                style={{
                  padding: '12px',
                  borderBottom: '1px solid #30363d',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#8b949e',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Explorer
              </div>
              <FileTree
                readdir={readdir}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                isReady={status === 'ready'}
              />
            </div>
          </Panel>

          <PanelResizeHandle />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={45} minSize={30}>
            <PanelGroup direction="vertical">
              {/* Editor */}
              <Panel defaultSize={60} minSize={20}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#0d1117',
                  }}
                >
                  <Editor
                    path={selectedFile}
                    content={fileContent}
                    onChange={handleContentChange}
                    onSave={handleSave}
                  />
                </div>
              </Panel>

              <PanelResizeHandle />

              {/* Terminal */}
              <Panel defaultSize={40} minSize={15}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#0d1117',
                    borderTop: '1px solid #30363d',
                  }}
                >
                  <Terminal status={status} spawnShell={spawnShell} />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle />

          {/* Right - Preview */}
          <Panel defaultSize={40} minSize={20}>
            <div
              style={{
                height: '100%',
                backgroundColor: '#0d1117',
                borderLeft: '1px solid #30363d',
              }}
            >
              <Preview url={previewUrl} />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Tutorial overlay */}
      <Tutorial
        isCollapsed={tutorialCollapsed}
        onToggle={() => setTutorialCollapsed(!tutorialCollapsed)}
      />
    </div>
  );
}
