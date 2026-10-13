import type { Vec2 } from '../core/model/types';

export const LIBRARY_MIME = 'application/x-fluidlab-type';

/** API mínima para que otros paneles (biblioteca, barra de herramientas) actúen sobre el lienzo. */
export const canvasApi = {
  centerWorld: (): Vec2 => ({ x: 300, y: 200 }),
  fit: () => {},
  svg: (): SVGSVGElement | null => null,
};
