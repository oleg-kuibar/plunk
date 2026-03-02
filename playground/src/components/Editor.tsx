import { useEffect, useRef, useCallback, useState } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { motion } from 'framer-motion';

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

function CommandPill({ name, desc, delay }: { name: string; desc: string; delay: number }) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(`plunk ${name}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [name]);

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      onClick={handleClick}
      className="bg-bg-subtle/50 rounded px-3 py-2 text-[11px] text-left hover:bg-bg-subtle transition-colors group cursor-pointer relative"
      title={`Click to copy "plunk ${name}"`}
    >
      <code className="text-success group-hover:text-accent transition-colors">{name}</code>
      <span className="text-text-subtle ml-1.5">{'\u2192'} {desc}</span>
      {copied && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-success text-white px-2 py-0.5 rounded"
        >
          Copied!
        </motion.span>
      )}
    </motion.button>
  );
}

function FlowVisualization() {
  const nodes = ['Source', 'Store', 'node_modules'];

  return (
    <div className="flex items-center justify-center gap-2 my-3">
      {nodes.map((label, idx) => (
        <div key={label} className="flex items-center gap-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.2, duration: 0.3 }}
            className="px-3 py-1.5 rounded bg-bg-elevated border border-border text-[11px] font-medium text-text"
          >
            {label}
          </motion.div>
          {idx < nodes.length - 1 && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.2 + 0.15, duration: 0.2 }}
              className="text-accent text-xs"
            >
              {'\u2192'}
            </motion.span>
          )}
        </div>
      ))}
    </div>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const segments = path.replace(/^\//, '').split('/');

  return (
    <div className="flex items-center gap-0.5 text-[11px] overflow-hidden">
      {segments.map((segment, idx) => (
        <span key={idx} className="flex items-center gap-0.5 shrink-0">
          {idx > 0 && <span className="text-text-subtle mx-0.5">{'\u203A'}</span>}
          <span
            className={`${idx === segments.length - 1 ? 'text-text font-medium' : 'text-text-muted hover:text-text cursor-default'} truncate`}
            title={segment}
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

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

          {/* Flow visualization */}
          <div className="text-center">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">How plunk works</p>
            <FlowVisualization />
          </div>

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

          {/* Commands Grid - clickable */}
          <div className="grid grid-cols-2 gap-2">
            <CommandPill name="publish" desc="store" delay={0} />
            <CommandPill name="add" desc="link pkg" delay={0.05} />
            <CommandPill name="push" desc="inject" delay={0.1} />
            <CommandPill name="list" desc="show all" delay={0.15} />
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
      {/* File path header with breadcrumb */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-border text-xs">
        <Breadcrumb path={path} />
        <div className="flex-1" />
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
