"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PreviewScenario } from "./fixtures";

type PreviewState = {
  scenario: PreviewScenario;
  setScenario: (scenario: PreviewScenario) => void;
  saved: string[];
  hidden: string[];
  relevant: string[];
  paused: string[];
  toggleSaved: (id: string) => void;
  toggleHidden: (id: string) => void;
  toggleRelevant: (id: string) => void;
  togglePaused: (id: string) => void;
};

const PreviewContext = createContext<PreviewState | null>(null);

/** Returns a fresh selection without mutating React state. */
function toggleSelection(selection: string[], id: string): string[] {
  return selection.includes(id)
    ? selection.filter((item) => item !== id)
    : [...selection, id];
}

/** Holds only temporary design-preview interactions; never persists or calls account APIs. */
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<PreviewScenario>("ready");
  const [saved, setSaved] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [relevant, setRelevant] = useState<string[]>([]);
  const [paused, setPaused] = useState<string[]>([]);

  return (
    <PreviewContext.Provider
      value={{
        scenario,
        setScenario,
        saved,
        hidden,
        relevant,
        paused,
        toggleSaved: (id) =>
          setSaved((current) => toggleSelection(current, id)),
        toggleHidden: (id) =>
          setHidden((current) => toggleSelection(current, id)),
        toggleRelevant: (id) =>
          setRelevant((current) => toggleSelection(current, id)),
        togglePaused: (id) =>
          setPaused((current) => toggleSelection(current, id)),
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

/** Requires the isolated preview layout so sample actions cannot leak into the real workspace. */
export function usePreview(): PreviewState {
  const context = useContext(PreviewContext);

  if (!context) {
    throw new Error("Discovery preview components require PreviewProvider.");
  }

  return context;
}
