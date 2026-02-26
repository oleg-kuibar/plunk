import { useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion } from 'framer-motion';
import { useWebContainer } from './hooks/useWebContainer';
import { FileTree, Editor, Terminal, Preview, Tutorial, Loader, Scripts } from './components';

const BROWSER_OPTIONS = [
  { icon: '\uD83C\uDF10', name: 'Chrome' },
  { icon: '\uD83E\uDD8A', name: 'Firefox' },
  { icon: '\uD83D\uDCD8', name: 'Edge' },
] as const;

function BrowserWarning() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-text p-6 text-center">
      <motion.img
        src="/plunk_logo.png"
        alt="Plunk mascot"
        className="w-24 h-24 rounded-full mb-6 object-cover"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      />
      <h1 className="text-xl font-semibold mb-4 text-danger">
        Browser Not Supported
      </h1>
      <p className="max-w-md text-text-muted leading-relaxed mb-6">
        The Plunk Playground requires SharedArrayBuffer, which is not available in
        your browser. Please use one of the following browsers:
      </p>
      <div className="flex gap-4">
        {BROWSER_OPTIONS.map((browser) => (
          <div
            key={browser.name}
            className="p-6 bg-bg-elevated border border-border rounded-lg"
          >
            <div className="text-3xl mb-2" role="img" aria-label={browser.name}>
              {browser.icon}
            </div>
            <div className="font-medium">{browser.name}</div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-text-subtle">
        Safari is not supported due to SharedArrayBuffer restrictions.
      </p>
    </div>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  idle: 'Initializing...',
  booting: 'Booting WebContainer...',
  mounting: 'Mounting file system...',
  installing: 'Installing plunk CLI...',
};

function LoadingScreen({ status }: { status: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-text">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-elevated border border-border rounded-xl p-12 text-center"
      >
        {/* Loader with integrated logo */}
        <Loader size="lg" />

        <h1 className="text-xl font-semibold mt-6 mb-2">Plunk Playground</h1>
        <p className="text-text-muted">{STATUS_MESSAGES[status] || status}</p>
      </motion.div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-text p-6">
      <div className="bg-bg-elevated border border-danger/30 rounded-xl p-10 max-w-md text-center">
        <motion.img
          src="/plunk_logo.png"
          alt="Plunk"
          className="w-20 h-20 rounded-full mx-auto mb-4 grayscale opacity-60 object-cover"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
        />
        <h1 className="text-xl font-semibold text-danger mb-4">
          Failed to Start Playground
        </h1>
        <p className="text-text-muted leading-relaxed mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

interface OpenFile {
  path: string;
  content: string;
  isDirty: boolean;
}

export default function App() {
  const { status, error, previewUrl, spawnShell, readFile, writeFile, readdir } =
    useWebContainer();

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [tutorialCollapsed, setTutorialCollapsed] = useState(() => {
    return localStorage.getItem('plunk-tutorial-collapsed') === 'true';
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const isSupported = typeof SharedArrayBuffer !== 'undefined';

  const currentFile = openFiles.find(f => f.path === activeFile);
  const hasAnyDirty = openFiles.some(f => f.isDirty);

  const handleFileSelect = useCallback(async (path: string) => {
    // Check if file is already open
    const existing = openFiles.find(f => f.path === path);
    if (existing) {
      setActiveFile(path);
      return;
    }

    // Load file content
    const content = await readFile(path);
    if (content !== null) {
      setOpenFiles(prev => [...prev, { path, content, isDirty: false }]);
      setActiveFile(path);
    }
  }, [openFiles, readFile]);

  const handleTabSelect = useCallback((path: string) => {
    setActiveFile(path);
  }, []);

  const handleTabClose = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const file = openFiles.find(f => f.path === path);
    if (file?.isDirty) {
      if (!window.confirm(`"${path.split('/').pop()}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    setOpenFiles(prev => prev.filter(f => f.path !== path));

    // If closing active file, switch to another tab
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f.path !== path);
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  }, [openFiles, activeFile]);

  const handleContentChange = useCallback((content: string) => {
    if (!activeFile) return;

    setOpenFiles(prev => prev.map(f =>
      f.path === activeFile ? { ...f, content, isDirty: true } : f
    ));
    setSaveStatus('idle');
  }, [activeFile]);

  const handleSave = useCallback(async () => {
    if (!activeFile || !currentFile?.isDirty) return;

    setSaveStatus('saving');
    try {
      await writeFile(activeFile, currentFile.content);
      setOpenFiles(prev => prev.map(f =>
        f.path === activeFile ? { ...f, isDirty: false } : f
      ));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save file:', err);
      setSaveStatus('idle');
    }
  }, [activeFile, currentFile, writeFile]);

  const handleTutorialToggle = useCallback(() => {
    setTutorialCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('plunk-tutorial-collapsed', String(next));
      return next;
    });
  }, []);

  if (!isSupported) {
    return <BrowserWarning />;
  }

  if (status !== 'ready' && status !== 'error') {
    return <LoadingScreen status={status} />;
  }

  if (status === 'error' && error) {
    return <ErrorScreen error={error} />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="h-12 bg-bg-elevated border-b border-border flex items-center px-4 gap-3 shrink-0">
        <a
          href="https://github.com/oleg-kuibar/plunk"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          aria-label="Plunk - View on GitHub"
        >
          <motion.img
            src="/plunk_logo.png"
            alt=""
            className="w-7 h-7 rounded-full object-cover"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
          />
          <span className="font-semibold text-text">Plunk Playground</span>
        </a>

        <div className="ml-auto flex items-center gap-3">
          {saveStatus === 'saving' && (
            <span className="badge badge-muted">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="badge badge-success">Saved</span>
          )}
          {hasAnyDirty && saveStatus === 'idle' && (
            <span className="badge badge-warning">Unsaved</span>
          )}
          <a
            href="https://github.com/oleg-kuibar/plunk"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost text-xs"
            aria-label="View on GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@olegkuibar/plunk"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost text-xs"
            aria-label="View on npm"
          >
            npm
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left sidebar - File tree & Scripts */}
          <Panel defaultSize={15} minSize={10} maxSize={25}>
            <div className="h-full bg-bg border-r border-border flex flex-col">
              <PanelGroup direction="vertical">
                {/* File Explorer */}
                <Panel defaultSize={65} minSize={30}>
                  <div className="h-full overflow-auto">
                    <div className="px-3 py-2.5 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                      Explorer
                    </div>
                    <FileTree
                      readdir={readdir}
                      onFileSelect={handleFileSelect}
                      selectedFile={activeFile}
                      isReady={status === 'ready'}
                    />
                  </div>
                </Panel>

                <PanelResizeHandle className="h-1 bg-border hover:bg-accent/50 transition-colors" />

                {/* Scripts */}
                <Panel defaultSize={35} minSize={20}>
                  <Scripts
                    readFile={readFile}
                    readdir={readdir}
                    isReady={status === 'ready'}
                  />
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          <PanelResizeHandle />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={45} minSize={30}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={60} minSize={20}>
                <div className="h-full bg-bg flex flex-col">
                  {/* File tabs */}
                  {openFiles.length > 0 && (
                    <div className="flex items-center bg-bg-elevated border-b border-border overflow-x-auto shrink-0">
                      {openFiles.map((file) => {
                        const fileName = file.path.split('/').pop() || file.path;
                        const isActive = file.path === activeFile;
                        return (
                          <button
                            key={file.path}
                            onClick={() => handleTabSelect(file.path)}
                            className={`
                              group flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border
                              transition-colors shrink-0
                              ${isActive
                                ? 'bg-bg text-text border-b-2 border-b-accent -mb-px'
                                : 'text-text-muted hover:text-text hover:bg-bg-subtle'
                              }
                            `}
                            title={file.path}
                          >
                            <span className="max-w-[120px] truncate">{fileName}</span>
                            {file.isDirty && (
                              <span className="w-2 h-2 rounded-full bg-warning shrink-0" title="Unsaved changes" />
                            )}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => handleTabClose(file.path, e)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleTabClose(file.path);
                                }
                              }}
                              className={`
                                ml-1 w-4 h-4 flex items-center justify-center rounded
                                hover:bg-danger/20 hover:text-danger
                                ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                                transition-opacity
                              `}
                              aria-label={`Close ${fileName}`}
                            >
                              {'\u00D7'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Editor */}
                  <div className="flex-1 min-h-0">
                    <Editor
                      path={activeFile}
                      content={currentFile?.content ?? ''}
                      onChange={handleContentChange}
                      onSave={handleSave}
                      isDirty={currentFile?.isDirty ?? false}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle />

              <Panel defaultSize={40} minSize={15}>
                <div className="h-full bg-bg border-t border-border">
                  <Terminal status={status} spawnShell={spawnShell} />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle />

          {/* Right - Preview */}
          <Panel defaultSize={40} minSize={20}>
            <div className="h-full bg-bg border-l border-border">
              <Preview url={previewUrl} />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Tutorial overlay */}
      <Tutorial
        isCollapsed={tutorialCollapsed}
        onToggle={handleTutorialToggle}
      />
    </div>
  );
}
