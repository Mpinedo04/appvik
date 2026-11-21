/**
 * Elementos de anotación gráfica para el esquema 2D (texto libre, notas y cajetín técnico).
 * No tienen puertos físicos ni afectan a la simulación.
 */
import type { Params } from '../../core/model/types';
import { num, str, type ComponentModel } from '../../core/registry';

function textMetrics(p: Params) {
  const raw = str(p, 'text') || 'Texto';
  const lines = raw.split(/\\n|\n/);
  const fs = Math.max(8, num(p, 'fontSize') || 14);
  const maxChars = Math.max(4, ...lines.map((l) => l.length));
  const w = Math.max(50, Math.round(maxChars * fs * 0.62) + 18);
  const h = Math.max(24, Math.round(lines.length * fs * 1.35) + 14);
  return { lines, fs, w, h };
}

export const textNoteModel: ComponentModel<object, null> = {
  type: 'util-text',
  category: 'annotations',
  name: 'Texto libre / Nota',
  description:
    'Etiqueta, título o nota explicativa sobre el esquema (usa \\n para saltar de línea). Haz doble clic para editar.',
  autoLabel: (n) => `T${n}`,
  hideLabel: true,
  params: [
    {
      key: 'text',
      label: 'Contenido del texto',
      type: 'text',
      default: 'Ejercicio 1',
      placeholder: 'Escribe aquí (usa \\n para varias líneas)',
    },
    {
      key: 'fontSize',
      label: 'Tamaño de letra',
      unit: 'px',
      type: 'number',
      default: 14,
      min: 8,
      max: 42,
      step: 1,
    },
    {
      key: 'color',
      label: 'Color del texto',
      type: 'select',
      default: '#0f172a',
      options: [
        { value: '#0f172a', label: 'Negro / Pizarra' },
        { value: '#2563eb', label: 'Azul técnico' },
        { value: '#dc2626', label: 'Rojo' },
        { value: '#15803d', label: 'Verde' },
        { value: '#7c3aed', label: 'Violeta' },
        { value: '#b45309', label: 'Ámbar' },
      ],
    },
    {
      key: 'bold',
      label: 'Negrita',
      type: 'boolean',
      default: true,
    },
    {
      key: 'border',
      label: 'Mostrar marco',
      type: 'boolean',
      default: false,
    },
  ],
  ports: () => [],
  bbox: (p) => {
    const { w, h } = textMetrics(p);
    return { x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2 };
  },
  initState: () => ({}),
  build: () => null,
  update() {},
  explain: () => ['Anotación de texto sobre el esquema.'],
};

export const titleBlockModel: ComponentModel<object, null> = {
  type: 'util-titleblock',
  category: 'annotations',
  name: 'Cajetín técnico',
  description:
    'Cuadro de rotulación ISO con título del esquema, autor, fecha y notas. Haz doble clic para rellenarlo.',
  autoLabel: () => 'CAJETÍN',
  sharedLabel: true,
  hideLabel: true,
  params: [
    {
      key: 'title',
      label: 'Título del circuito',
      type: 'text',
      default: 'Esquema neumático / hidráulico',
      placeholder: 'Ej. Mando indirecto cilindro 1A',
    },
    {
      key: 'author',
      label: 'Autor / Alumno',
      type: 'text',
      default: '',
      placeholder: 'Nombre y apellidos',
    },
    {
      key: 'date',
      label: 'Fecha',
      type: 'text',
      default: '',
      placeholder: 'DD/MM/AAAA',
    },
    {
      key: 'note',
      label: 'Hoja / Observaciones',
      type: 'text',
      default: 'Hoja 1/1 · ISO 1219',
      placeholder: 'Escala, norma o notas',
    },
    {
      key: 'width',
      label: 'Anchura del cajetín',
      unit: 'px',
      type: 'number',
      default: 260,
      min: 160,
      max: 520,
      step: 10,
    },
  ],
  ports: () => [],
  bbox: (p) => {
    const w = Math.max(160, num(p, 'width') || 260);
    return { x0: -w / 2, y0: -32, x1: w / 2, y1: 32 };
  },
  initState: () => ({}),
  build: () => null,
  update() {},
  explain: () => ['Cajetín de rotulación técnica del plano.'],
};

export const ANNOTATION_MODELS: ComponentModel[] = [textNoteModel, titleBlockModel];
