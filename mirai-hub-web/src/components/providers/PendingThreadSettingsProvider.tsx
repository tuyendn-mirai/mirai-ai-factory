"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Holds the model / MCP project picked in the sidebar's Settings panel
// *before* a thread exists yet (the Empty/new-chat screen). Once the
// first message creates a thread, these become that thread's initial
// llmModel / mcpProjectId (see chat/page.tsx's Composer onSend) and the
// thread's own persisted settings take over from useThreadSettings.
interface PendingThreadSettings {
  model: string | null;
  setModel: (model: string) => void;
  mcpProjectId: string | null;
  setMcpProjectId: (id: string | null) => void;
  reset: () => void;
}

const PendingThreadSettingsContext = createContext<PendingThreadSettings | null>(null);

export function PendingThreadSettingsProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<string | null>(null);
  const [mcpProjectId, setMcpProjectId] = useState<string | null>(null);

  return (
    <PendingThreadSettingsContext.Provider
      value={{
        model,
        setModel,
        mcpProjectId,
        setMcpProjectId,
        reset: () => {
          setModel(null);
          setMcpProjectId(null);
        },
      }}
    >
      {children}
    </PendingThreadSettingsContext.Provider>
  );
}

export function usePendingThreadSettings() {
  const ctx = useContext(PendingThreadSettingsContext);
  if (!ctx) {
    throw new Error("usePendingThreadSettings must be used within PendingThreadSettingsProvider");
  }
  return ctx;
}
