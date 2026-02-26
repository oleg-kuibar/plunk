import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface UseTerminalOptions {
  onData?: (data: string) => void;
}

export interface UseTerminalResult {
  terminalRef: React.RefObject<HTMLDivElement>;
  terminal: Terminal | null;
  write: (data: string) => void;
  clear: () => void;
  fit: () => void;
}

export function useTerminal(options: UseTerminalOptions = {}): UseTerminalResult {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    // Create and attach fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Store refs
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    if (options.onData) {
      terminal.onData(options.onData);
    }

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    // Initial welcome message
    terminal.writeln('\x1b[38;5;75m╭─────────────────────────────────────╮\x1b[0m');
    terminal.writeln('\x1b[38;5;75m│\x1b[0m  \x1b[1;32m✨ Plunk Playground\x1b[0m               \x1b[38;5;75m│\x1b[0m');
    terminal.writeln('\x1b[38;5;75m╰─────────────────────────────────────╯\x1b[0m');
    terminal.writeln('');

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
      terminalInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, [options.onData]);

  const write = useCallback((data: string) => {
    terminalInstanceRef.current?.write(data);
  }, []);

  const clear = useCallback(() => {
    terminalInstanceRef.current?.clear();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return {
    terminalRef,
    terminal: terminalInstanceRef.current,
    write,
    clear,
    fit,
  };
}
