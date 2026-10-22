/**
 * Pieza CAD importada (STEP, IGES, STL, OBJ, 3MF…): sólo se ve en la vista 3D, no interviene
 * en la simulación. Puede unirse a un actuador (cilindro, carro, giratorio, motor) para moverse
 * con él: una pinza en el vástago, una puerta en un carro, un brazo en un giratorio…
 * La malla va dentro del proyecto (parámetro `mesh`, ver src/cad/mesh.ts).
 */
import { UNIT_MM, type CadUnit } from '../../cad/import';
import type { Params } from '../../core/model/types';
import type { BBox, ComponentModel } from '../../core/registry';

const hidden = () => false;

export const CAD_TYPE = 'cad-part';

export interface CadPlacement {
  /** Escala de las unidades del archivo a unidades de dibujo (1 = 1 mm). */
  k: number;
  /** Giro sobre X para poner el eje vertical del archivo hacia arriba. */
  rotX: number;
  /** Traslación (tras escalar y girar) que centra la pieza y la apoya en el tablero. */
  offset: [number, number, number];
  /** Tamaño en unidades de dibujo (ancho X, alto Y, fondo Z). */
  size: [number, number, number];
  yaw: number;
}

export function parseExtents(s: string): [number, number, number, number, number, number] {
  const v = s.split(',').map(Number);
  return v.length === 6 && v.every(Number.isFinite)
    ? (v as [number, number, number, number, number, number])
    : [-20, 0, -20, 20, 40, 20];
}

export function cadPlacement(p: Params): CadPlacement {
  const [x0, y0, z0, x1, y1, z1] = parseExtents(String(p.ext ?? ''));
  const k = (UNIT_MM[(p.unit as CadUnit) ?? 'mm'] ?? 1) * (Number(p.scale ?? 100) / 100);
  // Z arriba: (x, y, z) → (x, z, −y), un giro de −90° sobre X.
  const zUp = p.up === 'z';
  const ex = [x0 * k, x1 * k];
  const ey = zUp ? [z0 * k, z1 * k] : [y0 * k, y1 * k];
  const ez = zUp ? [-y1 * k, -y0 * k] : [z0 * k, z1 * k];
  return {
    k,
    rotX: zUp ? -Math.PI / 2 : 0,
    offset: [-(ex[0] + ex[1]) / 2, Number(p.elev ?? 0) - ey[0], -(ez[0] + ez[1]) / 2],
    size: [ex[1] - ex[0], ey[1] - ey[0], ez[1] - ez[0]],
    yaw: (Number(p.yaw ?? 0) * Math.PI) / 180,
  };
}

function footprint(p: Params): BBox {
  const { size, yaw } = cadPlacement(p);
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const w = Math.max(20, size[0] * c + size[2] * s);
  const d = Math.max(20, size[0] * s + size[2] * c);
  return { x0: -w / 2, y0: -d / 2, x1: w / 2, y1: d / 2 };
}

export const cadPartModel: ComponentModel = {
  type: CAD_TYPE,
  category: 'cad',
  name: 'Pieza CAD importada',
  description:
    'Pieza o conjunto importado de SolidWorks u otro CAD. Se ve en la vista 3D y puede unirse a un actuador para moverse con él.',
  autoLabel: (n) => `CAD${n}`,
  params: [
    { key: 'file', label: 'Archivo', type: 'text', default: '', when: hidden },
    { key: 'mesh', label: 'Malla', type: 'text', default: '', when: hidden },
    { key: 'ext', label: 'Extensión', type: 'text', default: '', when: hidden },
    { key: 'tris', label: 'Triángulos', type: 'number', default: 0, when: hidden },
    {
      key: 'unit',
      label: 'Unidades del archivo',
      type: 'select',
      default: 'mm',
      options: [
        { value: 'mm', label: 'milímetros' },
        { value: 'cm', label: 'centímetros' },
        { value: 'm', label: 'metros' },
        { value: 'in', label: 'pulgadas' },
      ],
      help: 'STEP, IGES y 3MF ya traen su unidad. En STL y OBJ se estima por el tamaño: corrígela si la pieza sale enorme o diminuta.',
    },
    {
      key: 'scale',
      label: 'Escala',
      unit: '%',
      type: 'number',
      default: 100,
      min: 1,
      max: 10000,
      step: 10,
    },
    {
      key: 'up',
      label: 'Eje vertical del archivo',
      type: 'select',
      default: 'y',
      options: [
        { value: 'y', label: 'Y arriba (SolidWorks, Inventor)' },
        { value: 'z', label: 'Z arriba (Fusion 360, FreeCAD, impresión 3D)' },
      ],
    },
    {
      key: 'yaw',
      label: 'Giro sobre la vertical',
      unit: '°',
      type: 'number',
      default: 0,
      step: 15,
    },
    {
      key: 'elev',
      label: 'Altura sobre el tablero',
      unit: 'mm',
      type: 'number',
      default: 0,
      step: 1,
      help: 'Los ejes de cilindros y válvulas están a 14 mm del tablero.',
    },
    {
      key: 'follow',
      label: 'Unida al actuador',
      type: 'text',
      default: '',
      placeholder: 'p. ej. 1A1 (vacío: fija)',
      help: 'Etiqueta de un cilindro, carro, actuador giratorio o motor: la pieza se mueve con su vástago, carro o eje.',
    },
    {
      key: 'opacity',
      label: 'Opacidad',
      unit: '%',
      type: 'number',
      default: 100,
      min: 10,
      max: 100,
      step: 10,
    },
  ],
  ports: () => [],
  bbox: footprint,
  initState: () => ({}),
  build: () => ({}),
  update: () => {},
  explain: (_s, p) => [
    `Pieza importada${p.file ? ` «${p.file}»` : ''}. No interviene en la simulación.`,
    p.follow
      ? `Se mueve con el actuador ${p.follow}.`
      : 'Está fija. Para que se mueva con un cilindro, escribe su etiqueta en «Unida al actuador».',
  ],
  info: (p) => {
    const { size } = cadPlacement(p);
    return [
      p.file ? `Archivo: ${p.file}` : 'Sin archivo.',
      `${Number(p.tris ?? 0).toLocaleString('es-ES')} triángulos · ${size.map((v) => Math.round(v)).join(' × ')} mm (ancho × alto × fondo)`,
    ];
  },
};
