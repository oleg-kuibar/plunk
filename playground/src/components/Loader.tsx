import { motion } from 'framer-motion';

interface LoaderProps {
  /** Loading message to display */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Plunk Loader - Clean ring spinner with centered logo
 */
export function Loader({ message, size = 'md' }: LoaderProps) {
  const sizes = {
    sm: { logo: 32, ring: 48, text: 'text-xs' },
    md: { logo: 48, ring: 72, text: 'text-sm' },
    lg: { logo: 64, ring: 96, text: 'text-base' },
  };

  const s = sizes[size];

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative" style={{ width: s.ring, height: s.ring }}>
        {/* Spinning ring */}
        <svg
          className="absolute inset-0"
          width={s.ring}
          height={s.ring}
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-border"
          />
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-accent"
            strokeLinecap="round"
            strokeDasharray="80 209"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: 'center' }}
          />
        </svg>

        {/* Center logo */}
        <div
          className="absolute rounded-full overflow-hidden bg-bg-elevated"
          style={{
            width: s.logo,
            height: s.logo,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <img
            src="/plunk_logo.png"
            alt="Plunk"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {message && (
        <p className={`text-text-muted ${s.text}`}>{message}</p>
      )}
    </div>
  );
}

/**
 * Simple spinner for inline loading states
 */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`text-accent ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.15" />
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </motion.svg>
  );
}

/**
 * Code brackets loader
 */
export function CodeLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 32, md: 48, lg: 64 };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <motion.span
        className="text-accent font-mono font-bold"
        style={{ fontSize: s * 0.5 }}
        animate={{ x: [-4, 0, -4] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        {'<'}
      </motion.span>
      <motion.div
        className="flex gap-1"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-text-subtle"
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
          />
        ))}
      </motion.div>
      <motion.span
        className="text-accent font-mono font-bold"
        style={{ fontSize: s * 0.5 }}
        animate={{ x: [4, 0, 4] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        {'/>'}
      </motion.span>
    </div>
  );
}

export default Loader;
