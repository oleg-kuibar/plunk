import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader } from './Loader';
import type { BootStatus } from '../hooks/useWebContainer';

const BOOT_PHASES = ['idle', 'booting', 'mounting', 'installing'] as const;

const PHASE_LABELS: Record<string, string> = {
  idle: 'Initializing',
  booting: 'Booting',
  mounting: 'Mounting',
  installing: 'Installing',
};

interface InfoSlide {
  title: string;
  content: React.ReactNode;
}

const CAROUSEL_INTERVAL_MS = 8000;

function ProgressStepper({ status }: { status: BootStatus }) {
  const currentIdx = BOOT_PHASES.indexOf(status as (typeof BOOT_PHASES)[number]);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {BOOT_PHASES.map((phase, idx) => {
        const isCompleted = currentIdx > idx;
        const isCurrent = currentIdx === idx;

        return (
          <div key={phase} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  ${isCompleted
                    ? 'bg-success text-white'
                    : isCurrent
                      ? 'bg-accent text-black'
                      : 'bg-bg-muted text-text-subtle'
                  }
                `}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={isCurrent ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : {}}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2.5 7 5.5 10 11.5 4" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </motion.div>
              <span className={`text-[10px] ${isCurrent ? 'text-accent font-medium' : isCompleted ? 'text-success' : 'text-text-subtle'}`}>
                {PHASE_LABELS[phase]}
              </span>
            </div>
            {idx < BOOT_PHASES.length - 1 && (
              <div className={`w-8 h-0.5 -mt-5 ${isCompleted ? 'bg-success' : 'bg-bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowDiagram() {
  return (
    <div className="flex items-center justify-center gap-3 my-4">
      {['Source', 'Store', 'node_modules'].map((label, idx) => (
        <div key={label} className="flex items-center gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.3, duration: 0.4 }}
            className="px-4 py-2 rounded-lg bg-bg-subtle border border-border text-sm font-medium text-text"
          >
            {label}
          </motion.div>
          {idx < 2 && (
            <motion.svg
              width="24"
              height="12"
              viewBox="0 0 24 12"
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: 1, pathLength: 1 }}
              transition={{ delay: idx * 0.3 + 0.2, duration: 0.4 }}
            >
              <motion.path
                d="M0 6 L18 6 M14 2 L18 6 L14 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: idx * 0.3 + 0.2, duration: 0.4 }}
              />
            </motion.svg>
          )}
        </div>
      ))}
    </div>
  );
}

function CommandsSlide() {
  const commands = [
    { name: 'publish', desc: 'Copy built files to store' },
    { name: 'add', desc: 'Link package to consumer' },
    { name: 'push', desc: 'Publish + inject in one step' },
    { name: 'watch', desc: 'Auto-rebuild & hot-inject' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 my-4">
      {commands.map((cmd, idx) => (
        <motion.div
          key={cmd.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1, duration: 0.3 }}
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bg-subtle border border-border"
        >
          <code className="text-accent text-xs font-bold shrink-0">{cmd.name}</code>
          <span className="text-text-muted text-xs">{cmd.desc}</span>
        </motion.div>
      ))}
    </div>
  );
}

function BenefitsSlide() {
  const benefits = ['No symlinks', 'Incremental sync', 'Watch mode', 'CoW copies'];

  return (
    <div className="flex flex-wrap justify-center gap-2 my-4">
      {benefits.map((benefit, idx) => (
        <motion.span
          key={benefit}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.1, duration: 0.3 }}
          className="px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-medium border border-accent/20"
        >
          {benefit}
        </motion.span>
      ))}
    </div>
  );
}

const SLIDES: InfoSlide[] = [
  {
    title: 'What is plunk?',
    content: (
      <div>
        <p className="text-text-muted text-sm mb-2">
          Local npm package development without symlinks. Copy built files into consumer <code className="text-accent">node_modules/</code> with incremental sync.
        </p>
        <FlowDiagram />
      </div>
    ),
  },
  {
    title: 'How it works',
    content: (
      <div>
        <p className="text-text-muted text-sm mb-2">
          Four core commands power the plunk workflow:
        </p>
        <CommandsSlide />
      </div>
    ),
  },
  {
    title: 'Why plunk?',
    content: (
      <div>
        <p className="text-text-muted text-sm mb-3">
          Built for real-world monorepo and multi-package development:
        </p>
        <BenefitsSlide />
      </div>
    ),
  },
];

function SegmentedProgressBar({ status }: { status: BootStatus }) {
  const currentIdx = BOOT_PHASES.indexOf(status as (typeof BOOT_PHASES)[number]);

  return (
    <div className="flex gap-1.5 mt-6">
      {BOOT_PHASES.map((phase, idx) => {
        const isCompleted = currentIdx > idx;
        const isCurrent = currentIdx === idx;

        return (
          <div key={phase} className="flex-1 h-1 rounded-full bg-bg-muted overflow-hidden">
            {isCompleted && (
              <div className="h-full w-full bg-success rounded-full" />
            )}
            {isCurrent && (
              <motion.div
                className="h-full bg-accent rounded-full"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '60%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LoadingScreen({ status }: { status: BootStatus }) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, CAROUSEL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-text">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-elevated border border-border rounded-xl p-10 text-center max-w-lg w-full mx-4"
      >
        {/* Progress stepper */}
        <ProgressStepper status={status} />

        {/* Loader */}
        <Loader size="lg" />

        <h1 className="text-xl font-semibold mt-6 mb-6">Plunk Playground</h1>

        {/* Info carousel */}
        <div className="min-h-[180px] relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlide}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-sm font-semibold text-accent mb-2">
                {SLIDES[activeSlide].title}
              </h2>
              {SLIDES[activeSlide].content}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Carousel dots */}
        <div className="flex justify-center gap-2 mt-4">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === activeSlide ? 'bg-accent' : 'bg-bg-muted'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Segmented progress bar */}
        <SegmentedProgressBar status={status} />
      </motion.div>
    </div>
  );
}
