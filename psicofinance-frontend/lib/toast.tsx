"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Check, X, AlertCircle, Info } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id:      string;
  message: string;
  type:    ToastType;
  out:     boolean;   // true = fade-out iniciado
}

interface ToastCtx {
  success: (message: string) => void;
  error:   (message: string) => void;
  info:    (message: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts(p => [...p, { id, message, type, out: false }]);

    // Empezar fade-out a los 3.2s
    setTimeout(() => {
      setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t));
    }, 3200);

    // Eliminar del DOM a los 3.5s (300ms para la transición)
    setTimeout(() => {
      setToasts(p => p.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 300);
  }, []);

  const ctx: ToastCtx = {
    success: (m) => add(m, "success"),
    error:   (m) => add(m, "error"),
    info:    (m) => add(m, "info"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Contenedor — bottom-right en desktop, bottom-center en mobile */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[200] flex flex-col gap-2 pointer-events-none items-end">
        {toasts.map(t => (
          <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Componente visual ─────────────────────────────────────────────────────────

const CONFIG: Record<ToastType, { icon: ReactNode; cls: string; iconCls: string }> = {
  success: {
    icon:    <Check className="h-4 w-4" />,
    cls:     "bg-emerald-50 ring-emerald-200 text-emerald-800",
    iconCls: "text-emerald-500",
  },
  error: {
    icon:    <AlertCircle className="h-4 w-4" />,
    cls:     "bg-red-50 ring-red-200 text-red-700",
    iconCls: "text-red-500",
  },
  info: {
    icon:    <Info className="h-4 w-4" />,
    cls:     "bg-white ring-neutral-200 text-neutral-700",
    iconCls: "text-indigo-500",
  },
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { icon, cls, iconCls } = CONFIG[item.type];
  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1 text-sm font-medium min-w-[220px] max-w-[340px] transition-all duration-300 ${cls} ${item.out ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}
    >
      <span className={`shrink-0 ${iconCls}`}>{icon}</span>
      <span className="flex-1 leading-snug">{item.message}</span>
      <button onClick={onDismiss} className="shrink-0 rounded-md p-0.5 opacity-40 hover:opacity-80 transition-opacity">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
