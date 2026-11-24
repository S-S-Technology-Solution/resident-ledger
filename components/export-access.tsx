"use client";

import { createContext, useContext, useEffect } from "react";

const ExportAccess = createContext(true);

/** Whether the signed-in user may export and print. */
export const useCanExport = () => useContext(ExportAccess);

/**
 * Tells the export and print buttons whether to show. When the user may not
 * print, also swallows Ctrl/Cmd+P; printing from the browser's own menu gives a
 * blank page (see data-no-export in globals.css).
 */
export function ExportAccessProvider({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (allowed) return;
    const block = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "p" || e.code === "KeyP")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [allowed]);

  return <ExportAccess.Provider value={allowed}>{children}</ExportAccess.Provider>;
}
