"use client";

// Contexto para abrir el tutorial desde cualquier pantalla.
//
// El estado del tour vive en AppShell (envuelve toda la app), pero el botón
// para abrirlo aparece en varios lados: el menú lateral, el menú de cuenta en
// mobile y el encabezado del dashboard. Un contexto evita tener que ir
// pasando callbacks por props a través de media app.

import { createContext, useContext } from "react";

interface TourCtx {
  abrirTutorial: () => void;
}

const Ctx = createContext<TourCtx>({ abrirTutorial: () => {} });

export const TourProvider = Ctx.Provider;

export function useTutorial(): TourCtx {
  return useContext(Ctx);
}
