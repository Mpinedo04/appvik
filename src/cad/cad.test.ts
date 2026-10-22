import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { cadPartModel, cadPlacement } from '../components/cad/model';
import { parsePath, parseTransform, apply, svgToEntities, toDxf, type SvgNode } from './dxf';
import { to3mf, toStl, type ExportPart } from './export3d';
import { importCad, type Occt } from './import';
import {
  decodeMesh,
  encodeMesh,
  extents,
  mergeByColor,
  triangleCount,
  weld,
  type CadMesh,
} from './mesh';

const require = createRequire(import.meta.url);
const TEST_FILES = 'node_modules/occt-import-js/test/testfiles';
const file = (p: string) => new Uint8Array(readFileSync(`${TEST_FILES}/${p}`));

let occt: Occt;
beforeAll(async () => {
  const factory = require('occt-import-js') as (o: object) => Promise<Occt>;
  const wasm = readFileSync(require.resolve('occt-import-js/dist/occt-import-js.wasm'));
  occt = await factory({
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  });
}, 60000);

const size = (m: CadMesh) => {
  const e = extents(m);
  return e.max.map((v, k) => v - e.min[k]);
};

describe('malla CAD', () => {
  const cube = (): CadMesh => {
    const w = weld(
      Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0]),
      null,
    );
    w.color = [1, 0, 0];
    return { groups: [w] };
  };

  it('une los vértices repetidos', () => {
    const g = cube().groups[0];
    expect(g.positions.length / 3).toBe(4);
    expect(g.indices.length).toBe(6);
  });

  it('codifica y decodifica con error de cuantización despreciable', async () => {
    const m = cube();
    const text = await encodeMesh(m);
    expect(text.startsWith('z:')).toBe(true);
    const back = await decodeMesh(text);
    expect(triangleCount(back)).toBe(2);
    expect(back.groups[0].color[0]).toBeCloseTo(1);
    for (let i = 0; i < m.groups[0].positions.length; i++)
      expect(Math.abs(back.groups[0].positions[i] - m.groups[0].positions[i])).toBeLessThan(1e-3);
  });

  it('junta los grupos del mismo color', () => {
    const a = cube().groups[0];
    const b = cube().groups[0];
    const merged = mergeByColor([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].indices.length).toBe(12);
    expect(Math.max(...merged[0].indices)).toBe(7);
  });
});

describe('importación', () => {
  it('lee el mismo cubo de 10 mm en STEP, IGES y STL', async () => {
    for (const ext of ['stp', 'igs', 'stl']) {
      const r = await importCad(`Cube 10x10.${ext}`, file(`cube-10x10mm/Cube 10x10.${ext}`), occt);
      expect(r.unit).toBe('mm');
      expect(r.triangles).toBeGreaterThanOrEqual(12);
      for (const s of size(r.mesh)) expect(s).toBeCloseTo(10, 1);
    }
  });

  it('STEP en metros, milímetros o pulgadas sale siempre en milímetros', async () => {
    // Es el mismo cubo de 1 m escrito con tres unidades distintas.
    for (const u of ['m', 'mm', 'in']) {
      const s = size((await importCad('a.step', file(`cube-units/cube-${u}.step`), occt)).mesh);
      expect(s[0]).toBeCloseTo(1000, 1);
    }
  });

  it('un conjunto STEP con colores conserva las piezas y los colores', async () => {
    const r = await importCad('as1.stp', file('cax-if/as1-oc-214/as1-oc-214.stp'), occt);
    expect(r.triangles).toBeGreaterThan(1000);
    expect(r.mesh.groups.length).toBeGreaterThan(1);
    const s = size(r.mesh);
    expect(Math.max(...s)).toBeGreaterThan(50);
  });

  it('rechaza los archivos nativos de SolidWorks con una explicación', async () => {
    await expect(importCad('pieza.SLDPRT', new Uint8Array(10))).rejects.toThrow(/STEP/);
  });
});

describe('exportación 3D', () => {
  const part: ExportPart = {
    name: '1A1',
    groups: [
      {
        color: [0.2, 0.4, 0.8],
        positions: Float32Array.from([0, 0, 0, 30, 0, 0, 0, 0, 20, 0, 15, 0]),
        indices: Uint32Array.from([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]),
      },
    ],
  };

  it('STL binario que se vuelve a leer igual', async () => {
    const stl = toStl([part]);
    expect(stl.length).toBe(84 + 4 * 50);
    const r = await importCad('x.stl', stl);
    expect(r.triangles).toBe(4);
    expect(size(r.mesh).map((v) => Math.round(v))).toEqual([30, 15, 20]);
  });

  it('3MF con un objeto por componente, en milímetros y con su color', () => {
    const zip = unzipSync(to3mf([part, { ...part, name: 'Tuberías' }]));
    expect(Object.keys(zip)).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
    const xml = strFromU8(zip['3D/3dmodel.model']);
    expect(xml).toContain('unit="millimeter"');
    expect(xml.match(/<object /g)).toHaveLength(2);
    expect(xml).toContain('name="Tuberías"');
    expect(xml).toContain('displaycolor="#3366CC"');
    expect(xml.match(/<triangle /g)).toHaveLength(8);
  });
});

describe('pieza CAD en la escena', () => {
  it('centra la pieza, la apoya en el tablero y respeta Z arriba', () => {
    const base = { ext: '0,0,0,100,20,50', unit: 'mm', scale: 100, elev: 0, yaw: 0 };
    const y = cadPlacement({ ...base, up: 'y' });
    expect(y.size).toEqual([100, 20, 50]);
    expect(y.offset).toEqual([-50, 0, -25]);
    const z = cadPlacement({ ...base, up: 'z', unit: 'cm' });
    // Z arriba: la altura es la Z del archivo (50 mm → 500 mm en cm).
    expect(z.size).toEqual([1000, 500, 200]);
    const bb = cadPartModel.bbox({ ...base, up: 'y', yaw: 90 });
    expect(Math.round(bb.x1 - bb.x0)).toBe(50);
    expect(Math.round(bb.y1 - bb.y0)).toBe(100);
  });
});

/* ───────────── DXF ───────────── */

/** Nodo SVG de prueba (el navegador da el suyo). */
const el = (
  tagName: string,
  attrs: Record<string, string>,
  children: SvgNode[] = [],
  text = '',
): SvgNode => ({
  tagName,
  getAttribute: (n) => attrs[n] ?? null,
  children,
  textContent: text,
});

describe('DXF', () => {
  it('transformaciones SVG', () => {
    const m = parseTransform('translate(10 5) rotate(90) scale(2)');
    const p = apply(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10);
    expect(p[1]).toBeCloseTo(7);
  });

  it('trazados con curvas, arcos y comandos relativos', () => {
    const subs = parsePath('M0 0 h10 v10 H0 z M20 0 a5 5 0 0 1 10 0 C30 10 40 10 40 0');
    expect(subs).toHaveLength(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].pts).toHaveLength(4);
    const arc = subs[1].pts;
    // El arco pasa por (25, −5) (semicírculo hacia arriba con sweep = 1 en Y hacia abajo).
    expect(Math.min(...arc.map((p) => p[1]))).toBeCloseTo(-5, 0);
    expect(arc[arc.length - 1]).toEqual([40, 0]);
  });

  it('convierte el SVG a entidades con Y hacia arriba y a 0,5 mm por unidad', () => {
    const svg = el('svg', {}, [
      el('g', { transform: 'translate(100 0)', stroke: '#1b2230', fill: 'none' }, [
        el('line', { x1: '0', y1: '0', x2: '20', y2: '0' }),
        el('rect', { x: '0', y: '0', width: '10', height: '10', 'stroke-dasharray': '4 2' }),
        el('circle', { cx: '0', cy: '20', r: '3', fill: '#1b2230', stroke: 'none' }),
        el('polygon', { points: '0,0 10,0 5,8', fill: '#1b2230' }),
        el(
          'text',
          { x: '0', y: '30', 'font-size': '10', 'text-anchor': 'middle', fill: '#000' },
          [],
          'Válvula 1V1',
        ),
      ]),
    ]);
    const ents = svgToEntities(svg);
    const line = ents.find((e) => e.kind === 'poly' && e.pts.length === 2)!;
    const pts = line.kind === 'poly' ? line.pts : [];
    expect(pts.map(([x, y]) => [x, Math.abs(y)])).toEqual([
      [50, 0],
      [60, 0],
    ]);
    expect(ents.some((e) => e.kind === 'poly' && e.closed && e.dashed)).toBe(true);
    expect(ents.some((e) => e.kind === 'disc' && Math.abs(e.r - 1.5) < 1e-9)).toBe(true);
    expect(ents.some((e) => e.kind === 'solid')).toBe(true);
    const t = ents.find((e) => e.kind === 'text')!;
    expect(t.kind === 'text' && t.align).toBe(1);
    const dxf = toDxf(ents);
    expect(dxf.match(/\r\nSECTION\r\n/g)).toHaveLength(3);
    expect(dxf.match(/\r\nENDSEC\r\n/g)).toHaveLength(3);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    expect(dxf).toContain('V%%225lvula 1V1');
    expect(dxf).toContain('DASHED');
  });
});
