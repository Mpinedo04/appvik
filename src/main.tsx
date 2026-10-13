import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerAllModels } from './components/models';
import { useProject } from './store/project';
import { useSim } from './store/sim';
import { useView } from './store/view';
import { sceneApi } from './view3d/sceneApi';
import './styles.css';

registerAllModels();

// Acceso a los stores desde la consola y los tests e2e (sólo en desarrollo).
if (import.meta.env.DEV) {
  Object.assign(window, { __fluid: { useProject, useSim, useView, sceneApi } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
