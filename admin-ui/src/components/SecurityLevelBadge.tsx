/**
 * SecurityLevelBadge — visual indicator for CodeRule security classification.
 *
 * Levels:
 *   0 OPEN          — Red    — No cryptographic auth
 *   1 CONTROLLED    — Amber  — Check digit / serial but no HMAC
 *   2 AUTHENTICATED — Green  — HMAC present
 *   3 PROTECTED     — Blue   — HMAC + anti-fraud controls
 */

import { cn } from '../lib/cn';

type SecurityLevelCode = 'OPEN' | 'CONTROLLED' | 'AUTHENTICATED' | 'PROTECTED';

interface SecurityLevelBadgeProps {
  level: SecurityLevelCode;
  label?: string;
  showDescription?: boolean;
  className?: string;
}

const config: Record<SecurityLevelCode, {
  numericLevel: number;
  colors: string;
  dot: string;
  shortLabel: string;
  description: string;
}> = {
  OPEN: {
    numericLevel: 0,
    colors: 'bg-red-100 text-red-800 border-red-200',
    dot: 'bg-red-500',
    shortLabel: 'INSEGURO',
    description: 'Sin autenticacion criptografica. Los codigos pueden ser generados externamente.',
  },
  CONTROLLED: {
    numericLevel: 1,
    colors: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    shortLabel: 'BASICO',
    description: 'Check digit o serial aleatorio. Evita errores, pero no evita fabricacion.',
  },
  AUTHENTICATED: {
    numericLevel: 2,
    colors: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    shortLabel: 'SEGURO',
    description: 'HMAC criptografico. Los codigos se verifican contra el secreto del fabricante.',
  },
  PROTECTED: {
    numericLevel: 3,
    colors: 'bg-blue-100 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
    shortLabel: 'PROTEGIDO',
    description: 'HMAC + controles antifraude avanzados (geo-fencing, alta entropia).',
  },
};

export function SecurityLevelBadge({ level, label, showDescription = false, className }: SecurityLevelBadgeProps) {
  const cfg = config[level] || config.OPEN;

  return (
    <div className={cn('inline-flex flex-col', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border',
          cfg.colors,
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
        Nivel {cfg.numericLevel} — {label || cfg.shortLabel}
      </span>
      {showDescription && (
        <span className="text-xs text-gray-500 mt-1 max-w-xs">
          {cfg.description}
        </span>
      )}
    </div>
  );
}

interface SecurityWarningsProps {
  warnings: Array<string | { message: string; code?: string }>;
}

export function SecurityWarnings({ warnings }: SecurityWarningsProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs font-semibold text-amber-800 mb-1">Advertencias de seguridad</p>
      <ul className="list-disc list-inside space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-amber-700">
            {typeof w === 'string' ? w : w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
