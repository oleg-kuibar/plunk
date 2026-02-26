import { useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface EditorProps {
  path: string | null;
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
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

export function Editor({
  path,
  content,
  onChange,
  onSave,
  readOnly = false,
}: EditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Add Ctrl+S / Cmd+S save handler
      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          onSave?.();
        },
      });

      // Configure TypeScript/JavaScript defaults
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        jsx: monaco.languages.typescript.JsxEmit.React,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      });
    },
    [onSave]
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value);
      }
    },
    [onChange]
  );

  // Focus editor when path changes
  useEffect(() => {
    if (editorRef.current && path) {
      editorRef.current.focus();
    }
  }, [path]);

  if (!path) {
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
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
          📝
        </div>
        <p style={{ marginBottom: '8px' }}>Select a file to edit</p>
        <p style={{ fontSize: '12px', color: '#6e7681' }}>
          Click on any file in the file tree
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* File path header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
          fontSize: '12px',
          color: '#8b949e',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ color: '#c9d1d9', fontWeight: 500 }}>
          {path.split('/').pop()}
        </span>
        <span style={{ color: '#6e7681' }}>{path}</span>
        {readOnly && (
          <span
            style={{
              marginLeft: 'auto',
              padding: '2px 6px',
              backgroundColor: '#21262d',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            Read Only
          </span>
        )}
      </div>

      {/* Monaco editor */}
      <div style={{ flex: 1 }}>
        <MonacoEditor
          height="100%"
          language={getLanguage(path)}
          value={content}
          onChange={handleChange}
          onMount={handleMount}
          theme="vs-dark"
          options={{
            readOnly,
            fontSize: 13,
            fontFamily:
              '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Menlo, monospace',
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
          }}
        />
      </div>
    </div>
  );
}
