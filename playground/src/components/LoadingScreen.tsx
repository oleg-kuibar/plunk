import { motion } from 'framer-motion';
import { Loader } from './Loader';
import type { BootStatus } from '../hooks/useWebContainer';

const BOOT_PHASES = ['idle', 'booting', 'mounting', 'installing'] as const;

const PHASE_LABELS: Record<string, string> = {
  idle: 'Initializing...',
  booting: 'Booting WebContainer...',
  mounting: 'Mounting filesystem...',
  installing: 'Installing dependencies...',
};

export function LoadingScreen({ status }: { status: BootStatus }) {
  const currentIdx = BOOT_PHASES.indexOf(status as (typeof BOOT_PHASES)[number]);
  const progress = Math.max(0, ((currentIdx + 1) / BOOT_PHASES.length) * 100);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-text">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-8 max-w-sm w-full px-6"
      >
        <Loader size="lg" />

        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold text-text">Plunk Playground</h1>
          <p className="text-sm text-text-muted">
            {PHASE_LABELS[status] ?? 'Loading...'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[240px]">
          <div className="h-1 bg-bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {BOOT_PHASES.map((phase, idx) => (
              <div
                key={phase}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  currentIdx > idx
                    ? 'bg-success'
                    : currentIdx === idx
                      ? 'bg-accent'
                      : 'bg-bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
