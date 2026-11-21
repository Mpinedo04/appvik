/**
 * Importador de circuitos neumáticos de FluidSIM-P 4.x (archivos `.ct`).
 *
 * Formato binario `.ct` de FluidSIM 4.2:
 *  - Cabecera de texto ofuscada terminada en `COMPRESS\r\n` (bytes `0xCE 0xCE 0x0D 0x0A`).
 *  - Flujo comprimido XOReado byte a byte con `0x9A`:
 *      * 16 bytes de parámetros (ventana 2048, posición inicial 14 con `PREVIEW` en [7..13]).
 *      * Tokens de compresión LZ77 + RLE con búfer circular de 2047 bytes:
 *          - `b >= 0x80`         : literal de `b - 0x80` bytes (avanza búfer circular).
 *          - `(b & 0xF8) == 0x00`: RLE de `((b & 7) << 8) | next` copias del siguiente byte
 *                                  (solo escribe al búfer circular si `cnt <= 16 && w + cnt < 2047`).
 *          - `(b & 0xF8) == 0x08`: copia larga desde `((b & 7) << 8) | b1` de longitud `b2`
 *                                  (reinicia `w = 0` si `w + cnt >= 2047`).
 *          - `0x10..0x7F`        : copia corta desde `((b & 7) << 8) | b1` de longitud `(b >> 3) + 1`
 *                                  (reinicia `w = 0` si `w + cnt >= 2047`).
 *  - Tras `ENDCOPREVIEW\n` (o `ENDPREVIEW\n`) comienza la descripción textual del circuito hasta `ENDCT`.
 */
import type { ActuatorType } from '../components/pneumatic/actuation';
import { addComponent, connect } from '../core/model/edit';
import { autoRoute, endpointGeom, simplify, snap } from '../core/model/geometry';
import {
  emptyCircuit,
  newId,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  type Circuit,
  type Dir,
  type Endpoint,
  type Params,
  type Project,
  type Rotation,
  type Vec2,
} from '../core/model/types';

const RING_SIZE = 2047;
const XOR_KEY = 0x9a;
const COORD_UNIT = 1024;
/** Escala de unidades FluidSIM → unidades de lienzo FluidLab 3D. */
const CANVAS_SCALE = 1.8;

export interface FluidSimImportResult {
  project: Project;
  warnings: string[];
  stats: {
    components: number;
    connections: number;
    junctions: number;
  };
}

/** Descomprime un archivo `.ct` binario de FluidSIM 4.x y devuelve la sección textual del circuito. */
export function decompressFluidSimCt(bytes: Uint8Array): string {
  // Buscar marcador `COMPRESS\r\n` (ofuscado: 0xCE 0xCE 0x0D 0x0A)
  let compressEnd = -1;
  for (let i = 0; i <= bytes.length - 4; i++) {
    if (
      bytes[i] === 0xce &&
      bytes[i + 1] === 0xce &&
      bytes[i + 2] === 0x0d &&
      bytes[i + 3] === 0x0a
    ) {
      compressEnd = i + 4;
      break;
    }
  }

  let decoded: string;
  if (compressEnd === -1) {
    // Fallback: por si el archivo ya es texto plano (.ct sin comprimir)
    decoded = new TextDecoder('latin1').decode(bytes);
    if (!decoded.includes('ENDCT') && !decoded.includes('CON PLine')) {
      throw new Error('El archivo .ct no tiene el formato reconocido de FluidSIM 4.x.');
    }
  } else {
    const rawLen = bytes.length - compressEnd;
    if (rawLen < 18) throw new Error('Archivo .ct de FluidSIM truncado o dañado.');

    const raw = new Uint8Array(rawLen);
    for (let i = 0; i < rawLen; i++) raw[i] = bytes[compressEnd + i] ^ XOR_KEY;

    const ring = new Uint8Array(2048);
    // El búfer circular se inicializa en la posición 14 con "PREVIEW" en [7..13]
    const seed = 'PREVIEW';
    for (let k = 0; k < seed.length; k++) ring[7 + k] = seed.charCodeAt(k);
    let w = 14;

    const out: number[] = [];
    let i = 16;
    while (i < rawLen) {
      const b = raw[i];
      if (b >= 0x80) {
        const cnt = b - 0x80;
        i += 1;
        const end = Math.min(rawLen, i + cnt);
        for (; i < end; i++) {
          const c = raw[i];
          out.push(c);
          ring[w] = c;
          w = (w + 1) % RING_SIZE;
        }
      } else if ((b & 0xf8) === 0x00) {
        if (i + 2 >= rawLen) break;
        const cnt = ((b & 7) << 8) | raw[i + 1];
        const c = raw[i + 2];
        i += 3;
        for (let k = 0; k < cnt; k++) out.push(c);
        if (cnt <= 16 && w + cnt < RING_SIZE) {
          for (let k = 0; k < cnt; k++) {
            ring[w] = c;
            w = (w + 1) % RING_SIZE;
          }
        }
      } else if ((b & 0xf8) === 0x08) {
        if (i + 2 >= rawLen) break;
        const rpos = ((b & 7) << 8) | raw[i + 1];
        const cnt = raw[i + 2];
        i += 3;
        const got = new Uint8Array(cnt);
        for (let k = 0; k < cnt; k++) got[k] = ring[(rpos + k) % RING_SIZE];
        if (w + cnt >= RING_SIZE) w = 0;
        for (let k = 0; k < cnt; k++) {
          const c = got[k];
          out.push(c);
          ring[w] = c;
          w = (w + 1) % RING_SIZE;
        }
      } else {
        if (i + 1 >= rawLen) break;
        const cnt = (b >> 3) + 1;
        const rpos = ((b & 7) << 8) | raw[i + 1];
        i += 2;
        const got = new Uint8Array(cnt);
        for (let k = 0; k < cnt; k++) got[k] = ring[(rpos + k) % RING_SIZE];
        if (w + cnt >= RING_SIZE) w = 0;
        for (let k = 0; k < cnt; k++) {
          const c = got[k];
          out.push(c);
          ring[w] = c;
          w = (w + 1) % RING_SIZE;
        }
      }
    }
    decoded = new TextDecoder('latin1').decode(new Uint8Array(out));
  }

  for (const marker of ['ENDCOPREVIEW\n', 'ENDPREVIEW\n']) {
    const idx = decoded.indexOf(marker);
    if (idx !== -1) return decoded.slice(idx + marker.length);
  }
  return decoded;
}

/* ───────────── Parser de la sección textual del circuito ───────────── */

interface FsObject {
  idx: number;
  type: string;
  oid: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  rot: number;
  props: Record<string, string>;
}

interface FsGate {
  gateNum: number;
  portIdx: number;
}

interface FsPLine {
  a: number;
  b: number;
  style: number;
}

function parseFluidSimText(text: string) {
  const lines = text.split(/\r?\n/);
  const objs: FsObject[] = [];
  const gates = new Map<number, FsGate[]>();
  const portOwner = new Map<number, { compIdx: number; gateNum: number }>();
  const plines: FsPLine[] = [];

  let cur: FsObject | null = null;
  let inConn = false;
  let curLine: FsPLine | null = null;

  for (const line of lines) {
    if (line.startsWith('0 0 0 #')) {
      if (cur) {
        objs.push(cur);
        cur = null;
      }
      inConn = true;
      continue;
    }
    if (line.startsWith('ENDCT')) {
      if (curLine) {
        plines.push(curLine);
        curLine = null;
      }
      break;
    }
    if (!inConn) {
      const hm = /^([A-Za-z_][A-Za-z0-9_]*)\s+(O\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/.exec(
        line,
      );
      if (hm) {
        if (cur) objs.push(cur);
        cur = {
          idx: objs.length,
          type: hm[1],
          oid: hm[2],
          x1: Number(hm[3]) / COORD_UNIT,
          y1: Number(hm[4]) / COORD_UNIT,
          x2: Number(hm[5]) / COORD_UNIT,
          y2: Number(hm[6]) / COORD_UNIT,
          rot: Number(hm[7]),
          props: {},
        };
      } else if (cur) {
        const sm = /^\s+S\s+(\S+)\s+\S+\s*(.*)$/.exec(line);
        if (sm) cur.props[sm[1]] = sm[2].trim();
      }
    } else {
      const gm = /^gate(\d+)\s+#\s+(\d+)\s+(\d+)$/.exec(line);
      if (gm) {
        if (curLine) {
          plines.push(curLine);
          curLine = null;
        }
        const gateNum = Number(gm[1]);
        const compIdx = Number(gm[2]);
        const portIdx = Number(gm[3]);
        const list = gates.get(compIdx) ?? [];
        list.push({ gateNum, portIdx });
        gates.set(compIdx, list);
        portOwner.set(portIdx, { compIdx, gateNum });
        continue;
      }
      const pm = /^CON PLine\s+(\d+)\s+(\d+)$/.exec(line);
      if (pm) {
        if (curLine) plines.push(curLine);
        curLine = { a: Number(pm[1]), b: Number(pm[2]), style: 2 };
        continue;
      }
      const st = /^\s+S\s+Style\s+I\s+(\d+)$/.exec(line);
      if (st && curLine) curLine.style = Number(st[1]);
    }
  }
  if (cur) objs.push(cur);
  if (curLine) plines.push(curLine);
  return { objs, gates, portOwner, plines };
}

/* ───────────── Mapeo de accionamientos y tipos FluidSIM → FluidLab 3D ───────────── */

function mapActuation(
  props: Record<string, string>,
  side: 'L' | 'R',
  is3Pos = false,
): { act: ActuatorType; rollerDir?: '+' | '-' } {
  const ma = props[`ACTUATION_${side}_MA`] ?? '';
  const me = props[`ACTUATION_${side}_ME`] ?? '';
  const ep = props[`ACTUATION_${side}_EL_PN`] ?? '';

  if (ep.includes('_PE')) return { act: 'pilot' };
  if (ep.includes('_EL')) return { act: 'solenoid' };
  if (me.includes('_ME3B')) return { act: 'roller-oneway', rollerDir: '-' };
  if (me.includes('_ME3')) return { act: 'roller-oneway', rollerDir: '+' };
  if (me.includes('_ME')) return { act: 'roller' };
  if (ma.includes('_MA5')) return { act: 'pedal' };
  if (ma.endsWith('F')) return { act: 'lever' };
  if (ma.includes('_MA')) return { act: 'pushbutton' };

  const springKey = side === 'L' ? 'SPRING_L' : 'SPRING_R';
  if (!is3Pos && props[springKey] === 'TRUE') return { act: 'spring' };
  return { act: 'none' };
}

function activeConnectionLabel(
  objs: FsObject[],
  gateList: FsGate[],
  kind: 'UMConnection' | 'UEConnection',
): string[] {
  const labels: string[] = [];
  for (const g of gateList) {
    const po = objs[g.portIdx];
    if (!po || po.type !== kind) continue;
    // state === '4' en FluidSIM indica ranura de accionamiento inactiva/oculta
    if (po.props.state === '4') continue;
    const lbl = po.props.label?.trim();
    if (lbl) labels.push(lbl);
  }
  return labels;
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRot(deg: number): Rotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return (r === 90 || r === 180 || r === 270 ? r : 0) as Rotation;
}

function isShortComponentLabel(txt: string): boolean {
  const s = txt.trim();
  if (!s || s.length > 8 || /\s/.test(s)) return false;
  return /^[0-9]?[A-Za-z][0-9A-Za-z._-]*$/.test(s);
}

/** Traduce el código `ex_type` de un puerto de escape FluidSIM a terminación FluidLab. */
function mapExhaustType(ex: string | undefined): string | null {
  switch (ex) {
    case 'EX4':
      return 'silencer';
    case 'EX2':
    case 'EX3':
      return 'exhaust';
    case 'EX1':
      return 'plug';
    default:
      return null;
  }
}

/** Extrae las terminaciones de escape (`ex_3`, `ex_5`) de los `PConnection` de una válvula. */
function collectExhaustParams(
  objs: FsObject[],
  gateList: FsGate[],
  portMap: Record<number, string>,
  params: Params,
) {
  for (const g of gateList) {
    const po = objs[g.portIdx];
    if (!po || po.type !== 'PConnection') continue;
    const flPort = portMap[g.gateNum];
    if (flPort !== '3' && flPort !== '5') continue;
    const mapped = mapExhaustType(po.props.ex_type);
    if (mapped) params[`ex_${flPort}`] = mapped;
  }
}

/**
 * Trazado ortogonal limpio al estilo FluidSIM (codos en L directos sobre los buses de derivación
 * y entre puertos perpendiculares), evitando las líneas horizontales a media altura de `autoRoute`.
 */
function fluidSimRoute(a: Vec2, aDir: Dir | null, b: Vec2, bDir: Dir | null): Vec2[] {
  const isVert = (d: Dir | null) => d === 'up' || d === 'down';
  const isHoriz = (d: Dir | null) => d === 'left' || d === 'right';
  const faces = (p: Vec2, dir: Dir, target: Vec2) =>
    (dir === 'up' && target.y <= p.y) ||
    (dir === 'down' && target.y >= p.y) ||
    (dir === 'left' && target.x <= p.x) ||
    (dir === 'right' && target.x >= p.x);

  // Caso 1: Derivación en T ↔ Puerto (trazado en L por la línea del bus de la derivación).
  if (!aDir && bDir) return fluidSimRoute(b, bDir, a, null).reverse();
  if (aDir && !bDir) {
    if (isVert(aDir) && faces(a, aDir, b)) {
      return simplify([a, { x: a.x, y: b.y }, b]).slice(1, -1);
    }
    if (isHoriz(aDir) && faces(a, aDir, b)) {
      return simplify([a, { x: b.x, y: a.y }, b]).slice(1, -1);
    }
    return autoRoute(a, aDir, b, null);
  }

  // Caso 2: Derivación ↔ Derivación.
  if (!aDir && !bDir) {
    if (a.x === b.x || a.y === b.y) return [];
    return simplify([a, { x: b.x, y: a.y }, b]).slice(1, -1);
  }

  // Caso 3: Puertos perpendiculares (uno vertical y otro horizontal) → codo único en L si encaran.
  if (isVert(aDir) && isHoriz(bDir)) {
    const corner = { x: a.x, y: b.y };
    if (faces(a, aDir!, corner) && faces(b, bDir!, corner)) {
      return simplify([a, corner, b]).slice(1, -1);
    }
  }
  if (isHoriz(aDir) && isVert(bDir)) {
    const corner = { x: b.x, y: a.y };
    if (faces(a, aDir!, corner) && faces(b, bDir!, corner)) {
      return simplify([a, corner, b]).slice(1, -1);
    }
  }

  // Caso 4: Puertos paralelos alineados y enfrentados → tramo recto.
  if (isVert(aDir) && isVert(bDir) && a.x === b.x && faces(a, aDir!, b) && faces(b, bDir!, a)) {
    return [];
  }
  if (isHoriz(aDir) && isHoriz(bDir) && a.y === b.y && faces(a, aDir!, b) && faces(b, bDir!, a)) {
    return [];
  }

  return autoRoute(a, aDir, b, bDir);
}

/** Traduce un archivo `.ct` de FluidSIM-P 4.x en un proyecto válido de FluidLab 3D. */
export function importFluidSimCt(
  bytes: Uint8Array,
  fileName = 'Circuito FluidSIM',
): FluidSimImportResult {
  const text = decompressFluidSimCt(bytes);
  const { objs, gates, portOwner, plines } = parseFluidSimText(text);

  const warnings: string[] = [];
  const circuit: Circuit = emptyCircuit();

  const SKIP_TYPES = new Set([
    'PConnection',
    'UEConnection',
    'UMConnection',
    'PTriconnection',
    'R_SCHALT',
    'text',
  ]);

  // 1. Asociar etiquetas de texto cortas (1A, 1V1, 1S1…) a su componente más cercano
  //    (emparejamiento voraz por distancia a la esquina superior izquierda del componente).
  const compObjs = objs.filter((o) => !SKIP_TYPES.has(o.type));
  const textObjs = objs.filter(
    (o) => o.type === 'text' && isShortComponentLabel(o.props.text ?? ''),
  );
  const labelForComp = new Map<number, string>();
  const pairs: { compIdx: number; textIdx: number; label: string; dist: number }[] = [];
  for (const t of textObjs) {
    const tx = (t.x1 + t.x2) / 2;
    const ty = (t.y1 + t.y2) / 2;
    const lbl = t.props.text.trim();
    for (const c of compObjs) {
      // En FluidSIM las etiquetas se colocan habitualmente a la izquierda / arriba-izquierda
      const ax = c.x1 + (c.x2 - c.x1) * 0.2;
      const ay = c.y1 + (c.y2 - c.y1) * 0.35;
      const dist = Math.hypot(tx - ax, ty - ay);
      if (dist < 110) pairs.push({ compIdx: c.idx, textIdx: t.idx, label: lbl, dist });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);
  const usedTexts = new Set<number>();
  for (const p of pairs) {
    if (usedTexts.has(p.textIdx) || labelForComp.has(p.compIdx)) continue;
    usedTexts.add(p.textIdx);
    labelForComp.set(p.compIdx, p.label);
  }

  // 2. Asociar reglas de distancia (R_SCHALT) al cilindro más cercano debajo de ellas
  const marksForCyl = new Map<number, string>();
  const cylObjs = compObjs.filter((o) => o.type.startsWith('Cyl'));
  for (const r of objs) {
    if (r.type !== 'R_SCHALT') continue;
    const rx = (r.x1 + r.x2) / 2;
    const ry = (r.y1 + r.y2) / 2;
    const marks: string[] = [];
    for (let k = 0; k < 10; k++) {
      const lbl = r.props[`label${k}`];
      const pos = r.props[`pos${k}`];
      if (!lbl || pos === undefined) continue;
      // Si pos_l_k == 0 y pos_r_k <= 2, redondear a 0 para coincidir limpiamente con el inicio
      const posL = Number(r.props[`pos_l_${k}`]);
      const posR = Number(r.props[`pos_r_${k}`]);
      const mmPos =
        Number.isFinite(posL) && Number.isFinite(posR) && posL === 0 && posR <= 2
          ? 0
          : Math.round(Number(pos) * 10) / 10;
      marks.push(`${lbl}@${mmPos}`);
    }
    if (!marks.length) continue;
    let bestCyl: FsObject | null = null;
    let bestD = Infinity;
    for (const c of cylObjs) {
      const cx = (c.x1 + c.x2) / 2;
      const cy = (c.y1 + c.y2) / 2;
      const d = Math.hypot(rx - cx, ry - cy);
      if (d < bestD && d < 120) {
        bestD = d;
        bestCyl = c;
      }
    }
    if (bestCyl) {
      const prev = marksForCyl.get(bestCyl.idx);
      marksForCyl.set(bestCyl.idx, prev ? `${prev}; ${marks.join('; ')}` : marks.join('; '));
    }
  }

  // Calcular origen mínimo para centrar el circuito en coordenadas limpias (>= 80, 80)
  const allPlaced = objs.filter((o) => !SKIP_TYPES.has(o.type) || o.type === 'PTriconnection');
  const minX = allPlaced.length ? Math.min(...allPlaced.map((o) => o.x1)) : 0;
  const minY = allPlaced.length ? Math.min(...allPlaced.map((o) => o.y1)) : 0;
  const toCanvas = (x: number, y: number) => ({
    x: snap(80 + (x - minX) * CANVAS_SCALE),
    y: snap(80 + (y - minY) * CANVAS_SCALE),
  });

  // Mapa: índice de objeto FluidSIM → { id en FluidLab, tabla gateNum → portId }
  const compMap = new Map<number, { id: string; portMap: Record<number, string> }>();
  const junctionMap = new Map<number, string>();

  // 3. Crear derivaciones en T (PTriconnection)
  for (const o of objs) {
    if (o.type !== 'PTriconnection') continue;
    const pt = toCanvas((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2);
    const jid = newId('j');
    circuit.junctions[jid] = { id: jid, x: pt.x, y: pt.y, medium: 'pneu' };
    junctionMap.set(o.idx, jid);
  }

  // 4. Crear componentes neumáticos equivalentes
  for (const o of compObjs) {
    const pos = toCanvas((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2);
    const gateList = gates.get(o.idx) ?? [];
    const pneuGates = gateList.filter((g) => objs[g.portIdx]?.type === 'PConnection');
    const lbl = labelForComp.get(o.idx);

    let flType: string | null = null;
    let rot: Rotation = 0;
    const params: Params = {};
    let portMap: Record<number, string> = {};

    switch (o.type) {
      case 'PPE1': {
        flType = 'pneu-supply';
        params.pressure = clampNum(o.props.P_LIM, 6, 0, 12);
        params.qn = clampNum(o.props.FLOW, 1000, 10, 10000);
        // En FluidSIM rot=270 apunta a la derecha; en FluidLab pneu-supply apunta arriba a rot=0 → rot=90 apunta derecha
        rot = o.rot === 270 ? 90 : normalizeRot(o.rot);
        portMap = { 1: '1' };
        break;
      }
      case 'PPE2': {
        flType = 'pneu-frl';
        params.pset = clampNum(o.props.P_SOLL, 6, 0, 12);
        params.qn = clampNum(o.props.NN_FLOW, 750, 10, 10000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '1', 2: '2' };
        break;
      }
      case 'CylDGPPAB': {
        const isSingle =
          (o.props.description ?? '').toLowerCase().includes('single') || pneuGates.length === 1;
        flType = isSingle ? 'pneu-cyl-single' : 'pneu-cyl-double';
        const stroke = clampNum(o.props.HUB, 100, 5, 2000);
        params.stroke = stroke;
        const ak = Number(o.props.A_K);
        if (Number.isFinite(ak) && ak > 0.1) {
          params.bore = clampNum(Math.round(2 * Math.sqrt(ak / Math.PI) * 10), 25, 6, 200);
        }
        const mass = Number(o.props.MASS);
        if (Number.isFinite(mass) && mass > 0.05) {
          params.mass = clampNum(mass, 1, 0.05, 500);
        }
        const load = Number(o.props.F);
        if (Number.isFinite(load) && load !== 0) {
          params.load = clampNum(load, 0, -5000, 5000);
        }
        const sReset = Number(o.props.S_RESET);
        if (Number.isFinite(sReset) && sReset > 0 && stroke > 0) {
          params.startPos = clampNum(Math.round((sReset / stroke) * 100), 0, 0, 100);
        }
        const marks = marksForCyl.get(o.idx);
        if (marks) params.marks = marks;
        rot = normalizeRot(o.rot);
        portMap = isSingle ? { 1: '1' } : { 1: '1', 2: '2' };
        break;
      }
      case 'WV_3': {
        const isNo = (o.props.POS_RESET ?? '').includes('C3P');
        const left = mapActuation(o.props, 'L');
        const right = mapActuation(o.props, 'R');
        const rollers = activeConnectionLabel(objs, gateList, 'UMConnection');
        const sols = activeConnectionLabel(objs, gateList, 'UEConnection');

        if (!isNo && (left.act === 'roller' || left.act === 'roller-oneway') && right.act === 'spring') {
          flType = 'pneu-limit-32';
        } else if (!isNo && left.act === 'solenoid' && right.act === 'spring') {
          flType = 'pneu-valve-32-sol';
        } else {
          flType = isNo ? 'pneu-valve-32no' : 'pneu-valve-32nc';
        }
        params.actLeft = left.act;
        params.actRight = right.act;
        if (left.rollerDir) params.rollerDir = left.rollerDir;
        else if (right.rollerDir) params.rollerDir = right.rollerDir;
        if (rollers.length) params.sensor = rollers[0];
        else if (left.act === 'roller' || left.act === 'roller-oneway') {
          // Si en FluidSIM el rodillo no tenía marca mecánica, conservar el tipo rodillo con sensor vacío
          params.sensor = '';
        }
        if (sols[0]) params.solLeft = sols[0];
        if (sols[1]) params.solRight = sols[1];
        params.qn = clampNum(o.props.NN_FLOW, 120, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = isNo
          ? { 1: '2', 2: '1', 3: '3', 4: '10', 5: '12' }
          : { 1: '2', 2: '1', 3: '3', 4: '12', 5: '10' };
        collectExhaustParams(objs, gateList, portMap, params);
        break;
      }
      case 'WV_5': {
        const bodyCount = Number(o.props.BODY_COUNT ?? 2);
        const is3Pos = bodyCount === 3;
        const left = mapActuation(o.props, 'L', is3Pos);
        const right = mapActuation(o.props, 'R', is3Pos);
        const sols = activeConnectionLabel(objs, gateList, 'UEConnection');
        const rollers = activeConnectionLabel(objs, gateList, 'UMConnection');

        if (is3Pos) {
          const pr = o.props.POS_RESET ?? '';
          if (pr.includes('C5E') || pr.includes('C5A')) flType = 'pneu-valve-53-exhaust';
          else if (pr.includes('C5P')) flType = 'pneu-valve-53-pressure';
          else flType = 'pneu-valve-53-closed';
          params.springs = o.props.SPRING_L === 'TRUE' || o.props.SPRING_R === 'TRUE';
        } else if (left.act === 'pilot' && right.act === 'pilot') {
          flType = 'pneu-valve-52-memory';
        } else if (left.act === 'pilot' && right.act === 'spring') {
          flType = 'pneu-valve-52-pilot';
        } else if (left.act === 'solenoid' && right.act === 'solenoid') {
          flType = 'pneu-valve-52-sol2';
        } else if (left.act === 'solenoid' && right.act === 'spring') {
          flType = 'pneu-valve-52-sol';
        } else {
          flType = 'pneu-valve-52';
        }
        params.actLeft = left.act;
        params.actRight = right.act;
        if (sols[0]) params.solLeft = sols[0];
        if (sols[1]) params.solRight = sols[1];
        if (rollers.length) params.sensor = rollers[0];
        params.qn = clampNum(o.props.NN_FLOW, 500, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '4', 2: '2', 3: '5', 4: '1', 5: '3', 6: '14', 7: '12' };
        collectExhaustParams(objs, gateList, portMap, params);
        break;
      }
      case 'WV_4': {
        const left = mapActuation(o.props, 'L');
        const right = mapActuation(o.props, 'R');
        flType = 'pneu-valve-42';
        params.actLeft = left.act;
        params.actRight = right.act;
        params.qn = clampNum(o.props.NN_FLOW, 300, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '4', 2: '2', 3: '1', 4: '3', 5: '14', 6: '12' };
        collectExhaustParams(objs, gateList, portMap, params);
        break;
      }
      case 'WV_2': {
        const left = mapActuation(o.props, 'L');
        const right = mapActuation(o.props, 'R');
        flType = 'pneu-valve-22nc';
        params.actLeft = left.act;
        params.actRight = right.act;
        params.qn = clampNum(o.props.NN_FLOW, 300, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '2', 2: '1', 3: '12', 4: '10' };
        break;
      }
      case 'PVS1': {
        flType = 'pneu-shuttle-or';
        params.qn = clampNum(o.props.NN_FLOW, 500, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '1a', 2: '1b', 3: '2' };
        break;
      }
      case 'PVS3': {
        flType = 'pneu-shuttle-and';
        params.qn = clampNum(o.props.NN_FLOW, 550, 10, 5000);
        rot = normalizeRot(o.rot);
        portMap = { 1: '1a', 2: '1b', 3: '2' };
        break;
      }
      case 'PVS2': {
        flType = 'pneu-quick-exhaust';
        params.qn = clampNum(o.props.NN_FLOW, 500, 10, 5000);
        // En FluidLab pneu-quick-exhaust ya tiene 1 abajo y 2 arriba en rot=0
        rot = 0;
        portMap = { 1: '1', 2: '2' };
        break;
      }
      case 'PVS4': {
        flType = 'pneu-throttle-oneway';
        params.qn = clampNum(o.props.NN_FLOW, 300, 10, 5000);
        const rhr = Number(o.props.R_H_R);
        params.pct = Number.isFinite(rhr) ? clampNum(100 - rhr, 35, 1, 100) : 35;
        rot = 0;
        portMap = { 1: '1', 2: '2' };
        break;
      }
      case 'PVS5': {
        flType = 'pneu-throttle';
        params.qn = clampNum(o.props.NN_FLOW, 300, 10, 5000);
        rot = 0;
        portMap = { 1: '1', 2: '2' };
        break;
      }
      default: {
        warnings.push(`Componente FluidSIM no soportado omitido: ${o.type} (${lbl ?? o.oid}).`);
        continue;
      }
    }

    const id = addComponent(circuit, flType, pos.x, pos.y, params);
    const comp = circuit.components[id];
    comp.rot = rot;
    if (lbl) comp.label = lbl;
    if (o.props.description?.trim()) comp.desc = o.props.description.trim();
    compMap.set(o.idx, { id, portMap });
  }

  // 5. Reconstruir todas las tuberías neumáticas (CON PLine) con trazado fiel y estilo ISO 1219
  const resolveEndpoint = (portIdx: number): Endpoint | null => {
    const owner = portOwner.get(portIdx);
    if (!owner) return null;
    const jid = junctionMap.get(owner.compIdx);
    if (jid) return { kind: 'junction', id: jid };
    const cm = compMap.get(owner.compIdx);
    if (!cm) return null;
    const flPort = cm.portMap[owner.gateNum];
    if (!flPort) return null;
    return { kind: 'port', comp: cm.id, port: flPort };
  };

  let connCount = 0;
  for (const pl of plines) {
    const ea = resolveEndpoint(pl.a);
    const eb = resolveEndpoint(pl.b);
    if (!ea || !eb) continue;
    const res = connect(circuit, ea, eb);
    if (res.ok) {
      const conn = circuit.connections[res.id];
      conn.style = pl.style === 4 ? 'pilot' : 'work';
      const ga = endpointGeom(circuit, ea);
      const gb = endpointGeom(circuit, eb);
      if (ga && gb) conn.points = fluidSimRoute(ga.pos, ga.dir, gb.pos, gb.dir);
      connCount++;
    } else warnings.push(`Conexión omitida: ${res.reason}`);
  }

  const baseName = fileName.replace(/\.ct$/i, '').trim() || 'Circuito FluidSIM';
  const project: Project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: baseName,
    circuit,
  };

  return {
    project,
    warnings,
    stats: {
      components: Object.keys(circuit.components).length,
      connections: connCount,
      junctions: Object.keys(circuit.junctions).length,
    },
  };
}
