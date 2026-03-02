import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTerminalContext } from '../contexts/TerminalContext';

// --- Types ---

interface FileEdit {
  path: string;
  replacements: Array<{ find: string; replace: string }>;
}

type StepAction =
  | { type: 'command'; command: string; label: string }
  | { type: 'command-new-terminal'; command: string; label: string }
  | { type: 'fileEdit'; edits: FileEdit[]; label: string }
  | { type: 'passive'; label: string };

interface Step {
  id: string;
  title: string;
  description: string;
  detail: string;
  feedbackMessage: string;
  action: StepAction;
}

// --- Steps ---

const STEPS: Step[] = [
  {
    id: 'setup-and-start',
    title: 'Set up & start',
    description: 'Publish packages, link to consumer, and start the dev server.',
    detail: 'Publishes both packages to the plunk store, links them into consumer-app, then starts the Vite dev server. This takes a moment.',
    feedbackMessage: 'Setting up workspace and starting dev server...',
    action: {
      type: 'command',
      command: 'npm run publish:all && npm run link:all && npm run start',
      label: 'Set up & start',
    },
  },
  {
    id: 'see-running',
    title: 'See it running',
    description: 'Check the preview panel on the right.',
    detail: 'Wait for the dev server to start. The consumer app will appear in the preview with user cards and a greeting.',
    feedbackMessage: 'App is running!',
    action: { type: 'passive', label: 'I see it!' },
  },
  {
    id: 'apply-changes',
    title: 'Apply changes',
    description: 'Edit package source files.',
    detail: 'Opens api-client and ui-kit source files, changes user names, greeting text, and card border color.',
    feedbackMessage: 'Files edited and saved',
    action: {
      type: 'fileEdit',
      label: 'Apply edits',
      edits: [
        {
          path: 'packages/api-client/src/index.ts',
          replacements: [
            { find: "'Alice Johnson'", replace: "'Taras Shevchenko'" },
            { find: "'alice@example.com'", replace: "'taras@example.com'" },
            { find: "'Bob Smith'", replace: "'Lesia Ukrainka'" },
            { find: "'bob@example.com'", replace: "'lesia@example.com'" },
            { find: "'Charlie Brown'", replace: "'Ivan Franko'" },
            { find: "'charlie@example.com'", replace: "'ivan@example.com'" },
            { find: 'Hello, ${user.name}! Welcome to the Plunk Playground.', replace: 'Hey ${user.name}! plunk is working.' },
          ],
        },
        {
          path: 'packages/ui-kit/src/index.tsx',
          replacements: [
            { find: "borderColor: '#30363d'", replace: "borderColor: '#58a6ff'" },
          ],
        },
      ],
    },
  },
  {
    id: 'push-changes',
    title: 'Push changes',
    description: 'Build and push to the consumer.',
    detail: 'Rebuilds the edited packages and pushes updated files. The preview will update with new names and a blue card border.',
    feedbackMessage: 'Changes pushed — check the preview!',
    action: { type: 'command-new-terminal', command: 'npm run push:api && npm run push:ui', label: 'Build & Push' },
  },
  {
    id: 'watch-mode',
    title: 'Watch mode',
    description: 'Auto-push on file changes.',
    detail: 'Runs push with --watch. Now try editing a file in the editor — changes appear in the preview automatically.',
    feedbackMessage: 'Watch mode active — try editing!',
    action: { type: 'command-new-terminal', command: 'cd packages/api-client && npx -y @olegkuibar/plunk push --watch --build "npm run build"', label: 'Start watch' },
  },
];

// --- Manual mode reference ---

const MANUAL_COMMANDS = [
  { label: 'Publish', command: 'cd packages/api-client && plunk publish' },
  { label: 'Link', command: 'cd consumer-app && plunk add @example/api-client' },
  { label: 'Push', command: 'cd packages/api-client && npm run build && plunk push' },
  { label: 'Watch', command: 'plunk push --watch --build "npm run build"' },
];

const MANUAL_FILES = [
  'packages/api-client/src/index.ts',
  'packages/ui-kit/src/index.tsx',
];

// --- Component ---

const FEEDBACK_DURATION_MS = 4000;

type TutorialMode = 'guided' | 'manual';

interface TutorialProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string) => Promise<void>;
  onOpenFile: (path: string) => Promise<void>;
}

export function Tutorial({ isCollapsed = false, onToggle, readFile, writeFile, onOpenFile }: TutorialProps) {
  const [mode, setMode] = useState<TutorialMode>('guided');
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { executeCommand, executeInNewTerminal, isShellConnected } = useTerminalContext();

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const advanceStep = useCallback(() => {
    setCurrentStep(prev => prev < STEPS.length - 1 ? prev + 1 : prev);
    setIsRunning(false);
  }, []);

  const completeStep = useCallback((step: Step) => {
    setCompletedSteps(prev => new Set([...prev, step.id]));
    setFeedback(step.feedbackMessage);
    setTimeout(advanceStep, 500);
  }, [advanceStep]);

  const handleFileEdits = useCallback(async (edits: FileEdit[]) => {
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      const content = await readFile(edit.path);
      if (content === null) continue;

      let newContent = content;
      for (const { find, replace } of edit.replacements) {
        newContent = newContent.replace(find, replace);
      }

      await writeFile(edit.path, newContent);
      await onOpenFile(edit.path);

      // Small delay between files for visual effect
      if (i < edits.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }, [readFile, writeFile, onOpenFile]);

  const handleRunAction = useCallback(async (step: Step) => {
    if (completedSteps.has(step.id) || isRunning) return;

    const action = step.action;

    // Passive steps don't need shell
    if (action.type === 'passive') {
      completeStep(step);
      return;
    }

    // File edits don't need shell either, but the environment must be ready
    if (action.type === 'fileEdit') {
      setIsRunning(true);
      await handleFileEdits(action.edits);
      completeStep(step);
      return;
    }

    if (!isShellConnected) return;

    setIsRunning(true);

    if (action.type === 'command') {
      executeCommand(action.command);
    } else if (action.type === 'command-new-terminal') {
      executeInNewTerminal(action.command);
    }

    completeStep(step);
  }, [executeCommand, executeInNewTerminal, isShellConnected, completeStep, handleFileEdits, completedSteps, isRunning]);

  const progress = (completedSteps.size / STEPS.length) * 100;
  const isComplete = completedSteps.size === STEPS.length;
  const nextStep = STEPS[currentStep];

  // --- Collapsed pill ---
  if (isCollapsed) {
    return (
      <motion.button
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        onClick={onToggle}
        className={`
          fixed bottom-4 right-4 z-50
          flex items-center gap-2 px-4 py-2.5
          rounded-full shadow-lg transition-colors
          ${isComplete ? 'bg-success text-white' : 'bg-accent text-black'}
        `}
      >
        {!isComplete && (
          <motion.span
            className="w-2 h-2 rounded-full bg-black/30"
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        <span className="text-sm font-medium">
          {isComplete
            ? 'Complete!'
            : `Next: ${nextStep?.title} (${completedSteps.size + 1}/${STEPS.length})`
          }
        </span>
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="fixed bottom-4 right-4 z-50 w-80 bg-bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="font-medium text-sm text-text">Quick Start</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex bg-bg-muted rounded-md text-[10px]">
            <button
              onClick={() => setMode('guided')}
              className={`px-2 py-1 rounded-md transition-colors ${
                mode === 'guided' ? 'bg-accent text-black font-medium' : 'text-text-muted hover:text-text'
              }`}
            >
              Guided
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-2 py-1 rounded-md transition-colors ${
                mode === 'manual' ? 'bg-accent text-black font-medium' : 'text-text-muted hover:text-text'
              }`}
            >
              Manual
            </button>
          </div>
          <button onClick={onToggle} className="text-text-muted hover:text-text transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      {mode === 'guided' ? (
        <>
          {/* Horizontal stepper — compact for 7 steps */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              {STEPS.map((step, idx) => {
                const isDone = completedSteps.has(step.id);
                const isCurrent = idx === currentStep;
                return (
                  <div key={step.id} className="flex items-center">
                    <motion.div
                      className={`
                        w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold relative
                        ${isDone
                          ? 'bg-success text-white'
                          : isCurrent
                            ? 'bg-accent text-black'
                            : 'bg-bg-muted text-text-subtle'
                        }
                      `}
                      animate={isCurrent ? { scale: [1, 1.15, 1] } : {}}
                      transition={isCurrent ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : {}}
                      title={step.title}
                    >
                      {isDone ? '\u2713' : idx + 1}
                      {isCurrent && (
                        <motion.div
                          layoutId="step-highlight"
                          className="absolute inset-0 rounded-full border-2 border-accent"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </motion.div>
                    {idx < STEPS.length - 1 && (
                      <div className={`w-3 h-0.5 ${isDone ? 'bg-success' : 'bg-bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feedback message */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-2 bg-success/10 border-b border-success/20 flex items-center gap-2">
                  <span className="text-success text-xs font-medium">{'\u2713'} {feedback}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Current step detail */}
          <div className="p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <h3 className="text-sm font-medium text-text mb-1">
                  {STEPS[currentStep].title}
                </h3>
                <p className="text-xs text-text-muted mb-2">
                  {STEPS[currentStep].description}
                </p>
                <p className="text-[11px] text-text-subtle mb-4 leading-relaxed">
                  {STEPS[currentStep].detail}
                </p>

                <button
                  onClick={() => handleRunAction(STEPS[currentStep])}
                  disabled={
                    completedSteps.has(STEPS[currentStep].id) ||
                    isRunning ||
                    (STEPS[currentStep].action.type !== 'passive' &&
                     STEPS[currentStep].action.type !== 'fileEdit' &&
                     !isShellConnected)
                  }
                  className={`
                    w-full py-2.5 px-3 rounded-lg text-xs font-medium transition-all
                    ${completedSteps.has(STEPS[currentStep].id)
                      ? 'bg-success/20 text-success cursor-default'
                      : isRunning
                        ? 'bg-bg-muted text-text-muted cursor-not-allowed'
                        : 'bg-accent text-black hover:bg-accent/90'
                    }
                  `}
                >
                  {completedSteps.has(STEPS[currentStep].id)
                    ? '\u2713 Done'
                    : isRunning
                      ? 'Running...'
                      : STEPS[currentStep].action.label
                  }
                </button>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-border">
            <motion.div
              className="h-full bg-accent"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Complete footer */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 py-3 border-t border-border bg-success/10 text-center"
            >
              <p className="text-sm text-success font-medium">You're all set!</p>
              <p className="text-xs text-text-muted mt-1">
                Try editing files — changes push automatically
              </p>
            </motion.div>
          )}
        </>
      ) : (
        /* Manual mode — reference card */
        <div className="p-4">
          <p className="text-xs text-text-muted mb-3">
            Run these in the terminal. Open new tabs for long-running commands.
          </p>

          {/* Commands */}
          <div className="space-y-2 mb-4">
            {MANUAL_COMMANDS.map((cmd) => (
              <div key={cmd.label} className="flex items-start gap-2">
                <span className="text-[10px] text-text-subtle w-12 shrink-0 pt-0.5 font-medium">
                  {cmd.label}
                </span>
                <code className="text-[11px] text-accent bg-bg-muted px-2 py-1 rounded break-all leading-relaxed">
                  {cmd.command}
                </code>
              </div>
            ))}
          </div>

          {/* Files to edit */}
          <p className="text-[10px] text-text-subtle font-medium mb-2 uppercase tracking-wider">
            Files to edit
          </p>
          <div className="space-y-1">
            {MANUAL_FILES.map((path) => (
              <button
                key={path}
                onClick={() => onOpenFile(path)}
                className="block text-[11px] text-accent hover:text-accent/80 hover:underline transition-colors"
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
