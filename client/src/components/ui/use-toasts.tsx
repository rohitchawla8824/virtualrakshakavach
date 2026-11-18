import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

type Toast = { id: number; message: string; tone: 'success' | 'info' | 'error' };
export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  function show(message: string, tone: Toast['tone'] = 'info') {
    const id = Date.now();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600);
  }
  const icons = { success: Check, info: Info, error: AlertTriangle };
  const view = (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2"
    >
      {items.map((item) => {
        const Icon = icons[item.tone];
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-lg"
          >
            <Icon
              size={18}
              className={
                item.tone === 'success'
                  ? 'text-success'
                  : item.tone === 'error'
                    ? 'text-danger'
                    : 'text-cyan'
              }
            />
            <span className="flex-1 text-slate-700">{item.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            >
              <X size={16} className="text-slate-400" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
  return { show, view };
}
