import { useEffect, useRef, useState, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import type { FileSystemTree, WebContainerProcess } from '@webcontainer/api';
import { basicTemplate } from '../templates/basic/files';

export type BootStatus =
  | 'idle'
  | 'booting'
  | 'mounting'
  | 'installing'
  | 'ready'
  | 'error';

export interface UseWebContainerResult {
  status: BootStatus;
  error: string | null;
  webcontainer: WebContainer | null;
  previewUrl: string | null;
  spawnShell: (
    onData: (data: string) => void,
    onExit?: () => void
  ) => Promise<{
    write: (data: string) => void;
    kill: () => void;
  } | null>;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, contents: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
}

// Singleton WebContainer instance - only one per browser tab
let bootPromise: Promise<WebContainer> | null = null;

export function useWebContainer(): UseWebContainerResult {
  const [status, setStatus] = useState<BootStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const containerRef = useRef<WebContainer | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Check browser support
      if (typeof SharedArrayBuffer === 'undefined') {
        setError(
          'Your browser does not support SharedArrayBuffer. Please use Chrome, Edge, or Firefox.'
        );
        setStatus('error');
        return;
      }

      try {
        setStatus('booting');

        // Use singleton pattern for WebContainer
        if (!bootPromise) {
          bootPromise = WebContainer.boot();
        }

        const container = await bootPromise;

        if (cancelled) return;

        containerRef.current = container;
        setStatus('mounting');

        // Mount the template files
        await container.mount(basicTemplate as FileSystemTree);

        if (cancelled) return;

        // Listen for server-ready event
        container.on('server-ready', (_port, url) => {
          setPreviewUrl(url);
        });

        setStatus('installing');

        // Install plunk globally from npm
        const installProcess = await container.spawn('npm', [
          'install',
          '-g',
          '@olegkuibar/plunk@latest',
        ]);

        // Wait for install to complete
        const installExitCode = await installProcess.exit;

        if (cancelled) return;

        if (installExitCode !== 0) {
          console.warn('Plunk install returned non-zero exit code:', installExitCode);
        }

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('WebContainer boot error:', err);
        setError(message);
        setStatus('error');
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const spawnShell = useCallback(
    async (
      onData: (data: string) => void,
      onExit?: () => void
    ): Promise<{
      write: (data: string) => void;
      kill: () => void;
    } | null> => {
      const container = containerRef.current;
      if (!container) return null;

      try {
        const shellProcess: WebContainerProcess = await container.spawn('jsh', {
          terminal: {
            cols: 80,
            rows: 24,
          },
        });

        // Pipe output to callback
        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              onData(data);
            },
          })
        );

        // Handle process exit
        shellProcess.exit.then(() => {
          onExit?.();
        });

        // Get writable input stream
        const input = shellProcess.input.getWriter();

        return {
          write: (data: string) => {
            input.write(data);
          },
          kill: () => {
            shellProcess.kill();
          },
        };
      } catch (err) {
        console.error('Failed to spawn shell:', err);
        return null;
      }
    },
    []
  );

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    const container = containerRef.current;
    if (!container) return null;

    try {
      const contents = await container.fs.readFile(path, 'utf-8');
      return contents;
    } catch {
      return null;
    }
  }, []);

  const writeFile = useCallback(
    async (path: string, contents: string): Promise<void> => {
      const container = containerRef.current;
      if (!container) return;

      await container.fs.writeFile(path, contents);
    },
    []
  );

  const readdir = useCallback(async (path: string): Promise<string[]> => {
    const container = containerRef.current;
    if (!container) return [];

    try {
      const entries = await container.fs.readdir(path, { withFileTypes: true });
      return entries.map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      );
    } catch {
      return [];
    }
  }, []);

  return {
    status,
    error,
    webcontainer: containerRef.current,
    previewUrl,
    spawnShell,
    readFile,
    writeFile,
    readdir,
  };
}
