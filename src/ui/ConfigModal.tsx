/**
 * Ventana modal avanzada de configuración de componentes al estilo FluidSIM (modernizada).
 * Se abre haciendo doble clic en un componente del lienzo 2D o desde el botón «Configurar…»
 * del panel de propiedades. Se adapta automáticamente a válvulas de vías (neumáticas e
 * hidráulicas), cilindros/actuadores (con editor visual de marcas de final de carrera),
 * componentes hidráulicos, neumáticos auxiliares, sensores y eléctricos.
 */
import { useEffect, useMemo, useState } from 'react';
import { ALL_WAY_VALVES } from '../components/models';
import {
  isRoller,
  isSolenoid,
  type ActuatorType,
} from '../components/pneumatic/actuation';
import {
  parseForceProfile,
  parseMarks,
  type ForcePoint,
  type Mark,
} from '../components/pneumatic/cylinder-core';
import {
  boxKeysOf,
  VALVE_BOX_CATALOG,
  valveSignature,
  type WayValveConfig,
} from '../components/pneumatic/way-valve/config';
import { EXHAUST_OPTIONS } from '../components/pneumatic/way-valve/model';
import { getView } from '../components/views';
import { changeComponentType, pruneDanglingConnections, rerouteConnection } from '../core/model/edit';
import type { Circuit, ComponentInstance, Params, Rotation } from '../core/model/types';
import {
  getModel,
  resolveParams,
  type CategoryId,
  type ComponentModel,
  type ParamDef,
} from '../core/registry';
import { useProject } from '../store/project';
import { RENDER_LABELS, useView, type Render3D } from '../store/view';

const WAY_VALVE_TYPES = new Set([
  'pneu-valve-22nc',
  'pneu-valve-32nc',
  'pneu-valve-32no',
  'pneu-limit-32',
  'pneu-valve-32-sol',
  'pneu-sequence',
  'pneu-valve-42',
  'pneu-valve-52',
  'pneu-valve-52-pilot',
  'pneu-valve-52-memory',
  'pneu-valve-52-sol',
  'pneu-valve-52-sol2',
  'pneu-valve-53-closed',
  'pneu-valve-53-exhaust',
  'pneu-valve-53-pressure',
  'hyd-valve-42',
  'hyd-valve-43-closed',
  'hyd-valve-43-tandem',
  'hyd-valve-43-float',
  'hyd-valve-43-open',
]);

const VALVE_FAMILIES: { members: string[]; options: { type: string; short: string; label: string }[] }[] = [
  {
    members: ['pneu-valve-32nc', 'pneu-valve-32no', 'pneu-limit-32', 'pneu-valve-32-sol', 'pneu-sequence'],
    options: [
      { type: 'pneu-valve-32nc', short: '3/2 NC', label: 'Normalmente cerrada' },
      { type: 'pneu-valve-32no', short: '3/2 NA', label: 'Normalmente abierta' },
    ],
  },
  {
    members: [
      'pneu-valve-52',
      'pneu-valve-52-pilot',
      'pneu-valve-52-memory',
      'pneu-valve-52-sol',
      'pneu-valve-52-sol2',
      'pneu-valve-53-closed',
      'pneu-valve-53-exhaust',
      'pneu-valve-53-pressure',
    ],
    options: [
      { type: 'pneu-valve-52', short: '5/2', label: '2 posiciones' },
      { type: 'pneu-valve-53-closed', short: '5/3 CC', label: 'Centro cerrado' },
      { type: 'pneu-valve-53-exhaust', short: '5/3 CE', label: 'Centro a escape' },
      { type: 'pneu-valve-53-pressure', short: '5/3 CP', label: 'Centro a presión' },
    ],
  },
  {
    members: [
      'hyd-valve-42',
      'hyd-valve-43-closed',
      'hyd-valve-43-tandem',
      'hyd-valve-43-float',
      'hyd-valve-43-open',
    ],
    options: [
      { type: 'hyd-valve-42', short: '4/2', label: '2 posiciones' },
      { type: 'hyd-valve-43-closed', short: '4/3 CC', label: 'Centro cerrado' },
      { type: 'hyd-valve-43-tandem', short: '4/3 Tándem', label: 'Centro tándem' },
      { type: 'hyd-valve-43-float', short: '4/3 Flot.', label: 'Centro flotante' },
      { type: 'hyd-valve-43-open', short: '4/3 H', label: 'Centro abierto' },
    ],
  },
];

const MANUAL_OPTS: { value: ActuatorType; label: string }[] = [
  { value: 'none', label: '— Ninguno —' },
  { value: 'pushbutton', label: 'Pulsador' },
  { value: 'lever', label: 'Palanca con enclavamiento' },
  { value: 'pedal', label: 'Pedal' },
  { value: 'servo', label: 'Pulsador servopilotado' },
];

const MECH_OPTS: { value: ActuatorType; label: string }[] = [
  { value: 'none', label: '— Ninguno —' },
  { value: 'roller', label: 'Rodillo (final de carrera)' },
  { value: 'roller-oneway', label: 'Rodillo abatible (un sentido)' },
];

const PNEU_ELEC_OPTS: { value: ActuatorType; label: string }[] = [
  { value: 'none', label: '— Ninguno —' },
  { value: 'pilot', label: 'Pilotaje neumático / hidráulico' },
  { value: 'solenoid', label: 'Electroimán (bobina Y)' },
  { value: 'solenoid-servo', label: 'Electroimán servopilotado' },
];

const MANUAL_SET = new Set<string>(['pushbutton', 'lever', 'pedal', 'servo']);
const MECH_SET = new Set<string>(['roller', 'roller-oneway']);
const PNEU_ELEC_SET = new Set<string>(['pilot', 'solenoid', 'solenoid-servo']);

const CATEGORY_BADGE: Record<CategoryId, { label: string; tone: string }> = {
  supply: { label: 'Alimentación neumática', tone: 'blue' },
  directional: { label: 'Válvula de vías', tone: 'indigo' },
  sensors: { label: 'Sensor / Final de carrera', tone: 'teal' },
  flowpressure: { label: 'Caudal y presión', tone: 'cyan' },
  logic: { label: 'Lógica / Temporización', tone: 'violet' },
  actuators: { label: 'Actuador neumático', tone: 'blue' },
  instruments: { label: 'Instrumento', tone: 'slate' },
  hydraulic: { label: 'Hidráulica', tone: 'amber' },
  'hyd-valves': { label: 'Válvula hidráulica', tone: 'amber' },
  electric: { label: 'Mando eléctrico 24 V', tone: 'rose' },
  relays: { label: 'Relés y bobinas', tone: 'rose' },
  'electric-sensors': { label: 'Sensor eléctrico', tone: 'teal' },
  control: { label: 'Control / PLC', tone: 'emerald' },
  annotations: { label: 'Anotación / Texto', tone: 'slate' },
  cad: { label: 'Modelo CAD 3D', tone: 'slate' },
};

function formatForceProfile(pts: ForcePoint[]): string {
  return pts
    .filter((pt) => Number.isFinite(pt.mm) && Number.isFinite(pt.N))
    .map((pt) => `${Math.round(pt.mm * 10) / 10}:${Math.round(pt.N)}`)
    .join('; ');
}

function formatMarks(marks: Mark[]): string {
  return marks
    .filter((m) => m.label.trim() && Number.isFinite(m.mm))
    .map((m) => `${m.label.trim()}@${Math.round(m.mm * 10) / 10}`)
    .join('; ');
}

function defaultParamsOf(model: ComponentModel): Params {
  return Object.fromEntries(model.params.map((d) => [d.key, d.default]));
}

/** Vista previa SVG en directo del símbolo ISO 1219 con rotación y espejo. */
function SymbolPreview({
  type,
  params,
  rot,
  flip,
  flipY,
}: {
  type: string;
  params: Params;
  rot: Rotation;
  flip: boolean;
  flipY: boolean;
}) {
  const model = getModel(type);
  const resolved = resolveParams(model, params);
  const View = getView(type).Symbol2D;
  const bb = model.bbox(resolved);
  const pad = 26;
  const w = Math.max(80, bb.x1 - bb.x0 + pad * 2);
  const h = Math.max(64, bb.y1 - bb.y0 + pad * 2);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  // Caja cuadrada-ancha centrada para que rotaciones 90/270 no se recorten
  const maxDim = Math.max(w, h);
  const vx = cx - maxDim * 0.65;
  const vy = cy - maxDim * 0.45;
  const vw = maxDim * 1.3;
  const vh = maxDim * 0.9;
  const hyd = model.ports(resolved).some((p) => p.medium === 'hyd');

  return (
    <svg
      className="cfg-preview-svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="cfg-grid" width={12} height={12} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={0.7} fill="#cbd5e1" />
        </pattern>
      </defs>
      <rect x={vx - 100} y={vy - 100} width={vw + 200} height={vh + 200} fill="url(#cfg-grid)" />
      <g transform={`rotate(${rot}) scale(${flip ? -1 : 1} ${flipY ? -1 : 1})`}>
        <View params={resolved} medium={hyd ? 'hyd' : 'pneu'} />
      </g>
    </svg>
  );
}

/** Control numérico con deslizador sincronizado + entrada directa + unidad. */
function SliderNumberField({
  def,
  value,
  onChange,
  presets,
}: {
  def: Extract<ParamDef, { type: 'number' }>;
  value: number;
  onChange: (v: number) => void;
  presets?: number[];
}) {
  const min = def.min ?? 0;
  const max = def.max ?? Math.max(100, value * 2 || 100);
  const step = def.step ?? 1;
  const clamped = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  return (
    <div className="cfg-field">
      <div className="cfg-field-head">
        <span>{def.label}</span>
        <div className="cfg-num-box">
          <input
            type="number"
            min={def.min}
            max={def.max}
            step={step}
            value={Number.isFinite(value) ? value : ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
          />
          {def.unit && <em className="cfg-unit">{def.unit}</em>}
        </div>
      </div>
      <input
        className="cfg-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {presets && presets.length > 0 && (
        <div className="cfg-chips">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={`cfg-chip ${Math.abs(value - p) < 1e-6 ? 'active' : ''}`}
              onClick={() => onChange(p)}
            >
              {p} {def.unit ?? ''}
            </button>
          ))}
        </div>
      )}
      {def.help && <small className="cfg-help">{def.help}</small>}
    </div>
  );
}

/** Columna de accionamiento (izquierdo o derecho) estilo FluidSIM. */
function ActuationPanel({
  side,
  is3Pos,
  params,
  setParam,
}: {
  side: 'left' | 'right';
  is3Pos: boolean;
  params: Params;
  setParam: (k: string, v: number | string | boolean) => void;
}) {
  const key = side === 'left' ? 'actLeft' : 'actRight';
  const cur = String(params[key] ?? 'none') as ActuatorType;
  const isSpring = is3Pos ? Boolean(params.springs) : cur === 'spring';
  const manualVal = MANUAL_SET.has(cur) ? cur : 'none';
  const mechVal = MECH_SET.has(cur) ? cur : 'none';
  const peVal = PNEU_ELEC_SET.has(cur) ? cur : 'none';

  const setAct = (next: ActuatorType) => {
    setParam(key, next);
  };

  return (
    <div className="cfg-card">
      <div className="cfg-card-title">
        {side === 'left' ? 'Accionamiento izquierdo' : 'Accionamiento derecho'}
      </div>
      <label className="cfg-toggle-row">
        <input
          type="checkbox"
          checked={isSpring}
          onChange={(e) => {
            if (is3Pos) {
              setParam('springs', e.target.checked);
            } else {
              setAct(e.target.checked ? 'spring' : 'none');
            }
          }}
        />
        <span>{is3Pos ? 'Centrado por muelles' : 'Retorno por muelle'}</span>
      </label>

      {!is3Pos && (
        <label className="cfg-toggle-row">
          <input
            type="checkbox"
            checked={cur === 'pneu-spring'}
            onChange={(e) => setAct(e.target.checked ? 'pneu-spring' : 'none')}
          />
          <span>Muelle neumático</span>
        </label>
      )}

      <label className="cfg-select-row">
        <span>Manual</span>
        <select value={manualVal} onChange={(e) => setAct(e.target.value as ActuatorType)}>
          {MANUAL_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="cfg-select-row">
        <span>Mecánico</span>
        <select value={mechVal} onChange={(e) => setAct(e.target.value as ActuatorType)}>
          {MECH_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="cfg-select-row">
        <span>Neumático / Eléctrico</span>
        <select value={peVal} onChange={(e) => setAct(e.target.value as ActuatorType)}>
          {PNEU_ELEC_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {isRoller(cur) && (
        <div className="cfg-subbox">
          <label className="cfg-select-row">
            <span>Marca de final de carrera</span>
            <input
              type="text"
              value={String(params.sensor ?? '')}
              placeholder="p. ej. 1A0, 1S2"
              onChange={(e) => setParam('sensor', e.target.value)}
            />
          </label>
          {cur === 'roller-oneway' && (
            <label className="cfg-select-row">
              <span>Sentido de actuación</span>
              <select
                value={String(params.rollerDir ?? '+')}
                onChange={(e) => setParam('rollerDir', e.target.value)}
              >
                <option value="+">Al avanzar el vástago (+)</option>
                <option value="-">Al retroceder el vástago (−)</option>
              </select>
            </label>
          )}
        </div>
      )}

      {isSolenoid(cur) && (
        <div className="cfg-subbox">
          <label className="cfg-select-row">
            <span>{side === 'left' ? 'Etiqueta bobina izquierda' : 'Etiqueta bobina derecha'}</span>
            <input
              type="text"
              value={String(params[side === 'left' ? 'solLeft' : 'solRight'] ?? (side === 'left' ? 'Y1' : 'Y2'))}
              placeholder={side === 'left' ? 'Y1' : 'Y2'}
              onChange={(e) => setParam(side === 'left' ? 'solLeft' : 'solRight', e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Editor visual de marcas de final de carrera (regla de distancia estilo FluidSIM). */
function MarksEditor({
  marksText,
  stroke,
  compLabel,
  onChange,
}: {
  marksText: string;
  stroke: number;
  compLabel: string;
  onChange: (next: string) => void;
}) {
  const [rows, setRows] = useState<Mark[]>(() => parseMarks(marksText));
  const safeStroke = Math.max(1, stroke || 100);

  const sync = (next: Mark[]) => {
    setRows(next);
    onChange(formatMarks(next));
  };

  const addMark = (mmPos: number, suggested?: string) => {
    const base = compLabel || '1A';
    const nextIdx = rows.length;
    const label = suggested ?? `${base}${nextIdx}`;
    sync([...rows, { label, mm: Math.min(safeStroke, Math.max(0, mmPos)) }]);
  };

  return (
    <div className="cfg-card">
      <div className="cfg-card-head">
        <div className="cfg-card-title">Regla de distancia (marcas de final de carrera)</div>
        <div className="cfg-chips">
          <button
            type="button"
            className="cfg-chip"
            onClick={() => addMark(0, `${compLabel || '1A'}0`)}
          >
            + Inicio (0 mm)
          </button>
          <button
            type="button"
            className="cfg-chip"
            onClick={() => addMark(safeStroke, `${compLabel || '1A'}1`)}
          >
            + Fin ({safeStroke} mm)
          </button>
          <button
            type="button"
            className="cfg-chip accent"
            onClick={() => addMark(Math.round(safeStroke / 2))}
          >
            + Añadir marca
          </button>
        </div>
      </div>

      {/* Regla visual proporcional */}
      <div className="cfg-ruler">
        <div className="cfg-ruler-track">
          {rows.map((m, i) => {
            const pct = Math.min(100, Math.max(0, (m.mm / safeStroke) * 100));
            return (
              <div
                key={i}
                className="cfg-ruler-pin"
                style={{ left: `${pct}%` }}
                title={`${m.label} @ ${m.mm} mm`}
              >
                <span>{m.label || '?'}</span>
              </div>
            );
          })}
        </div>
        <div className="cfg-ruler-scale">
          <span>0 mm</span>
          <span>{Math.round(safeStroke / 2)} mm</span>
          <span>{safeStroke} mm</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="cfg-empty">
          Sin marcas. Añade etiquetas (p. ej. <code>1A0</code> a 0 mm o <code>1A1</code> a {safeStroke} mm)
          para accionar finales de carrera de rodillo o sensores magnéticos.
        </p>
      ) : (
        <div className="cfg-marks-list">
          {rows.map((m, i) => (
            <div key={i} className="cfg-mark-row">
              <input
                type="text"
                value={m.label}
                placeholder="Etiqueta (1A0)"
                onChange={(e) => {
                  const next = rows.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r));
                  sync(next);
                }}
              />
              <input
                className="cfg-range"
                type="range"
                min={0}
                max={safeStroke}
                step={1}
                value={Math.min(safeStroke, Math.max(0, m.mm))}
                onChange={(e) => {
                  const next = rows.map((r, idx) => (idx === i ? { ...r, mm: Number(e.target.value) } : r));
                  sync(next);
                }}
              />
              <div className="cfg-num-box">
                <input
                  type="number"
                  min={0}
                  max={safeStroke}
                  step={1}
                  value={m.mm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const next = rows.map((r, idx) => (idx === i ? { ...r, mm: v } : r));
                    sync(next);
                  }}
                />
                <em className="cfg-unit">mm</em>
              </div>
              <button
                type="button"
                className="cfg-del-btn"
                title="Eliminar marca"
                onClick={() => sync(rows.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editor visual del perfil de fuerza variable (mm → N) para cilindros. */
function ForceProfileEditor({
  profileText,
  stroke,
  onChange,
}: {
  profileText: string;
  stroke: number;
  onChange: (next: string) => void;
}) {
  const [pts, setPts] = useState<ForcePoint[]>(() => parseForceProfile(profileText));
  const safeStroke = Math.max(1, stroke || 100);

  const sync = (next: ForcePoint[]) => {
    setPts(next);
    onChange(formatForceProfile(next));
  };

  const maxAbsF = Math.max(100, ...pts.map((p) => Math.abs(p.N)));
  const sorted = [...pts].sort((a, b) => a.mm - b.mm);
  const poly = sorted
    .map((p) => {
      const x = 10 + (Math.min(safeStroke, Math.max(0, p.mm)) / safeStroke) * 280;
      const y = 46 - (p.N / maxAbsF) * 34;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="cfg-card">
      <div className="cfg-card-head">
        <div className="cfg-card-title">Perfil de fuerza variable (recorrido → carga)</div>
        <div className="cfg-chips">
          <button
            type="button"
            className="cfg-chip"
            onClick={() =>
              sync([
                { mm: 0, N: 0 },
                { mm: Math.round(safeStroke * 0.5), N: 80 },
                { mm: safeStroke, N: 150 },
              ])
            }
          >
            Preset rampa
          </button>
          <button
            type="button"
            className="cfg-chip accent"
            onClick={() => sync([...pts, { mm: Math.round(safeStroke / 2), N: 100 }])}
          >
            + Añadir punto
          </button>
          {pts.length > 0 && (
            <button type="button" className="cfg-chip" onClick={() => sync([])}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {pts.length > 0 && (
        <svg className="cfg-curve-svg" viewBox="0 0 300 92" preserveAspectRatio="none">
          <line x1={10} y1={46} x2={290} y2={46} stroke="#cbd5e1" strokeDasharray="3 3" />
          <polyline fill="none" stroke="#2563eb" strokeWidth={2.2} points={poly} />
          {sorted.map((p, i) => {
            const x = 10 + (Math.min(safeStroke, Math.max(0, p.mm)) / safeStroke) * 280;
            const y = 46 - (p.N / maxAbsF) * 34;
            return <circle key={i} cx={x} cy={y} r={3.5} fill="#2563eb" />;
          })}
          <text x={12} y={13} fontSize={9} fill="#64748b">
            +{maxAbsF} N
          </text>
          <text x={12} y={88} fontSize={9} fill="#64748b">
            −{maxAbsF} N · 0 → {safeStroke} mm
          </text>
        </svg>
      )}

      {pts.length === 0 ? (
        <p className="cfg-empty">
          Sin perfil variable (sólo actúa la carga constante y el peso por inclinación). Añade
          tramos para simular prensado, muelles externos o topes elásticos.
        </p>
      ) : (
        <div className="cfg-marks-list">
          {pts.map((p, i) => (
            <div key={i} className="cfg-force-row">
              <div className="cfg-num-box">
                <input
                  type="number"
                  min={0}
                  max={safeStroke}
                  step={5}
                  value={p.mm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    sync(pts.map((r, idx) => (idx === i ? { ...r, mm: v } : r)));
                  }}
                />
                <em className="cfg-unit">mm</em>
              </div>
              <input
                className="cfg-range"
                type="range"
                min={-1000}
                max={2000}
                step={10}
                value={Math.min(2000, Math.max(-1000, p.N))}
                onChange={(e) =>
                  sync(pts.map((r, idx) => (idx === i ? { ...r, N: Number(e.target.value) } : r)))
                }
              />
              <div className="cfg-num-box">
                <input
                  type="number"
                  step={10}
                  value={p.N}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    sync(pts.map((r, idx) => (idx === i ? { ...r, N: v } : r)));
                  }}
                />
                <em className="cfg-unit">N</em>
              </div>
              <button
                type="button"
                className="cfg-del-btn"
                title="Eliminar punto"
                onClick={() => sync(pts.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** KPIs de ingeniería calculados en vivo para cilindros y equipos hidráulicos. */
function EngineeringStats({ type, params }: { type: string; params: Params }) {
  const bore = Number(params.bore);
  const stroke = Number(params.stroke);
  const rod = Number(params.rod);
  const isHyd = type.startsWith('hyd-');

  if (type.includes('cyl-') && Number.isFinite(bore) && Number.isFinite(stroke)) {
    const pRef = isHyd ? 60 : 6; // bar de referencia
    const aCapMm2 = Math.PI * (bore / 2) ** 2;
    const rodD = Number.isFinite(rod) ? rod : type === 'pneu-cyl-rodless' ? 0 : bore * 0.4;
    const aRodMm2 = Math.PI * (rodD / 2) ** 2;
    const fPlus = (pRef * 0.1 * aCapMm2).toFixed(0); // N (1 bar = 0.1 N/mm²)
    const fMinus = (pRef * 0.1 * Math.max(0, aCapMm2 - aRodMm2)).toFixed(0);
    const volCm3 = ((aCapMm2 * stroke) / 1000).toFixed(1);
    return (
      <div className="cfg-kpis">
        <div className="cfg-kpi">
          <span>Fuerza avance ({pRef} bar)</span>
          <b>{fPlus} N</b>
        </div>
        {!type.includes('single') && (
          <div className="cfg-kpi">
            <span>Fuerza retroceso ({pRef} bar)</span>
            <b>{fMinus} N</b>
          </div>
        )}
        <div className="cfg-kpi">
          <span>Volumen por carrera</span>
          <b>{volCm3} cm³</b>
        </div>
      </div>
    );
  }

  if (type === 'hyd-power-unit' || type === 'hyd-pump') {
    const q = Number(params.flow ?? 8);
    const p = Number(params.pset ?? params.pmax ?? 60);
    const kw = ((q * p) / 600).toFixed(2);
    return (
      <div className="cfg-kpis">
        <div className="cfg-kpi">
          <span>Potencia hidráulica máx.</span>
          <b>{kw} kW</b>
        </div>
        <div className="cfg-kpi">
          <span>Caudal nominal</span>
          <b>{q.toFixed(1)} l/min</b>
        </div>
        <div className="cfg-kpi">
          <span>Presión de tarado / máx.</span>
          <b>{p} bar</b>
        </div>
      </div>
    );
  }

  if (type === 'hyd-motor') {
    const disp = Number(params.disp ?? 8);
    const t60 = ((disp * 60) / (20 * Math.PI)).toFixed(1);
    return (
      <div className="cfg-kpis">
        <div className="cfg-kpi">
          <span>Par teórico a 60 bar</span>
          <b>{t60} N·m</b>
        </div>
        <div className="cfg-kpi">
          <span>Velocidad con 8 l/min</span>
          <b>{Math.round((8 * 1000) / Math.max(0.1, disp))} rpm</b>
        </div>
      </div>
    );
  }

  return null;
}

export function ConfigModal() {
  const configCompId = useView((s) => s.configCompId);
  const closeConfig = useView((s) => s.closeConfig);
  const circuit = useProject((s) => s.circuit);
  const comp = configCompId ? circuit.components[configCompId] : null;

  if (!comp) return null;
  return <ConfigModalInner key={comp.id} comp={comp} onClose={closeConfig} />;
}

function ConfigModalInner({
  comp,
  onClose,
}: {
  comp: ComponentInstance;
  onClose: () => void;
}) {
  const commit = useProject((s) => s.commit);
  const perComp = useView((s) => s.perComp[comp.id] ?? '');
  const setCompRender = useView((s) => s.setCompRender);

  const [draftType, setDraftType] = useState(comp.type);
  const [draftLabel, setDraftLabel] = useState(comp.label);
  const [draftDesc, setDraftDesc] = useState(comp.desc ?? '');
  const [draftRot, setDraftRot] = useState<Rotation>(comp.rot);
  const [draftFlip, setDraftFlip] = useState<boolean>(comp.flip);
  const [draftFlipY, setDraftFlipY] = useState<boolean>(Boolean(comp.flipY));
  const [draftParams, setDraftParams] = useState<Params>(() =>
    resolveParams(getModel(comp.type), comp.params),
  );

  const model = useMemo(() => getModel(draftType), [draftType]);
  const resolved = useMemo(() => resolveParams(model, draftParams), [model, draftParams]);
  const isWayValve = WAY_VALVE_TYPES.has(draftType);
  const valveCfg: WayValveConfig | null = useMemo(
    () => (isWayValve ? (ALL_WAY_VALVES.find((v) => v.cfg.type === draftType)?.cfg ?? null) : null),
    [draftType, isWayValve],
  );
  const isHyd = draftType.startsWith('hyd-');
  const badge = CATEGORY_BADGE[model.category] ?? { label: 'Componente', tone: 'slate' };

  const family = useMemo(
    () => VALVE_FAMILIES.find((f) => f.members.includes(draftType)) ?? null,
    [draftType],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setParam = (key: string, value: number | string | boolean) => {
    setDraftParams((prev) => ({ ...prev, [key]: value }));
  };

  const switchValveBody = (targetType: string) => {
    if (targetType === draftType) return;
    const nextModel = getModel(targetType);
    const nextDefaults = defaultParamsOf(nextModel);
    const merged: Params = { ...nextDefaults };
    const allowed = new Set(nextModel.params.map((d) => d.key));
    for (const [k, v] of Object.entries(resolved)) {
      if (allowed.has(k) && k !== 'initPos') merged[k] = v;
    }
    // Si pasamos a 3 posiciones, aseguramos que no quede un muelle solo en un lado bloqueando un accionamiento
    if (targetType.includes('-53-') || targetType.includes('-43-')) {
      if (merged.actRight === 'spring') merged.actRight = 'pilot';
      if (merged.actLeft === 'spring') merged.actLeft = 'pilot';
      merged.springs = true;
    }
    setDraftType(targetType);
    setDraftParams(merged);
  };

  const handleReset = () => {
    setDraftParams(defaultParamsOf(model));
    setDraftRot(0);
    setDraftFlip(false);
    setDraftFlipY(false);
  };

  const handleApply = () => {
    commit((d) => {
      const c = d.components[comp.id];
      if (!c) return;
      c.label = draftLabel.trim() || comp.label;
      if (draftDesc.trim()) c.desc = draftDesc.trim();
      else delete c.desc;
      c.rot = draftRot;
      c.flip = draftFlip;
      if (draftFlipY) c.flipY = true;
      else delete c.flipY;
      if (draftType !== comp.type) {
        changeComponentType(d as Circuit, comp.id, draftType, resolved);
      } else {
        c.params = { ...resolved };
        pruneDanglingConnections(d as Circuit);
        for (const conn of Object.values(d.connections)) {
          if (
            (conn.a.kind === 'port' && conn.a.comp === comp.id) ||
            (conn.b.kind === 'port' && conn.b.comp === comp.id)
          ) {
            rerouteConnection(d as Circuit, conn.id);
          }
        }
      }
    });
    onClose();
  };

  const curBoxKeys = useMemo(
    () => (valveCfg ? boxKeysOf(valveCfg, resolved) : []),
    [valveCfg, resolved],
  );
  const boxCatalog = useMemo(
    () => (valveCfg ? VALVE_BOX_CATALOG[valveSignature(valveCfg)] : []),
    [valveCfg],
  );
  const is3Pos = curBoxKeys.length >= 3 || Boolean(model.params.find((d) => d.key === 'springs'));
  const qnDef = model.params.find((d) => d.key === 'qn') as
    | Extract<ParamDef, { type: 'number' }>
    | undefined;
  const pilotBarDef = model.params.find((d) => d.key === 'pilotBar') as
    | Extract<ParamDef, { type: 'number' }>
    | undefined;
  const exhaustDefs = model.params.filter((d) => d.key.startsWith('ex_'));
  const hasMarks = model.params.some((d) => d.key === 'marks');
  const hasForceProfile = model.params.some((d) => d.key === 'forceProfile');

  const visibleGenericParams = model.params.filter(
    (def) =>
      def.key !== 'marks' &&
      def.key !== 'forceProfile' &&
      (!def.when || def.when(resolved)),
  );

  return (
    <div className="modal-back cfg-backdrop" onClick={onClose}>
      <div className="modal cfg-modal" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <header className="cfg-header">
          <div className="cfg-head-left">
            <span className={`cfg-badge tone-${badge.tone}`}>{badge.label}</span>
            <h2>
              Configurar: <span>{model.name}</span>
            </h2>
          </div>
          <button className="cfg-close" onClick={onClose} title="Cerrar (Esc)">
            ✕
          </button>
        </header>

        {/* Cuerpo con scroll */}
        <div className="cfg-body">
          {/* Fila superior: Vista previa en vivo + Identificación y Orientación */}
          <div className="cfg-top-grid">
            <div className="cfg-preview-card">
              <div className="cfg-preview-label">Vista previa ISO 1219 en vivo</div>
              <SymbolPreview
                type={draftType}
                params={resolved}
                rot={draftRot}
                flip={draftFlip}
                flipY={draftFlipY}
              />
            </div>

            <div className="cfg-ident-card">
              <div className="cfg-ident-row">
                <label className="cfg-input-group short">
                  <span>Etiqueta</span>
                  <input
                    type="text"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="p. ej. 1V3"
                  />
                </label>
                <label className="cfg-input-group grow">
                  <span>Descripción / Notas</span>
                  <input
                    type="text"
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    placeholder={model.name}
                  />
                </label>
              </div>

              <div className="cfg-transform-row">
                <div className="cfg-seg-group">
                  <span>Rotación</span>
                  <div className="cfg-seg">
                    {([0, 90, 180, 270] as Rotation[]).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        className={draftRot === deg ? 'active' : ''}
                        onClick={() => setDraftRot(deg)}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cfg-seg-group">
                  <span>Espejo</span>
                  <div className="cfg-flip-row">
                    <button
                      type="button"
                      className={`cfg-flip-btn ${draftFlip ? 'active' : ''}`}
                      onClick={() => setDraftFlip((v) => !v)}
                    >
                      ⇄ Horizontal
                    </button>
                    <button
                      type="button"
                      className={`cfg-flip-btn ${draftFlipY ? 'active' : ''}`}
                      onClick={() => setDraftFlipY((v) => !v)}
                    >
                      ⇅ Vertical
                    </button>
                  </div>
                </div>

                <div className="cfg-seg-group">
                  <span>Vista 3D</span>
                  <select
                    className="cfg-mini-select"
                    value={perComp}
                    onChange={(e) =>
                      setCompRender(comp.id, (e.target.value || null) as Render3D | null)
                    }
                  >
                    <option value="">Global</option>
                    {(Object.keys(RENDER_LABELS) as Render3D[]).map((r) => (
                      <option key={r} value={r}>
                        {RENDER_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="cfg-model-desc">{model.description}</p>
            </div>
          </div>

          {/* MODO A: Válvulas de vías (Neumáticas e Hidráulicas) — Diseño FluidSIM */}
          {isWayValve && (
            <>
              <div className="cfg-valve-grid">
                <ActuationPanel
                  side="left"
                  is3Pos={is3Pos}
                  params={resolved}
                  setParam={setParam}
                />

                <div className="cfg-card cfg-body-card">
                  <div className="cfg-card-title">Cuerpo de válvula</div>

                  <label className="cfg-toggle-row">
                    <input
                      type="checkbox"
                      checked={Boolean(resolved.reversible)}
                      onChange={(e) => setParam('reversible', e.target.checked)}
                    />
                    <span>Reversible (flujo bidireccional ↔)</span>
                  </label>

                  {family && (
                    <div className="cfg-body-block">
                      <span className="cfg-sublabel">Configuración estándar</span>
                      <div className="cfg-body-pills">
                        {family.options.map((opt) => {
                          const active =
                            !resolved.customBoxes &&
                            (draftType === opt.type ||
                              (opt.type === 'pneu-valve-32nc' &&
                                ['pneu-limit-32', 'pneu-valve-32-sol', 'pneu-sequence'].includes(
                                  draftType,
                                )) ||
                              (opt.type === 'pneu-valve-52' &&
                                draftType.startsWith('pneu-valve-52')));
                          return (
                            <button
                              key={opt.type}
                              type="button"
                              className={`cfg-body-pill ${active ? 'active' : ''}`}
                              onClick={() => {
                                setParam('customBoxes', '');
                                switchValveBody(opt.type);
                              }}
                            >
                              <b>{opt.short}</b>
                              <small>{opt.label}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {valveCfg && boxCatalog.length > 0 && (
                    <div className="cfg-body-block">
                      <div className="cfg-box-head">
                        <span className="cfg-sublabel">
                          Casilla por casilla ({curBoxKeys.length} pos.)
                        </span>
                        <div className="cfg-chips">
                          {curBoxKeys.length < 4 && (
                            <button
                              type="button"
                              className="cfg-chip accent"
                              onClick={() =>
                                setParam(
                                  'customBoxes',
                                  [...curBoxKeys, boxCatalog[0].key].join(','),
                                )
                              }
                            >
                              + Posición
                            </button>
                          )}
                          {curBoxKeys.length > 2 && (
                            <button
                              type="button"
                              className="cfg-chip"
                              onClick={() =>
                                setParam('customBoxes', curBoxKeys.slice(0, -1).join(','))
                              }
                            >
                              − Quitar
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="cfg-box-grid">
                        {curBoxKeys.map((bk, idx) => (
                          <label key={idx} className="cfg-select-row compact">
                            <span>Casilla {idx + 1}</span>
                            <select
                              value={bk}
                              onChange={(e) => {
                                const next = curBoxKeys.map((k, i) =>
                                  i === idx ? e.target.value : k,
                                );
                                setParam('customBoxes', next.join(','));
                              }}
                            >
                              {boxCatalog.map((pat) => (
                                <option key={pat.key} value={pat.key}>
                                  {pat.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="cfg-body-block">
                    <span className="cfg-sublabel">Posición inicial</span>
                    <div className="cfg-seg full">
                      <button
                        type="button"
                        className={String(resolved.initPos ?? 'rest') === 'rest' ? 'active' : ''}
                        onClick={() => setParam('initPos', 'rest')}
                      >
                        Reposo
                      </button>
                      {curBoxKeys.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          className={String(resolved.initPos ?? 'rest') === String(i) ? 'active' : ''}
                          onClick={() => setParam('initPos', String(i))}
                        >
                          {curBoxKeys.length === 2
                            ? i === 0
                              ? 'Izq.'
                              : 'Der.'
                            : `Pos. ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cfg-body-block">
                    <span className="cfg-sublabel">Señal dominante (si ambos lados activos)</span>
                    <div className="cfg-seg full">
                      {[
                        { value: 'left', label: '◀ Izquierda' },
                        { value: 'none', label: 'Ninguna' },
                        { value: 'right', label: 'Derecha ▶' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={String(resolved.dominant ?? 'none') === opt.value ? 'active' : ''}
                          onClick={() => setParam('dominant', opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <ActuationPanel
                  side="right"
                  is3Pos={is3Pos}
                  params={resolved}
                  setParam={setParam}
                />
              </div>

              <div className="cfg-bottom-grid">
                <div className="cfg-card">
                  <div className="cfg-card-title">
                    {isHyd ? 'Parámetros hidráulicos' : 'Caudal nominal y pilotaje'}
                  </div>
                  {qnDef && (
                    <SliderNumberField
                      def={qnDef}
                      value={Number(resolved.qn)}
                      onChange={(v) => setParam('qn', v)}
                      presets={isHyd ? [10, 25, 40, 80, 160] : [60, 120, 300, 500, 1000]}
                    />
                  )}
                  {pilotBarDef && (!pilotBarDef.when || pilotBarDef.when(resolved)) && (
                    <SliderNumberField
                      def={pilotBarDef}
                      value={Number(resolved.pilotBar)}
                      onChange={(v) => setParam('pilotBar', v)}
                      presets={[0.8, 1.5, 2.5, 4]}
                    />
                  )}
                </div>

                {exhaustDefs.length > 0 && (
                  <div className="cfg-card">
                    <div className="cfg-card-title">Terminaciones de escape (ISO 1219)</div>
                    {exhaustDefs.map((def) => (
                      <div key={def.key} className="cfg-exhaust-row">
                        <span className="cfg-sublabel">{def.label}</span>
                        <div className="cfg-seg full">
                          {EXHAUST_OPTIONS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              className={String(resolved[def.key] ?? 'open') === o.value ? 'active' : ''}
                              onClick={() => setParam(def.key, o.value)}
                            >
                              {o.value === 'open'
                                ? 'Abierto'
                                : o.value === 'silencer'
                                  ? 'Silenciador'
                                  : o.value === 'exhaust'
                                    ? 'Roscado'
                                    : 'Tapón'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* MODO B & C: Cilindros, Hidráulica, Caudal/Presión, Lógica, Eléctrica y resto */}
          {!isWayValve && (
            <>
              <EngineeringStats type={draftType} params={resolved} />

              {visibleGenericParams.length > 0 && (
                <div className="cfg-card">
                  <div className="cfg-card-title">Parámetros técnicos</div>
                  <div className="cfg-params-grid">
                    {visibleGenericParams.map((def) => {
                      if (def.type === 'number') {
                        return (
                          <SliderNumberField
                            key={def.key}
                            def={def}
                            value={Number(resolved[def.key])}
                            onChange={(v) => setParam(def.key, v)}
                          />
                        );
                      }
                      if (def.type === 'select') {
                        const val = String(resolved[def.key]);
                        return (
                          <div key={def.key} className="cfg-field">
                            <span className="cfg-sublabel">{def.label}</span>
                            {def.options.length <= 4 ? (
                              <div className="cfg-seg full">
                                {def.options.map((o) => (
                                  <button
                                    key={o.value}
                                    type="button"
                                    className={val === o.value ? 'active' : ''}
                                    onClick={() => setParam(def.key, o.value)}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <select
                                className="cfg-full-select"
                                value={val}
                                onChange={(e) => setParam(def.key, e.target.value)}
                              >
                                {def.options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {def.help && <small className="cfg-help">{def.help}</small>}
                          </div>
                        );
                      }
                      if (def.type === 'boolean') {
                        return (
                          <label key={def.key} className="cfg-toggle-row cardlike">
                            <input
                              type="checkbox"
                              checked={Boolean(resolved[def.key])}
                              onChange={(e) => setParam(def.key, e.target.checked)}
                            />
                            <div>
                              <span>{def.label}</span>
                              {def.help && <small className="cfg-help">{def.help}</small>}
                            </div>
                          </label>
                        );
                      }
                      return (
                        <label key={def.key} className="cfg-field">
                          <span className="cfg-sublabel">{def.label}</span>
                          <input
                            className="cfg-text-input"
                            type="text"
                            value={String(resolved[def.key] ?? '')}
                            placeholder={def.placeholder}
                            onChange={(e) => setParam(def.key, e.target.value)}
                          />
                          {def.help && <small className="cfg-help">{def.help}</small>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasMarks && (
                <MarksEditor
                  marksText={String(resolved.marks ?? '')}
                  stroke={Number(resolved.stroke ?? 100)}
                  compLabel={draftLabel}
                  onChange={(next) => setParam('marks', next)}
                />
              )}

              {hasForceProfile && (
                <ForceProfileEditor
                  profileText={String(resolved.forceProfile ?? '')}
                  stroke={Number(resolved.stroke ?? 100)}
                  onChange={(next) => setParam('forceProfile', next)}
                />
              )}
            </>
          )}
        </div>

        {/* Pie de modal */}
        <footer className="cfg-footer">
          <button type="button" className="btn" onClick={handleReset}>
            Restablecer valores
          </button>
          <div className="cfg-footer-right">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={handleApply}>
              Aplicar cambios
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
