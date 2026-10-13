import { useEffect } from 'react';
import { useProject } from '../store/project';
import { useSim } from '../store/sim';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  flipSelection,
  paste,
  rotateSelection,
  saveFile,
  selectAll,
} from './actions';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sim = useSim.getState();
      const editing = sim.status === 'stopped';

      if (k === 'f9') {
        e.preventDefault();
        if (sim.status === 'running') sim.pause();
        else sim.start();
        return;
      }
      if (k === 'escape') {
        if (!editing) sim.stop();
        else useProject.getState().clearSelection();
        return;
      }
      if (ctrl && k === 's') {
        e.preventDefault();
        saveFile();
        return;
      }
      if (!editing) return;

      if (ctrl && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if (ctrl && k === 'y') {
        e.preventDefault();
        useProject.getState().redo();
      } else if (ctrl && k === 'c') copySelection();
      else if (ctrl && k === 'x') cutSelection();
      else if (ctrl && k === 'v') paste();
      else if (ctrl && k === 'a') {
        e.preventDefault();
        selectAll();
      } else if (!ctrl && k === 'r') rotateSelection();
      else if (!ctrl && k === 'f') flipSelection();
      else if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
