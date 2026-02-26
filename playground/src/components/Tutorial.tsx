import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTerminalContext } from '../contexts/TerminalContext';

interface Step {
  id: string;
  title: string;
  description: string;
  action?: {
    label: string;
    command: string;
  };
}

const STEPS: Step[] = [
  {
    id: 'publish',
    title: 'Publish packages',
    description: 'Publish both packages to the local plunk store.',
    action: {
      label: 'Publish all',
      command: 'npm run publish:all',
    },
  },
  {
    id: 'link',
    title: 'Link to consumer',
    description: 'Add packages to the consumer app.',
    action: {
      label: 'Link packages',
      command: 'npm run link:all',
    },
  },
  {
    id: 'install',
    title: 'Install & start',
    description: 'Install dependencies and start the dev server.',
    action: {
      label: 'npm install & dev',
      command: 'npm run start',
    },
  },
  {
    id: 'edit',
    title: 'Make changes',
    description: 'Edit src/index.ts, build, then push to see changes:',
    action: {
      label: 'Build & Push',
      command: 'npm run push:api',
    },
  },
];

interface TutorialProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function Tutorial({ isCollapsed = false, onToggle }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const { executeCommand, isShellConnected } = useTerminalContext();

  const handleRunAction = useCallback((step: Step) => {
    if (!isShellConnected || !step.action) return;

    setIsRunning(true);
    executeCommand(step.action.command);

    // Mark as completed and move to next
    setCompletedSteps(prev => new Set([...prev, step.id]));
    if (currentStep < STEPS.length - 1) {
      setTimeout(() => {
        setCurrentStep(prev => prev + 1);
        setIsRunning(false);
      }, 500);
    } else {
      setIsRunning(false);
    }
  }, [executeCommand, isShellConnected, currentStep]);

  const progress = ((completedSteps.size) / STEPS.length) * 100;
  const isComplete = completedSteps.size === STEPS.length;

  // Collapsed state - floating button
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
          rounded-full shadow-lg
          transition-colors
          ${isComplete
            ? 'bg-success text-white'
            : 'bg-accent text-black'
          }
        `}
      >
        <span className="text-sm font-medium">
          {isComplete ? 'Complete!' : 'Tutorial'}
        </span>
        <span className="text-xs opacity-80">
          {completedSteps.size}/{STEPS.length}
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="font-medium text-sm text-text">Quick Start</span>
        </div>
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text transition-colors p-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-border">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Steps */}
      <div className="p-3 space-y-2">
        {STEPS.map((step, idx) => {
          const isActive = idx === currentStep;
          const isDone = completedSteps.has(step.id);
          const isPast = idx < currentStep;

          return (
            <motion.div
              key={step.id}
              initial={false}
              animate={{
                opacity: isActive ? 1 : isPast ? 0.5 : 0.7,
                scale: isActive ? 1 : 0.98,
              }}
              className={`
                rounded-lg transition-colors
                ${isActive ? 'bg-bg-subtle' : ''}
              `}
            >
              <button
                onClick={() => !isDone && setCurrentStep(idx)}
                disabled={isDone}
                className="w-full flex items-start gap-3 p-3 text-left"
              >
                {/* Step indicator */}
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${isDone
                    ? 'bg-success text-white'
                    : isActive
                      ? 'bg-accent text-black'
                      : 'bg-bg-muted text-text-muted'
                  }
                `}>
                  {isDone ? '\u2713' : idx + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isActive ? 'text-text' : 'text-text-muted'}`}>
                    {step.title}
                  </div>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <p className="text-xs text-text-muted mt-1 mb-3">
                          {step.description}
                        </p>

                        {step.action && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunAction(step);
                            }}
                            disabled={!isShellConnected || isRunning}
                            className={`
                              w-full py-2 px-3 rounded-lg text-xs font-medium
                              transition-all
                              ${isShellConnected && !isRunning
                                ? 'bg-accent text-black hover:bg-accent/90'
                                : 'bg-bg-muted text-text-muted cursor-not-allowed'
                              }
                            `}
                          >
                            {isRunning ? 'Running...' : step.action.label}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 py-3 border-t border-border bg-success/10 text-center"
        >
          <p className="text-sm text-success font-medium">
            {'\u2728'} You're all set!
          </p>
          <p className="text-xs text-text-muted mt-1">
            Try <code className="text-accent">plunk push --watch</code> for live reload
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
