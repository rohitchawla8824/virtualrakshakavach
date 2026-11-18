import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';

export function Button({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const styles = {
    primary: 'bg-action text-white hover:bg-blue-700 shadow-sm',
    secondary: 'border border-slate-200 bg-white text-navy hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-danger text-white hover:bg-red-800',
  };
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        className={`field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`panel rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(20,43,74,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'cyan' | 'red';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-success',
    amber: 'bg-amber-50 text-warning',
    cyan: 'bg-cyan-50 text-cyan',
    red: 'bg-red-50 text-danger',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="panel w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            initial={{ y: 12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, scale: 0.98 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="dialog-title" className="text-lg font-bold text-navy">
                  {title}
                </h2>
                <div className="muted mt-2 text-sm leading-6 text-slate-600">{children}</div>
              </div>
              <button
                aria-label="Close dialog"
                onClick={onClose}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onConfirm}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-label="Loading" className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-cyan-50 text-cyan">
        <Info size={21} />
      </div>
      <h3 className="mt-4 font-semibold text-navy">{title}</h3>
      <p className="muted mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ retry, error }: { retry: () => void; error?: unknown }) {
  const diagnostic =
    typeof error === 'object' && error !== null && 'status' in error
      ? [
          typeof error.status === 'number' ? `HTTP ${error.status}` : undefined,
          'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
            ? String(error.code)
            : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-danger"
    >
      <span>
        We couldn’t load this information. Please try again.
        {diagnostic && <span className="mt-1 block text-xs text-slate-600">{diagnostic}</span>}
      </span>
      <Button variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
