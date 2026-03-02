import { createContext, useContext, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface TerminalContextValue {
  /** Write a command to the terminal (types it for the user, doesn't execute) */
  typeCommand: (command: string) => void;
  /** Execute a command (types + sends Enter) */
  executeCommand: (command: string) => void;
  /** Open a new terminal tab and execute a command once the shell is ready */
  executeInNewTerminal: (command: string) => void;
  /** Register the shell write function */
  registerShell: (write: (data: string) => void) => void;
  /** Register the handler that creates a new terminal tab */
  registerNewTabHandler: (handler: () => void) => void;
  /** Whether the shell is connected */
  isShellConnected: boolean;
  /** Set shell connection status */
  setShellConnected: (connected: boolean) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const shellWriteRef = useRef<((data: string) => void) | null>(null);
  const [isShellConnected, setIsShellConnected] = useState(false);
  const newTabHandlerRef = useRef<(() => void) | null>(null);
  const shellReadyResolveRef = useRef<(() => void) | null>(null);

  const registerShell = useCallback((write: (data: string) => void) => {
    shellWriteRef.current = write;
    // Notify anyone waiting for a new shell to be ready
    if (shellReadyResolveRef.current) {
      shellReadyResolveRef.current();
      shellReadyResolveRef.current = null;
    }
  }, []);

  const typeCommand = useCallback((command: string) => {
    if (shellWriteRef.current) {
      // Type the command character by character for visual effect
      shellWriteRef.current(command);
    }
  }, []);

  const executeCommand = useCallback((command: string) => {
    if (shellWriteRef.current) {
      // Type command and press Enter
      shellWriteRef.current(command + '\r');
    }
  }, []);

  const registerNewTabHandler = useCallback((handler: () => void) => {
    newTabHandlerRef.current = handler;
  }, []);

  const executeInNewTerminal = useCallback((command: string) => {
    if (!newTabHandlerRef.current) return;

    // Set up a promise that resolves when the new shell registers
    const waitForShell = new Promise<void>((resolve) => {
      shellReadyResolveRef.current = resolve;
    });

    // Create the new tab (triggers shell spawn)
    newTabHandlerRef.current();

    // When the shell is ready, give it a moment to initialize, then execute
    waitForShell.then(() => {
      setTimeout(() => {
        if (shellWriteRef.current) {
          shellWriteRef.current(command + '\r');
        }
      }, 500);
    });
  }, []);

  const setShellConnected = useCallback((connected: boolean) => {
    setIsShellConnected(connected);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        typeCommand,
        executeCommand,
        executeInNewTerminal,
        registerShell,
        registerNewTabHandler,
        isShellConnected,
        setShellConnected,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminalContext must be used within TerminalProvider');
  }
  return context;
}
