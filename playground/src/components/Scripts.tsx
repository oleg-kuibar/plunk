import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTerminalContext } from '../contexts/TerminalContext';

interface ScriptsProps {
  readFile: (path: string) => Promise<string | null>;
  readdir: (path: string) => Promise<string[]>;
  isReady: boolean;
}

interface ScriptItem {
  id: string;
  name: string;
  command: string;
  source: string;
  category: 'plunk' | 'npm';
}

export function Scripts({ readFile, readdir, isReady }: ScriptsProps) {
  const [plunkScripts, setPlunkScripts] = useState<ScriptItem[]>([]);
  const [npmScripts, setNpmScripts] = useState<ScriptItem[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const { executeCommand, isShellConnected } = useTerminalContext();

  // Scan for packages and generate scripts
  useEffect(() => {
    if (!isReady) return;

    async function scanScripts() {
      const plunk: ScriptItem[] = [];
      const npm: ScriptItem[] = [];

      // Global plunk commands
      plunk.push({
        id: 'plunk-list',
        name: 'list',
        command: 'npx -y @olegkuibar/plunk list',
        source: 'global',
        category: 'plunk',
      });

      // Check packages directory for plunk-able packages
      try {
        const packagesDir = await readdir('/packages');
        for (const entry of packagesDir) {
          if (entry.endsWith('/')) {
            const pkgName = entry.slice(0, -1);
            const pkgJson = await readFile(`/packages/${pkgName}/package.json`);
            if (pkgJson) {
              try {
                const pkg = JSON.parse(pkgJson);
                // Only add plunk commands for packages with version field
                if (pkg.version) {
                  plunk.push({
                    id: `plunk-publish-${pkgName}`,
                    name: `publish ${pkgName}`,
                    command: `cd && cdpackages/${pkgName} && npx -y @olegkuibar/plunk publish`,
                    source: pkgName,
                    category: 'plunk',
                  });
                  plunk.push({
                    id: `plunk-push-${pkgName}`,
                    name: `push ${pkgName}`,
                    command: `cd && cdpackages/${pkgName} && npx -y @olegkuibar/plunk push`,
                    source: pkgName,
                    category: 'plunk',
                  });
                }

                // Add npm scripts
                if (pkg.scripts) {
                  Object.keys(pkg.scripts).forEach((scriptName) => {
                    npm.push({
                      id: `npm-${pkgName}-${scriptName}`,
                      name: scriptName,
                      command: `cd && cdpackages/${pkgName} && npm run ${scriptName}`,
                      source: pkgName,
                      category: 'npm',
                    });
                  });
                }
              } catch {}
            }
          }
        }
      } catch {}

      // Add plunk add command for consumer-app
      plunk.push({
        id: 'plunk-add-consumer',
        name: 'add to consumer',
        command: 'cd && cdconsumer-app && npx -y @olegkuibar/plunk add @example/api-client && npx -y @olegkuibar/plunk add @example/ui-kit',
        source: 'consumer-app',
        category: 'plunk',
      });

      // Check consumer-app for npm scripts
      const consumerPkg = await readFile('/consumer-app/package.json');
      if (consumerPkg) {
        try {
          const pkg = JSON.parse(consumerPkg);
          if (pkg.scripts) {
            Object.keys(pkg.scripts).forEach((scriptName) => {
              npm.push({
                id: `npm-consumer-${scriptName}`,
                name: scriptName,
                command: `cd && cdconsumer-app && npm run ${scriptName}`,
                source: 'consumer',
                category: 'npm',
              });
            });
          }
        } catch {}
      }

      // Check root for npm scripts
      const rootPkg = await readFile('/package.json');
      if (rootPkg) {
        try {
          const pkg = JSON.parse(rootPkg);
          if (pkg.scripts) {
            Object.keys(pkg.scripts).forEach((scriptName) => {
              npm.push({
                id: `npm-root-${scriptName}`,
                name: scriptName,
                command: `cd && npm run ${scriptName}`,
                source: 'root',
                category: 'npm',
              });
            });
          }
        } catch {}
      }

      setPlunkScripts(plunk);
      setNpmScripts(npm);
    }

    scanScripts();
  }, [isReady, readFile, readdir]);

  const handleRunScript = useCallback((script: ScriptItem) => {
    if (!isShellConnected) return;

    setRunningScript(script.id);
    executeCommand(script.command);

    setTimeout(() => setRunningScript(null), 1500);
  }, [executeCommand, isShellConnected]);

  const totalCount = plunkScripts.length + npmScripts.length;

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider hover:bg-bg-subtle transition-colors w-full text-left"
      >
        <span
          className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          {'\u25B6'}
        </span>
        Scripts
        <span className="ml-auto text-text-subtle font-normal normal-case">
          {totalCount}
        </span>
      </button>

      {/* Scripts list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 overflow-auto"
          >
            {/* Plunk commands */}
            {plunkScripts.length > 0 && (
              <div className="px-2 py-1.5">
                <div className="text-[9px] text-text-subtle uppercase tracking-wider px-1 mb-1">
                  Plunk
                </div>
                {plunkScripts.map((script) => (
                  <ScriptButton
                    key={script.id}
                    script={script}
                    isRunning={runningScript === script.id}
                    isConnected={isShellConnected}
                    onRun={handleRunScript}
                  />
                ))}
              </div>
            )}

            {/* NPM Scripts */}
            {npmScripts.length > 0 && (
              <div className="px-2 py-1.5 border-t border-border">
                <div className="text-[9px] text-text-subtle uppercase tracking-wider px-1 mb-1">
                  npm scripts
                </div>
                {npmScripts.map((script) => (
                  <ScriptButton
                    key={script.id}
                    script={script}
                    isRunning={runningScript === script.id}
                    isConnected={isShellConnected}
                    onRun={handleRunScript}
                  />
                ))}
              </div>
            )}

            {!isShellConnected && (
              <div className="px-3 py-2 text-[10px] text-text-subtle italic">
                Connect to shell to run scripts
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ScriptButtonProps {
  script: ScriptItem;
  isRunning: boolean;
  isConnected: boolean;
  onRun: (script: ScriptItem) => void;
}

function ScriptButton({ script, isRunning, isConnected, onRun }: ScriptButtonProps) {
  const isPlunk = script.category === 'plunk';

  return (
    <button
      onClick={() => onRun(script)}
      disabled={!isConnected}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs
        transition-colors group
        ${isConnected ? 'hover:bg-bg-subtle' : 'opacity-50 cursor-not-allowed'}
        ${isRunning ? 'bg-success/10' : ''}
      `}
      title={script.command}
    >
      <span className={`shrink-0 ${isPlunk ? 'text-accent' : 'text-success'}`}>
        {isRunning ? '\u2713' : '\u25B6'}
      </span>
      <span className="truncate text-text-muted group-hover:text-text">
        {script.name}
      </span>
      {script.source !== 'global' && script.source !== 'root' && (
        <span className="ml-auto text-[9px] text-text-subtle shrink-0">
          {script.source}
        </span>
      )}
    </button>
  );
}
