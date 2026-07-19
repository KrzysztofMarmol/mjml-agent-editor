"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

/** Dostęp do toastów. Musi być wewnątrz <ToastProvider>. */
export function useToast(): { toast: ToastApi } {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast musi być użyte wewnątrz <ToastProvider>");
  return { toast: ctx };
}

const STYLES: Record<ToastType, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-red-300 bg-red-50 text-red-900",
  info: "border-zinc-300 bg-white text-zinc-900",
};
const ICONS: Record<ToastType, string> = { success: "✅", error: "⚠️", info: "ℹ️" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = (idRef.current += 1);
      setToasts((cur) => [...cur, { id, type, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${STYLES[t.type]}`}
          >
            <span aria-hidden>{ICONS[t.type]}</span>
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-zinc-400 hover:text-zinc-600"
              aria-label="Zamknij powiadomienie"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
