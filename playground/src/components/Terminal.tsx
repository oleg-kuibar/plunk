import { useEffect, useRef, useCallback, useState } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import type { BootStatus } from '../hooks/useWebContainer';

interface TerminalProps {
  status: BootStatus;
  spawnShell: (
    onData: (data: string) => void,
    onExit?: () => void
  ) => Promise<{
    write: (data: string) => void;
    kill: () => void;
  } | null>;
}

export function Terminal({ status, spawnShell }: TerminalProps) {
  const shellRef = useRef<{ write: (data: string) => void; kill: () => void } | null>(
    null
  );
  const [isConnected, setIsConnected] = useState(false);

  // Handle data from user input
  const handleUserInput = useCallback((data: string) => {
    if (shellRef.current) {
      shellRef.current.write(data);
    }
  }, []);

  const { terminalRef, write, fit } = useTerminal({
    onData: handleUserInput,
  });

  // Connect shell when WebContainer is ready
  useEffect(() => {
    if (status !== 'ready') return;

    let mounted = true;

    async function connectShell() {
      write('\r\n\x1b[33mConnecting to shell...\x1b[0m\r\n');

      const shell = await spawnShell(
        (data) => {
          if (mounted) {
            write(data);
          }
        },
        () => {
          if (mounted) {
            write('\r\n\x1b[31mShell disconnected. Refresh to reconnect.\x1b[0m\r\n');
            setIsConnected(false);
          }
        }
      );

      if (shell && mounted) {
        shellRef.current = shell;
        setIsConnected(true);
      }
    }

    connectShell();

    return () => {
      mounted = false;
      if (shellRef.current) {
        shellRef.current.kill();
        shellRef.current = null;
      }
    };
  }, [status, spawnShell, write]);

  // Fit terminal on container resize
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      fit();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [fit, terminalRef]);

  // Show status messages
  useEffect(() => {
    if (status === 'booting') {
      write('\x1b[36mBooting WebContainer...\x1b[0m\r\n');
    } else if (status === 'mounting') {
      write('\x1b[36mMounting file system...\x1b[0m\r\n');
    } else if (status === 'installing') {
      write('\x1b[36mInstalling plunk CLI...\x1b[0m\r\n');
    } else if (status === 'ready' && !isConnected) {
      write('\x1b[32m✓ Environment ready!\x1b[0m\r\n');
    }
  }, [status, isConnected, write]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Terminal header */}
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
        <span style={{ color: '#c9d1d9', fontWeight: 500 }}>Terminal</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status !== 'ready' && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#d29922',
              }}
            >
              <span className="animate-spin" style={{ fontSize: '10px' }}>
                ◐
              </span>
              {status === 'booting' && 'Booting...'}
              {status === 'mounting' && 'Mounting...'}
              {status === 'installing' && 'Installing...'}
            </span>
          )}
          {status === 'ready' && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: isConnected ? '#3fb950' : '#8b949e',
              }}
            >
              <span style={{ fontSize: '8px' }}>●</span>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          backgroundColor: '#0d1117',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
