/**
 * Dibujo estático de un circuito (sin interacción ni simulación): miniaturas de la galería y
 * exportación a PDF. Usa los mismos símbolos que el lienzo.
 */
import { getView } from '../components/views';
import { INK } from '../components/symbols';
import { connectionPolyline, svgTransform, worldBBox } from '../core/model/geometry';
import type { Circuit } from '../core/model/types';
import { getModel, resolveParams } from '../core/registry';

const FONT = 'Inter, system-ui, sans-serif';

/** Caja que contiene todo el circuito (con margen para las etiquetas). */
export function circuitBounds(c: Circuit) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const comp of Object.values(c.components)) {
    const b = worldBBox(comp);
    add(b.x0, b.y0 - 16);
    add(b.x1, b.y1);
  }
  for (const id of Object.keys(c.connections))
    for (const p of connectionPolyline(c, id)) add(p.x, p.y);
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 100, y1: 100 };
  return { x0: x0 - 10, y0: y0 - 10, x1: x1 + 10, y1: y1 + 10 };
}

export function CircuitDrawing({ circuit, labels = true }: { circuit: Circuit; labels?: boolean }) {
  return (
    <g fontFamily={FONT}>
      {Object.values(circuit.connections).map((conn) => (
        <polyline
          key={conn.id}
          points={connectionPolyline(circuit, conn.id)
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          fill="none"
          stroke={INK}
          strokeWidth={conn.medium === 'hyd' ? 2 : conn.medium === 'elec' ? 1.2 : 1.6}
          strokeLinejoin="round"
        />
      ))}
      {Object.values(circuit.junctions).map((j) => (
        <circle key={j.id} cx={j.x} cy={j.y} r={3} fill={INK} />
      ))}
      {Object.values(circuit.components).map((c) => {
        const m = getModel(c.type);
        const View = getView(c.type).Symbol2D;
        const params = resolveParams(m, c.params);
        const wb = worldBBox(c);
        return (
          <g key={c.id}>
            <g transform={svgTransform(c)}>
              <View params={params} />
            </g>
            {labels && !m.hideLabel && (
              <text x={wb.x0 - 4} y={wb.y0 - 6} fontSize={10} fontWeight={600} fill="#334155">
                {c.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
