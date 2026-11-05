import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-full max-w-md px-4 pointer-events-none transition-all">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full flex items-start gap-3 p-3.5 sm:p-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${
              isSuccess
                ? 'bg-slate-900/95 dark:bg-slate-900/95 text-slate-100 border-emerald-500/40'
                : isError
                ? 'bg-slate-900/95 dark:bg-slate-900/95 text-slate-100 border-rose-500/40'
                : 'bg-slate-900/95 dark:bg-slate-900/95 text-slate-100 border-slate-700/60'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {!isSuccess && !isError && <Info className="w-5 h-5 text-cyan-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="text-[11px] sm:text-xs text-slate-300 dark:text-slate-400 mt-0.5 leading-relaxed break-words">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
