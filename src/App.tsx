import { useEffect } from 'react';
import { canvasApi } from './editor/canvasApi';
import { EXAMPLES } from './examples';
import { parseProject, useProject } from './store/project';
import { restoreAutosave, startAutosave } from './ui/actions';
import { Diagrams } from './ui/Diagrams';
import { Library } from './ui/Library';
import { Properties } from './ui/Properties';
import { Stage } from './ui/Stage';
import { StatusBar } from './ui/StatusBar';
import { Toolbar } from './ui/Toolbar';
import { useShortcuts } from './ui/useShortcuts';

export function App() {
  useShortcuts();
  useEffect(() => {
    // Recupera el último trabajo; si no hay, abre el primer ejemplo.
    if (!restoreAutosave() && EXAMPLES[0])
      useProject.getState().load(parseProject(EXAMPLES[0].json));
    const t = setTimeout(() => canvasApi.fit(), 60);
    const unsub = startAutosave();
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <Library />
        <Stage />
        <Properties />
      </main>
      <Diagrams />
      <StatusBar />
    </div>
  );
}
