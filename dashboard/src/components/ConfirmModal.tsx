import { useEffect, useRef } from 'react';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get red styling and confirm stays unfocused */
  danger?: boolean;
}

/**
 * Accessible replacement for window.confirm() — role="dialog", Escape to
 * cancel, backdrop click to cancel, and a Tab trap between the two buttons.
 * The CANCEL button receives initial focus so a stray Enter never confirms
 * a destructive action.
 */
export function ConfirmModal({ config, onResolve }: {
  config: ConfirmConfig;
  onResolve: (confirmed: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(false);
      } else if (e.key === 'Tab') {
        // trap Tab between the two buttons
        e.preventDefault();
        const active = document.activeElement;
        if (active === cancelRef.current) confirmRef.current?.focus();
        else cancelRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onResolve]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={() => onResolve(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
        className="glass-card max-w-md w-full mx-4 p-6 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`text-2xl ${config.danger ? '' : ''}`}>
            {config.danger ? '⚠️' : '❓'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">{config.title}</h3>
            <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">
              {config.message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            ref={cancelRef}
            onClick={() => onResolve(false)}
            className="btn btn-secondary text-sm"
          >
            {config.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onResolve(true)}
            className={`btn text-sm ${config.danger
              ? 'bg-red-600/20 border border-red-500/50 text-red-300 hover:bg-red-600/30'
              : 'bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30'
              }`}
          >
            {config.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
