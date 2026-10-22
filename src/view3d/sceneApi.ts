import type * as THREE from 'three';

/** Acciones sobre la escena 3D accesibles desde la interfaz (encuadrar, enfocar, exportar). */
export const sceneApi: {
  fitAll(smooth?: boolean): void;
  focus(compId: string): void;
  /** Grupo raíz del circuito (en unidades de dibujo) o null si la vista 3D no está abierta. */
  root(): THREE.Object3D | null;
} = {
  fitAll: () => {},
  focus: () => {},
  root: () => null,
};
