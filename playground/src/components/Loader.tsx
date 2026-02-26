import { motion } from 'framer-motion';

interface LoaderProps {
  /** Loading message to display */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Plunk Loader - Logo-centered loading animation
 *
 * Features the plunk logo with orbiting particles representing
 * packages being processed and delivered.
 */
export function Loader({ message, size = 'md' }: LoaderProps) {
  const sizes = {
    sm: { logo: 48, ring: 64, particle: 6, text: 'text-xs' },
    md: { logo: 72, ring: 96, particle: 8, text: 'text-sm' },
    lg: { logo: 96, ring: 128, particle: 10, text: 'text-base' },
  };

  const s = sizes[size];
  const particleCount = 6;

  return (
    <div className="flex flex-col items-center justify-center gap-5">
      {/* Logo with animated ring */}
      <div className="relative" style={{ width: s.ring, height: s.ring }}>
        {/* Outer glow pulse */}
        <motion.div
          className="absolute inset-0 rounded-full bg-accent/20"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Rotating ring track */}
        <svg
          className="absolute inset-0"
          width={s.ring}
          height={s.ring}
          viewBox="0 0 100 100"
        >
          {/* Background track */}
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-border"
            strokeDasharray="4 8"
          />
          {/* Animated progress arc */}
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
            strokeLinecap="round"
            strokeDasharray="72 217"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ transformOrigin: 'center' }}
          />
        </svg>

        {/* Orbiting particles */}
        {Array.from({ length: particleCount }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: s.particle,
              height: s.particle,
              left: '50%',
              top: '50%',
              marginLeft: -s.particle / 2,
              marginTop: -s.particle / 2,
            }}
            animate={{
              x: Math.cos((i / particleCount) * Math.PI * 2) * (s.ring / 2 - s.particle),
              y: Math.sin((i / particleCount) * Math.PI * 2) * (s.ring / 2 - s.particle),
              scale: [0.8, 1.2, 0.8],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              x: { duration: 2.5, repeat: Infinity, ease: 'linear', delay: (i / particleCount) * 2.5 },
              y: { duration: 2.5, repeat: Infinity, ease: 'linear', delay: (i / particleCount) * 2.5 },
              scale: { duration: 1.2, repeat: Infinity, delay: i * 0.2 },
              opacity: { duration: 1.2, repeat: Infinity, delay: i * 0.2 },
            }}
          >
            <div
              className={`w-full h-full rounded-full ${
                i % 3 === 0 ? 'bg-accent' : i % 3 === 1 ? 'bg-success' : 'bg-secondary'
              }`}
            />
          </motion.div>
        ))}

        {/* Center logo */}
        <div
          className="absolute rounded-full overflow-hidden bg-bg-elevated shadow-lg"
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

      {/* Loading message */}
      {message && (
        <motion.p
          className={`text-text-muted ${s.text}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}

/**
 * Simple spinner variant for inline/small loading states
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
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.2"
      />
      <motion.path
        d="M12 2 A10 10 0 0 1 22 12"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

/**
 * Code brackets loader - represents code being processed
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
            className="w-2 h-2 rounded-full bg-success"
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{
              duration: 0.6,
              delay: i * 0.15,
              repeat: Infinity,
            }}
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
