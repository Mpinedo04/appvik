import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { num } from '../../../core/registry';
import { useSim } from '../../../store/sim';
import { setPressureColor } from '../../../view3d/colors';
import { box, cylY, cylZ } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { partMat, tintMat } from '../../../view3d/materials';
import { useLiveState } from '../../../view3d/useLive';
import { Fitting, Part, Shell, type Model3DProps } from '../../parts3d';

const DIAL_Y = 30;
const R = 18;

const dialCache = new Map<number, THREE.CanvasTexture>();

/** Esfera graduada dibujada en un canvas (una por fondo de escala). */
function dialTexture(range: number): THREE.CanvasTexture {
  let t = dialCache.get(range);
  if (t) return t;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f8fafc';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  g.translate(size / 2, size / 2);
  g.strokeStyle = '#1b2230';
  g.fillStyle = '#1b2230';
  g.font = 'bold 20px Inter, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i <= 10; i++) {
    const a = ((-135 + 27 * i - 90) * Math.PI) / 180;
    g.lineWidth = i % 5 === 0 ? 4 : 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 100, Math.sin(a) * 100);
    g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118);
    g.stroke();
    if (i % 2 === 0)
      g.fillText(String(Math.round((range * i) / 10)), Math.cos(a) * 80, Math.sin(a) * 80);
  }
  g.font = '16px Inter, Segoe UI, sans-serif';
  g.fillText('bar', 0, 40);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  dialCache.set(range, t);
  return t;
}

/** Manómetro de esfera: aguja que gira y tubo de Bourdon visible en rayos X o en corte. */
export function Gauge3D({ compId, mode, params }: Model3DProps) {
  const range = num(params, 'range');
  const needle = useRef<THREE.Group>(null);
  const bourdon = useRef<THREE.Mesh>(null);
  const tubeMat = useMemo(() => tintMat(1), []);
  const see = mode !== 'normal';
  const faceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: dialTexture(range),
        transparent: see,
        opacity: see ? 0.3 : 1,
        roughness: 0.5,
      }),
    [range, see],
  );

  useLiveState(compId, (s: { bar: number } | undefined) => {
    const bar = s?.bar ?? 0;
    const frac = Math.max(0, Math.min(1.05, bar / range));
    // El ángulo crece en sentido horario visto desde arriba.
    if (needle.current) needle.current.rotation.y = -((-135 + 270 * frac) * Math.PI) / 180;
    // El tubo de Bourdon se «desenrolla» un poco con la presión.
    if (bourdon.current) bourdon.current.rotation.y = -0.25 * frac;
    setPressureColor(tubeMat.color, bar, useSim.getState().maxBar);
  });

  const bourdonGeom = useMemo(
    () => new THREE.TorusGeometry(11, 1.5, 10, 48, Math.PI * 1.5).rotateX(Math.PI / 2),
    [],
  );

  return (
    <group>
      {/* Toma de presión: racor, tubo horizontal hasta el centro y columna hasta la esfera */}
      <Fitting at={[0, 30]} out="z+" />
      <Part geom={cylZ(2.2, 10)} mat="brass" position={[0, AXIS_Y, 15]} />
      <Part
        geom={cylY(3, DIAL_Y - AXIS_Y)}
        mat="brass"
        position={[0, (DIAL_Y + AXIS_Y) / 2 - 3, 10]}
      />
      <Part geom={box(6, 6, 6)} mat="brass" position={[0, AXIS_Y, 10]} />
      {/* Caja (en corte se muestra transparente para ver el mecanismo) */}
      <Shell
        geom={cylY(R, 7)}
        mat="black"
        mode={mode === 'cut' ? 'xray' : mode}
        position={[0, DIAL_Y - 2, 0]}
      />
      <mesh
        ref={bourdon}
        geometry={bourdonGeom}
        material={tubeMat}
        position={[0, DIAL_Y - 1.5, 0]}
      />
      <mesh geometry={cylY(R - 1.5, 0.3)} material={faceMat} position={[0, DIAL_Y + 1.6, 0]} />
      <group ref={needle} position={[0, DIAL_Y + 2.2, 0]}>
        <mesh geometry={box(1.1, 0.6, 15)} material={partMat('red')} position={[0, 0, -6]} />
        <mesh geometry={cylY(1.6, 0.8)} material={partMat('black')} />
      </group>
      <mesh geometry={cylY(R - 1, 0.4)} material={partMat('glass')} position={[0, DIAL_Y + 3, 0]} />
    </group>
  );
}
