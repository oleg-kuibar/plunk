import { useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface EditorProps {
  path: string | null;
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  isDirty?: boolean;
}

function getLanguage(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

// GitHub-inspired Monaco theme with amber accents
const plunkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'number', foreground: 'f59e0b' },
    { token: 'type', foreground: 'ffa657' },
    { token: 'function', foreground: 'd2a8ff' },
    { token: 'variable', foreground: 'e6edf3' },
    { token: 'constant', foreground: '79c0ff' },
  ],
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#e6edf3',
    'editorCursor.foreground': '#f59e0b',
    'editor.lineHighlightBackground': '#161b22',
    'editorLineNumber.foreground': '#6e7681',
    'editorLineNumber.activeForeground': '#e6edf3',
    'editor.selectionBackground': '#58a6ff40',
    'editor.inactiveSelectionBackground': '#58a6ff20',
    'editorIndentGuide.background': '#21262d',
    'editorIndentGuide.activeBackground': '#30363d',
    'editorBracketMatch.background': '#58a6ff30',
    'editorBracketMatch.border': '#58a6ff',
    'scrollbarSlider.background': '#30363d80',
    'scrollbarSlider.hoverBackground': '#484f58',
    'scrollbarSlider.activeBackground': '#6e7681',
  },
};

export function Editor({
  path,
  content,
  onChange,
  onSave,
  readOnly = false,
  isDirty = false,
}: EditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isMountedRef = useRef(false);
  const onSaveRef = useRef(onSave);

  // Keep onSave ref up to date
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      isMountedRef.current = true;

      monaco.editor.defineTheme('plunk', plunkTheme);
      monaco.editor.setTheme('plunk');

      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          onSaveRef.current?.();
        },
      });

      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        jsx: monaco.languages.typescript.JsxEmit.React,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      });
    },
    []
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value);
      }
    },
    [onChange]
  );

  // Focus editor when path changes (only after mount)
  useEffect(() => {
    if (isMountedRef.current && editorRef.current && path) {
      // Small delay to ensure editor is ready
      const timer = setTimeout(() => {
        editorRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [path]);

  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted p-8 overflow-auto">
        <div className="max-w-sm w-full space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-bg-elevated border border-border mb-4">
              <span className="text-2xl opacity-60">{'\uD83D\uDCC4'}</span>
            </div>
            <h2 className="text-text font-medium text-base mb-1">No file selected</h2>
            <p className="text-xs text-text-subtle">
              Select a file from the explorer
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Hero Command */}
          <div className="text-center">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">Dev Mode</p>
            <div className="bg-bg-elevated border border-border rounded-lg px-4 py-3">
              <code className="text-accent font-mono text-sm">plunk push --watch</code>
            </div>
            <p className="text-[11px] text-text-subtle mt-2">
              Auto-rebuild & hot-inject on save
            </p>
          </div>

          {/* Commands Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-bg-subtle/50 rounded px-3 py-2">
              <code className="text-success">publish</code>
              <span className="text-text-subtle ml-1.5">{'\u2192'} store</span>
            </div>
            <div className="bg-bg-subtle/50 rounded px-3 py-2">
              <code className="text-success">add</code>
              <span className="text-text-subtle ml-1.5">{'\u2192'} link pkg</span>
            </div>
            <div className="bg-bg-subtle/50 rounded px-3 py-2">
              <code className="text-success">push</code>
              <span className="text-text-subtle ml-1.5">{'\u2192'} inject</span>
            </div>
            <div className="bg-bg-subtle/50 rounded px-3 py-2">
              <code className="text-success">list</code>
              <span className="text-text-subtle ml-1.5">{'\u2192'} show all</span>
            </div>
          </div>

          {/* Footer hint */}
          <p className="text-[10px] text-text-subtle text-center">
            Run via <code className="text-secondary">npx @olegkuibar/plunk</code>
          </p>
        </div>
      </div>
    );
  }

  const fileName = path.split('/').pop() || path;

  return (
    <div className="h-full flex flex-col">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-border text-xs">
        <span className="text-text font-medium">{fileName}</span>
        <span className="text-text-muted truncate flex-1" title={path}>{path}</span>
        {isDirty && !readOnly && (
          <button
            onClick={() => onSaveRef.current?.()}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-text-muted hover:text-text hover:bg-bg-subtle transition-colors"
            title="Save (Ctrl+S)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>Save</span>
          </button>
        )}
        {readOnly && (
          <span className="badge badge-muted">Read Only</span>
        )}
      </div>

      {/* Monaco editor */}
      <div className="flex-1" role="application" aria-label={`Code editor for ${fileName}`}>
        <MonacoEditor
          height="100%"
          language={getLanguage(path)}
          value={content}
          onChange={handleChange}
          onMount={handleMount}
          theme="plunk"
          options={{
            readOnly,
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            accessibilitySupport: 'on',
          }}
        />
      </div>
    </div>
  );
}
