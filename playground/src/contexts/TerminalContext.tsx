import { createContext, useContext, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface TerminalContextValue {
  /** Write a command to the terminal (types it for the user, doesn't execute) */
  typeCommand: (command: string) => void;
  /** Execute a command (types + sends Enter) */
  executeCommand: (command: string) => void;
  /** Register the shell write function */
  registerShell: (write: (data: string) => void) => void;
  /** Whether the shell is connected */
  isShellConnected: boolean;
  /** Set shell connection status */
  setShellConnected: (connected: boolean) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const shellWriteRef = useRef<((data: string) => void) | null>(null);
  const [isShellConnected, setIsShellConnected] = useState(false);

  const registerShell = useCallback((write: (data: string) => void) => {
    shellWriteRef.current = write;
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

  const setShellConnected = useCallback((connected: boolean) => {
    setIsShellConnected(connected);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        typeCommand,
        executeCommand,
        registerShell,
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
