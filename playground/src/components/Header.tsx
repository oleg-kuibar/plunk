import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BootStatus } from '../hooks/useWebContainer';

interface HeaderProps {
  saveStatus: 'idle' | 'saving' | 'saved';
  hasAnyDirty: boolean;
  status: BootStatus;
  onToggleSidebar?: () => void;
  onTogglePreview?: () => void;
  isSidebarCollapsed?: boolean;
  isPreviewCollapsed?: boolean;
}

function ConnectionDot({ status }: { status: BootStatus }) {
  const color = status === 'ready'
    ? 'bg-success'
    : status === 'error'
      ? 'bg-danger'
      : 'bg-accent';
  const label = status === 'ready'
    ? 'Connected'
    : status === 'error'
      ? 'Disconnected'
      : 'Connecting...';

  return (
    <span className="relative flex items-center" title={label}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {status !== 'ready' && status !== 'error' && (
        <motion.span
          className={`absolute inset-0 w-2 h-2 rounded-full ${color}`}
          animate={{ scale: [1, 1.8, 1], opacity: [1, 0, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}

function AboutPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-ghost p-1.5"
        aria-label="About plunk"
        aria-expanded={isOpen}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7v4" />
          <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 bg-bg-elevated border border-border rounded-lg shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <img src="/plunk_logo.png" alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className="font-semibold text-text text-sm">plunk</span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Local npm package development without symlinks. Copies built files into consumer <code className="text-accent">node_modules/</code> with incremental sync and watch mode.
              </p>
            </div>

            <div className="p-4 space-y-2">
              <p className="text-[10px] text-text-subtle uppercase tracking-wider font-semibold mb-2">Key concepts</p>
              {[
                { name: 'Store', desc: 'Mutable package cache at ~/.plunk/store/' },
                { name: 'Publish', desc: 'Copy built files to the store' },
                { name: 'Inject', desc: 'Copy from store to node_modules/' },
                { name: 'Push', desc: 'Publish + inject to all consumers' },
              ].map((item) => (
                <div key={item.name} className="flex gap-2 text-xs">
                  <code className="text-accent font-medium shrink-0">{item.name}</code>
                  <span className="text-text-muted">{item.desc}</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-border flex gap-3">
              <a
                href="https://github.com/oleg-kuibar/plunk#readme"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-secondary hover:underline"
              >
                Docs
              </a>
              <a
                href="https://github.com/oleg-kuibar/plunk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-secondary hover:underline"
              >
                GitHub
              </a>
              <a
                href="https://www.npmjs.com/package/@olegkuibar/plunk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-secondary hover:underline"
              >
                npm
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header({
  saveStatus,
  hasAnyDirty,
  status,
  onToggleSidebar,
  onTogglePreview,
  isSidebarCollapsed = false,
  isPreviewCollapsed = false,
}: HeaderProps) {
  return (
    <header className="h-12 bg-bg-elevated border-b border-border flex items-center px-4 gap-3 shrink-0">
      {/* Panel toggle - sidebar */}
      <button
        onClick={onToggleSidebar}
        className="btn btn-ghost p-1.5"
        aria-label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="1" y="2" width="14" height="12" rx="1.5" />
          <line x1="5.5" y1="2" x2="5.5" y2="14" />
        </svg>
      </button>

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

      {/* Connection dot */}
      <ConnectionDot status={status} />

      <div className="ml-auto flex items-center gap-3">
        {/* Save status badges with AnimatePresence */}
        <AnimatePresence mode="wait">
          {saveStatus === 'saving' && (
            <motion.span
              key="saving"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="badge badge-muted"
            >
              Saving...
            </motion.span>
          )}
          {saveStatus === 'saved' && (
            <motion.span
              key="saved"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="badge badge-success"
            >
              Saved
            </motion.span>
          )}
          {hasAnyDirty && saveStatus === 'idle' && (
            <motion.span
              key="unsaved"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="badge badge-warning"
            >
              Unsaved
            </motion.span>
          )}
        </AnimatePresence>

        <AboutPopover />

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

        {/* Panel toggle - preview */}
        <button
          onClick={onTogglePreview}
          className="btn btn-ghost p-1.5"
          aria-label={isPreviewCollapsed ? 'Show preview' : 'Hide preview'}
          title={isPreviewCollapsed ? 'Show preview' : 'Hide preview'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="2" width="14" height="12" rx="1.5" />
            <line x1="10.5" y1="2" x2="10.5" y2="14" />
          </svg>
        </button>
      </div>
    </header>
  );
}
