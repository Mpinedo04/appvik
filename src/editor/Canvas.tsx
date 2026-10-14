/**
 * Lienzo 2D del editor de circuitos (SVG).
 * Edición: colocar, mover, conectar, derivar, seleccionar. Simulación: accionar componentes
 * con el ratón y ver presiones y movimientos.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { getView } from '../components/views';
import { INK, oilColor, pressureColor, wireColor } from '../components/symbols';
import {
  addComponent,
  connect,
  dragSegment,
  moveItems,
  nearestOnConnection,
  splitConnection,
  validate,
} from '../core/model/edit';
import {
  allPorts,
  autoRoute,
  connectionPolyline,
  endpointGeom,
  sideAt,
  snap,
  svgTransform,
  worldBBox,
} from '../core/model/geometry';
import { endpointKey, type Circuit, type Dir, type Endpoint, type Vec2 } from '../core/model/types';
import { getModel, resolveParams } from '../core/registry';
import { paToBarGauge } from '../core/units';
import { useProject } from '../store/project';
import { canvasApi, LIBRARY_MIME } from './canvasApi';
import { useSim } from '../store/sim';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; start: Vec2; comps: string[]; junctions: string[] }
  | { kind: 'wire'; from: Endpoint; fromPos: Vec2; fromDir: Dir | null; cur: Vec2; moved: boolean }
  | { kind: 'marquee'; start: Vec2; cur: Vec2; additive: boolean }
  | { kind: 'segment'; conn: string; seg: number; start: Vec2 }
  | { kind: 'press'; comp: string };

const PORT_HIT = 7;

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 80, y: 60, k: 1.4 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const spaceHeld = useRef(false);

  const circuit = useProject((s) => s.circuit);
  const selection = useProject((s) => s.selection);
  const status = useSim((s) => s.status);
  const snapshot = useSim((s) => s.snapshot);
  const maxBar = useSim((s) => s.maxBar);
  const maxHydBar = useSim((s) => s.maxHydBar);
  const simMode = status !== 'stopped';

  const toWorld = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
  };

  // Zoom con la rueda, centrado en el cursor.
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const k = Math.min(5, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView({ k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k });
    };
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) spaceHeld.current = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  canvasApi.svg = () => svgRef.current;
  canvasApi.centerWorld = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 300, y: 200 };
    return toWorld({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  };
  canvasApi.fit = () => {
    const comps = Object.values(useProject.getState().circuit.components);
    const r = svgRef.current?.getBoundingClientRect();
    if (!comps.length || !r || r.width < 50 || r.height < 50) return;
    const bbs = comps.map(worldBBox);
    const x0 = Math.min(...bbs.map((b) => b.x0)) - 60;
    const y0 = Math.min(...bbs.map((b) => b.y0)) - 60;
    const x1 = Math.max(...bbs.map((b) => b.x1)) + 60;
    const y1 = Math.max(...bbs.map((b) => b.y1)) + 60;
    const k = Math.max(0.3, Math.min(2.5, r.width / (x1 - x0), r.height / (y1 - y0)));
    setView({
      k,
      x: (r.width - (x1 - x0) * k) / 2 - x0 * k,
      y: (r.height - (y1 - y0) * k) / 2 - y0 * k,
    });
  };

  const ports = useMemo(() => allPorts(circuit), [circuit]);
  const connectedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of Object.values(circuit.connections)) {
      s.add(endpointKey(c.a));
      s.add(endpointKey(c.b));
    }
    return s;
  }, [circuit]);
  const openPortKeys = useMemo(
    () => new Set(validate(circuit).map((i) => `${i.comp}|${i.port}`)),
    [circuit],
  );

  const findPortNear = (p: Vec2): Endpoint | null => {
    const r = PORT_HIT / viewRef.current.k + 3;
    let best: Endpoint | null = null;
    let bd = r;
    for (const wp of ports) {
      const d = Math.hypot(wp.pos.x - p.x, wp.pos.y - p.y);
      if (d < bd) {
        bd = d;
        best = { kind: 'port', comp: wp.comp, port: wp.def.id };
      }
    }
    for (const j of Object.values(circuit.junctions)) {
      const d = Math.hypot(j.x - p.x, j.y - p.y);
      if (d < bd) {
        bd = d;
        best = { kind: 'junction', id: j.id };
      }
    }
    return best;
  };

  const findConnNear = (p: Vec2): string | null => {
    const r = 6 / viewRef.current.k + 2;
    let best: string | null = null;
    let bd = r;
    for (const c of Object.values(circuit.connections)) {
      const { d } = nearestOnConnection(circuit, c.id, p);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  };

  const project = useProject.getState;

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const w = toWorld(e);
    try {
      svgRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético o ya liberado */
    }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld.current)) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    const el = (e.target as Element).closest('[data-kind]') as SVGElement | null;
    const kind = el?.dataset.kind;
    const id = el?.dataset.id ?? '';

    if (simMode) {
      if (kind === 'comp') {
        project().select({ comps: [id] });
        const c = circuit.components[id];
        const m = getModel(c.type);
        if (m.interactive?.(resolveParams(m, c.params))) {
          useSim.getState().press(id, sideAt(c, w));
          setDrag({ kind: 'press', comp: id });
          return;
        }
      } else {
        project().clearSelection();
      }
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }

    if (kind === 'port' || kind === 'junction') {
      const from: Endpoint =
        kind === 'port'
          ? { kind: 'port', comp: id.split('|')[0], port: id.split('|')[1] }
          : { kind: 'junction', id };
      const g = endpointGeom(circuit, from)!;
      setDrag({ kind: 'wire', from, fromPos: g.pos, fromDir: g.dir, cur: w, moved: false });
      return;
    }
    if (kind === 'comp') {
      const sel = project().selection;
      if (e.shiftKey) project().select({ comps: [id] }, true);
      else if (!sel.comps.includes(id)) project().select({ comps: [id] });
      const now = project().selection;
      if (!now.comps.includes(id)) return;
      project().beginTx();
      setDrag({ kind: 'move', start: w, comps: now.comps, junctions: now.junctions });
      return;
    }
    if (kind === 'seg') {
      const [conn, seg] = id.split('|');
      project().select({ conns: [conn] }, e.shiftKey);
      project().beginTx();
      setDrag({ kind: 'segment', conn, seg: Number(seg), start: w });
      return;
    }
    if (!e.shiftKey) project().clearSelection();
    setDrag({ kind: 'marquee', start: w, cur: w, additive: e.shiftKey });
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const w = toWorld(e);
    switch (d.kind) {
      case 'pan':
        setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
        break;
      case 'move': {
        const dx = snap(w.x - d.start.x);
        const dy = snap(w.y - d.start.y);
        project().updateTx((draft, base) => moveItems(draft, base, d.comps, d.junctions, dx, dy));
        break;
      }
      case 'segment': {
        const dx = snap(w.x - d.start.x);
        const dy = snap(w.y - d.start.y);
        project().updateTx((draft, base) => dragSegment(draft, base, d.conn, d.seg, dx, dy));
        break;
      }
      case 'wire': {
        const moved = d.moved || Math.hypot(w.x - d.fromPos.x, w.y - d.fromPos.y) > 4;
        setDrag({ ...d, cur: w, moved });
        const p = findPortNear(w);
        setHoverTarget(p ? endpointKey(p) : findConnNear(w));
        break;
      }
      case 'marquee':
        setDrag({ ...d, cur: w });
        break;
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    setDrag(null);
    setHoverTarget(null);
    if (!d) return;
    const w = toWorld(e);
    switch (d.kind) {
      case 'press':
        useSim.getState().release(d.comp);
        break;
      case 'move':
      case 'segment':
        project().endTx();
        break;
      case 'wire': {
        if (!d.moved) {
          if (d.from.kind === 'junction') project().select({ junctions: [d.from.id] }, e.shiftKey);
          break;
        }
        const target = findPortNear(w);
        if (target) {
          let reason = '';
          project().commit((c) => {
            const r = connect(c as Circuit, d.from, target);
            if (!r.ok) reason = r.reason;
          });
          if (reason) project().notify(reason);
          break;
        }
        const conn = findConnNear(w);
        if (conn) {
          let reason = '';
          project().commit((c) => {
            const j = splitConnection(c as Circuit, conn, w);
            const r = connect(c as Circuit, d.from, { kind: 'junction', id: j });
            if (!r.ok) reason = r.reason;
          });
          if (reason) project().notify(reason);
        }
        break;
      }
      case 'marquee': {
        const x0 = Math.min(d.start.x, d.cur.x);
        const x1 = Math.max(d.start.x, d.cur.x);
        const y0 = Math.min(d.start.y, d.cur.y);
        const y1 = Math.max(d.start.y, d.cur.y);
        if (x1 - x0 < 3 && y1 - y0 < 3) break;
        const comps = Object.values(circuit.components)
          .filter((c) => {
            const b = worldBBox(c);
            return b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0;
          })
          .map((c) => c.id);
        const junctions = Object.values(circuit.junctions)
          .filter((j) => j.x >= x0 && j.x <= x1 && j.y >= y0 && j.y <= y1)
          .map((j) => j.id);
        project().select({ comps, junctions }, d.additive);
        break;
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(LIBRARY_MIME);
    if (!type || simMode) return;
    e.preventDefault();
    const w = toWorld(e);
    let id = '';
    project().commit((c) => {
      id = addComponent(c as Circuit, type, w.x, w.y);
    });
    project().select({ comps: [id] });
  };

  const barOf = (node: number | undefined) =>
    snapshot && node !== undefined ? paToBarGauge(snapshot.nodeP[node]) : 0;

  const selComps = new Set(selection.comps);
  const selConns = new Set(selection.conns);
  const selJunctions = new Set(selection.junctions);

  // Vista previa de la tubería que se está trazando.
  let preview: Vec2[] | null = null;
  if (drag?.kind === 'wire' && drag.moved) {
    const target = findPortNear(drag.cur);
    const tg = target ? endpointGeom(circuit, target) : null;
    const end = tg ? tg.pos : { x: snap(drag.cur.x), y: snap(drag.cur.y) };
    preview = [drag.fromPos, ...autoRoute(drag.fromPos, drag.fromDir, end, tg?.dir ?? null), end];
  }

  const cursor =
    drag?.kind === 'pan'
      ? 'grabbing'
      : drag?.kind === 'move'
        ? 'move'
        : drag?.kind === 'wire'
          ? 'crosshair'
          : 'default';

  return (
    <div
      className="canvas-wrap"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(LIBRARY_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <svg
        id="circuit-svg"
        ref={svgRef}
        className={simMode ? 'canvas sim' : 'canvas'}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        data-sim={simMode ? 'on' : 'off'}
      >
        <defs>
          <pattern id="grid-minor" width={10} height={10} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.6} fill="#cbd5e1" />
          </pattern>
          <pattern id="grid-major" width={50} height={50} patternUnits="userSpaceOnUse">
            <rect width={50} height={50} fill="url(#grid-minor)" />
            <circle cx={0} cy={0} r={1.1} fill="#94a3b8" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect
            className="no-export"
            x={-5000}
            y={-5000}
            width={10000}
            height={10000}
            fill="url(#grid-major)"
          />
          <g className="content">
            {/* Tuberías */}
            {Object.values(circuit.connections).map((conn) => {
              const poly = connectionPolyline(circuit, conn.id);
              const elec = conn.medium === 'elec';
              const node = snapshot?.connNode[conn.id];
              const color = !snapshot
                ? INK
                : elec
                  ? wireColor(snapshot.elec.connLevel[conn.id])
                  : conn.medium === 'hyd'
                    ? oilColor(barOf(node), maxHydBar)
                    : pressureColor(barOf(node), maxBar);
              const selected = selConns.has(conn.id);
              const pts = poly.map((p) => `${p.x},${p.y}`).join(' ');
              return (
                <g key={conn.id}>
                  {selected && (
                    <polyline
                      points={pts}
                      fill="none"
                      stroke="#93c5fd"
                      strokeWidth={6}
                      strokeLinejoin="round"
                      className="no-export"
                    />
                  )}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={
                      elec
                        ? 1.3
                        : conn.medium === 'hyd'
                          ? snapshot
                            ? 2.8
                            : 2
                          : snapshot
                            ? 2.2
                            : 1.6
                    }
                    strokeLinejoin="round"
                  />
                  {!simMode &&
                    poly
                      .slice(0, -1)
                      .map((p, i) => (
                        <line
                          key={i}
                          className={`seg-hit no-export ${i > 0 && i < poly.length - 2 ? 'draggable' : ''} ${hoverTarget === conn.id ? 'hover' : ''}`}
                          data-kind="seg"
                          data-id={`${conn.id}|${i}`}
                          x1={p.x}
                          y1={p.y}
                          x2={poly[i + 1].x}
                          y2={poly[i + 1].y}
                        />
                      ))}
                </g>
              );
            })}
            {/* Derivaciones */}
            {Object.values(circuit.junctions).map((j) => {
              const color = !snapshot
                ? INK
                : j.medium === 'elec'
                  ? wireColor(snapshot.elec.junctionLevel[j.id])
                  : j.medium === 'hyd'
                    ? oilColor(barOf(snapshot.junctionNode[j.id]), maxHydBar)
                    : pressureColor(barOf(snapshot.junctionNode[j.id]), maxBar);
              return (
                <g key={j.id}>
                  {selJunctions.has(j.id) && (
                    <circle cx={j.x} cy={j.y} r={6} fill="#93c5fd" className="no-export" />
                  )}
                  <circle cx={j.x} cy={j.y} r={3} fill={color} />
                  {!simMode && (
                    <circle
                      className="port-hit no-export"
                      data-kind="junction"
                      data-id={j.id}
                      cx={j.x}
                      cy={j.y}
                      r={PORT_HIT}
                    />
                  )}
                </g>
              );
            })}
            {/* Componentes */}
            {Object.values(circuit.components).map((c) => {
              const m = getModel(c.type);
              const params = resolveParams(m, c.params);
              const View = getView(c.type).Symbol2D;
              const bb = m.bbox(params);
              const wb = worldBBox(c);
              const interactive = simMode && m.interactive?.(params);
              const hyd = m.ports(params).some((p) => p.medium === 'hyd');
              return (
                <g key={c.id}>
                  <g
                    transform={svgTransform(c)}
                    data-kind="comp"
                    data-id={c.id}
                    data-type={c.type}
                    className={interactive ? 'comp interactive' : 'comp'}
                  >
                    <rect
                      x={bb.x0}
                      y={bb.y0}
                      width={bb.x1 - bb.x0}
                      height={bb.y1 - bb.y0}
                      fill="transparent"
                      className="no-export"
                    />
                    <View
                      params={params}
                      state={snapshot?.comp[c.id]}
                      maxBar={hyd ? maxHydBar : maxBar}
                      medium={hyd ? 'hyd' : 'pneu'}
                    />
                  </g>
                  {selComps.has(c.id) && (
                    <rect
                      className="sel-box no-export"
                      x={wb.x0 - 5}
                      y={wb.y0 - 5}
                      width={wb.x1 - wb.x0 + 10}
                      height={wb.y1 - wb.y0 + 10}
                    />
                  )}
                  {!m.hideLabel && (
                    <text
                      x={wb.x0 - 4}
                      y={wb.y0 - 6}
                      className="comp-label"
                      fontSize={10}
                      fontWeight={600}
                      fill="#334155"
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {c.label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Puertos */}
            {ports.map((wp) => {
              const key = `${wp.comp}|${wp.def.id}`;
              const ek = endpointKey({ kind: 'port', comp: wp.comp, port: wp.def.id });
              const connected = connectedKeys.has(ek);
              const open = openPortKeys.has(key);
              return (
                <g key={key}>
                  {!connected && (
                    <circle
                      cx={wp.pos.x}
                      cy={wp.pos.y}
                      r={2.6}
                      fill={open ? '#fff7ed' : '#ffffff'}
                      stroke={open ? '#ea580c' : INK}
                      strokeWidth={1.1}
                      className={open ? 'open-port' : ''}
                    />
                  )}
                  {!simMode && (
                    <circle
                      className={`port-hit no-export ${hoverTarget === ek ? 'hover' : ''}`}
                      data-kind="port"
                      data-id={key}
                      cx={wp.pos.x}
                      cy={wp.pos.y}
                      r={PORT_HIT}
                    >
                      <title>{`${circuit.components[wp.comp]?.label} · ${wp.def.label ?? wp.def.id}`}</title>
                    </circle>
                  )}
                </g>
              );
            })}
          </g>
          {preview && (
            <polyline
              points={preview.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth={1.6}
              strokeDasharray="5 3"
              pointerEvents="none"
            />
          )}
          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.start.x, drag.cur.x)}
              y={Math.min(drag.start.y, drag.cur.y)}
              width={Math.abs(drag.cur.x - drag.start.x)}
              height={Math.abs(drag.cur.y - drag.start.y)}
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              strokeDasharray="4 3"
              strokeWidth={1 / view.k}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      <div className="zoom-badge">{Math.round(view.k * 100)} %</div>
      {Object.keys(circuit.components).length === 0 && (
        <div className="canvas-empty">
          <p>Arrastra componentes desde la biblioteca para empezar.</p>
          <p>
            Para unir dos componentes, arrastra desde un puerto (○) hasta otro. Si sueltas sobre una
            tubería, se crea una derivación en T.
          </p>
        </div>
      )}
    </div>
  );
}
