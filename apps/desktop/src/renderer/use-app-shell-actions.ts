import type { Ref } from "vue";
import type { DesktopRendererState } from "./desktop-runtime-bridge";

export function useAppShellActions(params: {
  state: Ref<DesktopRendererState>;
  bridge: {
    requestMemoryDebugSnapshot: () => DesktopRendererState;
    updateMemorySummary: (payload: { id: string; summary?: string; recallCues?: string[]; disabled?: boolean }) => DesktopRendererState;
    deleteMemorySummary: (id: string) => DesktopRendererState;
    clearMemorySummaries: () => DesktopRendererState;
    updateMemoryAtom: (payload: { id: string; text?: string; disabled?: boolean }) => DesktopRendererState;
    deleteMemoryAtom: (id: string) => DesktopRendererState;
    toggleCoreMemory: (payload: { id: string; disabled: boolean }) => DesktopRendererState;
    deleteCoreMemory: (id: string) => DesktopRendererState;
    clearCurrentRoleMemoryAtoms: () => DesktopRendererState;
    exportMemoryAtom: (id: string) => DesktopRendererState;
    exportMemory: () => DesktopRendererState;
  };
  syncState: (nextState: DesktopRendererState) => void;
  setModelPassThrough: (value: boolean) => void;
  openSettings: () => void;
  openChat: () => void;
  hideControls: () => void;
}) {
  function toggleModelPassThrough(): void {
    params.setModelPassThrough(!params.state.value.window.modelPassThrough);
  }

  function handleControlsDrag(payload: { screenX: number; screenY: number }, type: "start" | "move" | "end"): void {
    window.greyfield?.send(`window:controls-drag-${type}`, type === "end" ? {} : payload);
  }

  function previewExpression(expression: string): void {
    params.state.value.stage.expression = expression;
  }

  function previewMotion(group: string): void {
    params.state.value.stage.motion = { group, index: 0 };
  }

  function refreshMemoryDebug(): void {
    params.syncState(params.bridge.requestMemoryDebugSnapshot());
  }

  function updateMemorySummary(payload: { id: string; summary?: string; recallCues?: string[]; disabled?: boolean }): void {
    params.syncState(params.bridge.updateMemorySummary(payload));
  }

  function deleteMemorySummary(payload: { id: string }): void {
    params.syncState(params.bridge.deleteMemorySummary(payload.id));
  }

  function clearMemorySummaries(): void {
    params.syncState(params.bridge.clearMemorySummaries());
  }

  function updateMemoryAtom(payload: { id: string; text?: string; disabled?: boolean }): void {
    params.syncState(params.bridge.updateMemoryAtom(payload));
  }

  function deleteMemoryAtom(payload: { id: string }): void {
    params.syncState(params.bridge.deleteMemoryAtom(payload.id));
  }

  function toggleCoreMemory(payload: { id: string; disabled: boolean }): void {
    params.syncState(params.bridge.toggleCoreMemory(payload));
  }

  function deleteCoreMemory(payload: { id: string }): void {
    params.syncState(params.bridge.deleteCoreMemory(payload.id));
  }

  function clearCurrentRoleMemoryAtoms(): void {
    params.syncState(params.bridge.clearCurrentRoleMemoryAtoms());
  }

  function exportMemoryAtom(payload: { id: string }): void {
    params.syncState(params.bridge.exportMemoryAtom(payload.id));
  }

  function exportMemory(): void {
    params.syncState(params.bridge.exportMemory());
  }

  return {
    toggleModelPassThrough,
    handleControlsDragStart: (payload: { screenX: number; screenY: number }) => handleControlsDrag(payload, "start"),
    handleControlsDragMove: (payload: { screenX: number; screenY: number }) => handleControlsDrag(payload, "move"),
    handleControlsDragEnd: () => handleControlsDrag({ screenX: 0, screenY: 0 }, "end"),
    previewExpression,
    previewMotion,
    refreshMemoryDebug,
    updateMemorySummary,
    deleteMemorySummary,
    clearMemorySummaries,
    updateMemoryAtom,
    deleteMemoryAtom,
    toggleCoreMemory,
    deleteCoreMemory,
    clearCurrentRoleMemoryAtoms,
    exportMemoryAtom,
    exportMemory
  };
}
