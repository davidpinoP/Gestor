"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl border border-white/10 bg-ink-900 p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm open:animate-fade-in`}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-fg-subtle hover:bg-white/5 hover:text-fg">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l10 10M14 4L4 14" /></svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
