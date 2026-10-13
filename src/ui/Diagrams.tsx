/**
 * Panel de diagramas: espacio-tiempo (uPlot) y espacio-fase (SVG propio), generados con la
 * grabación de la simulación. Se pueden exportar a PNG y CSV.
 */
import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { phaseDiagram, type PhaseDiagram, type Recording } from '../core/sim/recorder';
import { useProject } from '../store/project';
import { currentRecorder, useSim } from '../store/sim';
import { useView } from '../store/view';

const COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#db2777',
];

function useRecording(): Recording | null {
  const [rec, setRec] = useState<Recording | null>(() => currentRecorder()?.data() ?? null);
  const status = useSim((s) => s.status);
  useEffect(() => {
    const read = () => setRec(currentRecorder()?.data() ?? null);
    read();
    if (status !== 'running') return;
    const t = setInterval(read, 200);
    return () => clearInterval(t);
  }, [status]);
  return rec;
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileBase = () =>
  useProject
    .getState()
    .name.trim()
    .replace(/[\\/:*?"<>|]+/g, '_') || 'circuito';

// ------------------------------------------------------------------ Espacio-tiempo
function TimeChart({
  rec,
  onCanvas,
}: {
  rec: Recording;
  onCanvas: (c: HTMLCanvasElement | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const key = rec.series.map((s) => s.id).join();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const hasGauge = rec.series.some((s) => s.kind === 'gauge');
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: Math.max(80, el.clientHeight - 34),
      scales: { x: { time: false }, pos: { range: [-5, 105] }, bar: { range: [0, 10] } },
      axes: [
        { label: 't [s]', size: 30 },
        {
          scale: 'pos',
          label: 'carrera % · válvula',
          size: 56,
          values: (_, v) => v.map((x) => `${x}`),
        },
        ...(hasGauge
          ? [{ scale: 'bar', side: 1, label: 'bar', size: 40, grid: { show: false } }]
          : []),
      ],
      legend: { live: true },
      cursor: { drag: { x: true, y: false } },
      series: [
        { label: 't' },
        ...rec.series.map((s, i) => ({
          label:
            s.kind === 'valve'
              ? `${s.label} (posición)`
              : s.kind === 'electric'
                ? `${s.label} (activada)`
                : s.label,
          scale: s.kind === 'gauge' ? 'bar' : 'pos',
          stroke: COLORS[i % COLORS.length],
          width: s.kind === 'actuator' ? 2.2 : 1.2,
          dash: s.kind === 'valve' ? [5, 4] : s.kind === 'electric' ? [2, 3] : undefined,
          paths:
            s.kind === 'valve' || s.kind === 'electric'
              ? uPlot.paths.stepped!({ align: 1 })
              : undefined,
          value: (_: uPlot, v: number | null) =>
            v === null
              ? '—'
              : s.kind === 'electric'
                ? v > 50
                  ? 'activada'
                  : 'desactivada'
                : s.kind === 'valve'
                  ? v > 0.75
                    ? 'accionada'
                    : v > 0.25
                      ? 'centro'
                      : 'reposo'
                  : `${v.toFixed(1)} ${s.unit}`,
        })),
      ],
    };
    const data = toData(rec);
    plot.current = new uPlot(opts, data, el);
    onCanvas(plot.current.ctx.canvas);
    const ro = new ResizeObserver(() =>
      plot.current?.setSize({ width: el.clientWidth, height: Math.max(80, el.clientHeight - 34) }),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
      onCanvas(null);
    };
    // Sólo se recrea si cambian las series; los datos se actualizan aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    plot.current?.setData(toData(rec));
  }, [rec]);

  return <div ref={box} className="chart-box" />;
}

function toData(rec: Recording): uPlot.AlignedData {
  return [
    rec.t,
    ...rec.values.map((v, i) =>
      rec.series[i].kind === 'valve' || rec.series[i].kind === 'electric'
        ? v.map((x) => x * 100)
        : v,
    ),
  ];
}

// ------------------------------------------------------------------ Espacio-fase
function PhaseChart({ pd, svgRef }: { pd: PhaseDiagram; svgRef: React.RefObject<SVGSVGElement> }) {
  const n = pd.steps.length;
  if (!pd.actuators.length) return <p className="diag-empty">No hay actuadores en el circuito.</p>;
  if (!n)
    return (
      <p className="diag-empty">
        Simula el circuito: aquí aparecerá cada paso del ciclo (qué actuador se mueve y en qué
        sentido).
      </p>
    );
  const left = 70;
  const colW = Math.max(60, Math.min(120, 900 / n));
  const rowH = 56;
  const top = 34;
  const w = left + colW * n + 30;
  const h = top + rowH * pd.actuators.length + 10;
  return (
    <svg
      ref={svgRef}
      className="phase-svg"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fontFamily="Inter, system-ui, sans-serif"
    >
      <rect width={w} height={h} fill="#fff" />
      {Array.from({ length: n + 1 }, (_, k) => (
        <g key={k}>
          <line
            x1={left + k * colW}
            y1={top - 6}
            x2={left + k * colW}
            y2={h - 6}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          <text x={left + k * colW} y={top - 10} textAnchor="middle" fontSize={10} fill="#334155">
            {k + 1 > n ? `${n + 1}=1` : k + 1}
          </text>
        </g>
      ))}
      {pd.steps.map((s, k) => (
        <text
          key={k}
          x={left + (k + 0.5) * colW}
          y={12}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="#2563eb"
        >
          {s.moves.join(' ')}
        </text>
      ))}
      {pd.actuators.map((a, i) => {
        const y0 = top + i * rowH + rowH - 12;
        const y1 = top + i * rowH + 6;
        const pts = pd.positions[i]
          .map((p, k) => `${left + k * colW},${y0 + (y1 - y0) * p}`)
          .join(' ');
        return (
          <g key={a.id}>
            <text x={8} y={(y0 + y1) / 2 + 4} fontSize={12} fontWeight={700} fill="#1b2230">
              {a.label}
            </text>
            <text x={left - 6} y={y0 + 3} textAnchor="end" fontSize={9} fill="#64748b">
              0
            </text>
            <text x={left - 6} y={y1 + 3} textAnchor="end" fontSize={9} fill="#64748b">
              1
            </text>
            <line x1={left} y1={y0} x2={left + colW * n} y2={y0} stroke="#e2e8f0" />
            <line x1={left} y1={y1} x2={left + colW * n} y2={y1} stroke="#e2e8f0" />
            <polyline
              points={pts}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ Panel
export function Diagrams() {
  const open = useView((s) => s.diagrams);
  const [tab, setTab] = useState<'time' | 'phase'>('time');
  const rec = useRecording();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (!open) return null;
  const pd = rec ? phaseDiagram(rec) : null;

  const exportPng = async () => {
    if (tab === 'time' && canvas.current) {
      canvas.current.toBlob(
        (b) => b && download(`${fileBase()}-espacio-tiempo.png`, b),
        'image/png',
      );
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = svg.width.baseVal.value * 2;
    c.height = svg.height.baseVal.value * 2;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    g.drawImage(img, 0, 0);
    c.toBlob((b) => b && download(`${fileBase()}-espacio-fase.png`, b), 'image/png');
  };

  const exportCsv = () => {
    const r = currentRecorder();
    if (r) download(`${fileBase()}-datos.csv`, new Blob([r.toCSV()], { type: 'text/csv' }));
  };

  return (
    <section className="diagrams" aria-label="Diagramas">
      <div className="diag-head">
        <div className="seg" role="tablist">
          <button
            className={tab === 'time' ? 'on' : ''}
            onClick={() => setTab('time')}
            data-testid="tab-time"
          >
            Espacio-tiempo
          </button>
          <button
            className={tab === 'phase' ? 'on' : ''}
            onClick={() => setTab('phase')}
            data-testid="tab-phase"
          >
            Espacio-fase
          </button>
        </div>
        {pd && pd.steps.length > 0 && (
          <span className="diag-seq" data-testid="phase-sequence">
            Secuencia: {pd.steps.map((s) => s.moves.join(' ')).join(' → ')}
          </span>
        )}
        <span className="spacer" />
        <button className="btn" onClick={exportPng} disabled={!rec?.t.length}>
          PNG
        </button>
        <button className="btn" onClick={exportCsv} disabled={!rec?.t.length}>
          CSV
        </button>
        <button
          className="btn"
          onClick={() => useView.getState().setDiagrams(false)}
          aria-label="Cerrar diagramas"
        >
          ✕
        </button>
      </div>
      <div className="diag-body">
        {!rec || !rec.t.length ? (
          <p className="diag-empty">Inicia la simulación (▶) para registrar los movimientos.</p>
        ) : tab === 'time' ? (
          <TimeChart rec={rec} onCanvas={(c) => (canvas.current = c)} />
        ) : (
          <div className="phase-scroll">
            <PhaseChart pd={pd!} svgRef={svgRef} />
          </div>
        )}
      </div>
    </section>
  );
}
