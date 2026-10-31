import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { DemoProgressEvent } from '../api/types';

interface UIContextType {
  selectedStep: string;
  setSelectedStep: (step: string) => void;
  revertPreview: boolean;
  setRevertPreview: (val: boolean) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  compareSelection: [string?, string?];
  setCompareSelection: (sel: [string?, string?]) => void;
  toggleCompareRun: (runId: string) => void;
  clearCompareSelection: () => void;
  replayProgress: DemoProgressEvent | null;
  setReplayProgress: (p: DemoProgressEvent | null) => void;
  selectedFindingId: string | null;
  setSelectedFindingId: (id: string | null) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedStep, setSelectedStep] = useState<string>('install');
  const [revertPreview, setRevertPreview] = useState<boolean>(false);
  const [panelOpen, setPanelOpen] = useState<boolean>(true);
  const [compareSelection, setCompareSelection] = useState<[string?, string?]>([undefined, undefined]);
  const [replayProgress, setReplayProgress] = useState<DemoProgressEvent | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const toggleCompareRun = (runId: string) => {
    setCompareSelection(([a, b]) => {
      if (a === runId) return [b, undefined];
      if (b === runId) return [a, undefined];
      if (!a) return [runId, undefined];
      if (!b) return [a, runId];
      // If both selected, replace first
      return [runId, undefined];
    });
  };

  const clearCompareSelection = () => {
    setCompareSelection([undefined, undefined]);
  };

  return (
    <UIContext.Provider
      value={{
        selectedStep,
        setSelectedStep,
        revertPreview,
        setRevertPreview,
        panelOpen,
        setPanelOpen,
        compareSelection,
        setCompareSelection,
        toggleCompareRun,
        clearCompareSelection,
        replayProgress,
        setReplayProgress,
        selectedFindingId,
        setSelectedFindingId,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return ctx;
}

