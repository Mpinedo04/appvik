/**
 * Válvula de vías en 3D con su corredera real, deducida de la configuración (spool.ts).
 *
 * El cuerpo fijo tiene un taladro con una ranura anular por cada estación y un conducto desde
 * cada racor hasta su ranura. Dentro se desliza la corredera: un eje con resaltes y juntas.
 * Entre cada dos resaltes queda una cámara anular que comunica las ranuras que tiene encima;
 * así se ve, por ejemplo, cómo al pulsar la cámara pasa a unir 1 con 4 mientras 2 descarga
 * por 3. A los lados, las tapas con los muelles, las cámaras de pilotaje y los accionamientos.
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Params } from '../../../core/model/types';
import { str } from '../../../core/registry';
import { useSim } from '../../../store/sim';
import { setPressureColor } from '../../../view3d/colors';
import { box, cylX, oringX, polylineTube, PolylineSampler, sphere } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { partMat, tintMat } from '../../../view3d/materials';
import { useLiveState, useSimDelta } from '../../../view3d/useLive';
import { Fitting, Part, Shell, Spring, setSpring, type Model3DProps } from '../../parts3d';
import { Actuator3D } from '../actuator3d';
import { boxesExtent, valvePortPos, type WayValveConfig } from './config';
import { allPaths, hasPilot, type WayValveState } from './model';
import {
  chamberPorts,
  GROOVE_FRAC,
  mainStation,
  PITCH,
  solveSpool,
  spoolLands,
  spoolOffset,
  withPitch,
  type SpoolSolution,
} from './spool';

const Y = AXIS_Y;
const BODY_H = 26;
const BODY_D = 40;
const FACE = BODY_D / 2;
/** Radio del taladro, de las ranuras y nivel de los tramos horizontales de los conductos. */
const R_BORE = 5.2;
const R_GROOVE = 7.5;
const CH_LEVEL = 11;
const CH_R = 1.8;
/** Altura (sobre el eje) a la que circulan las partículas por la cámara anular. */
const FLOW_Y = 3.8;
const GALLERY_Y = -10.5;
/** Longitud del muelle con las espiras juntas. */
const SPRING_MIN = 17;
const HOUSING = 20;
const PARTICLES_PER_PATH = 8;

type Side = 'left' | 'right';
const EXTERNAL = (t: string) => !['spring', 'pilot', 'none'].includes(t);

/** Posiciones a lo largo de X de cada pieza (en reposo) para un paso de ranura dado. */
function layout(cfg: WayValveConfig, base: SpoolSolution, pitch: number, p: Params) {
  const sol = withPitch(cfg, base, pitch);
  const lands = spoolLands(cfg, sol);
  const n = cfg.positions.length;
  const strokeX = (sol.stroke * pitch) / 2;
  // Con el accionamiento izquierdo (casilla 0) la corredera va a la derecha.
  const travelR = Math.max(0, cfg.rest * strokeX);
  const travelL = Math.max(0, -(cfg.rest - (n - 1)) * strokeX);
  const xs = sol.stationX;
  const portXs = cfg.ports.map((pc) => valvePortPos(cfg, pc).x);
  const bodyL = Math.min(lands[0].x0 - travelL, xs[0] - pitch / 2, Math.min(...portXs) - 6) - 2;
  const bodyR =
    Math.max(
      lands[lands.length - 1].x1 + travelR,
      xs[xs.length - 1] + pitch / 2,
      Math.max(...portXs) + 6,
    ) + 2;
  const springs3 = n >= 3 && Boolean(p.springs);
  const side = (s: Side) => {
    const act = String(s === 'left' ? p.actLeft : p.actRight);
    const spring = act === 'spring' || springs3;
    const pilot = act === 'pilot';
    // El asiento (en la corredera) no debe entrar en el cuerpo al desplazarse hacia él.
    const toward = s === 'left' ? travelR : travelL;
    const away = s === 'left' ? travelL : travelR;
    const room = spring ? SPRING_MIN + 1 : pilot ? 4 : 3;
    const dir = s === 'left' ? -1 : 1;
    const seat = (s === 'left' ? bodyL : bodyR) + dir * (2 + toward);
    const wall = seat + dir * (away + room);
    // El accionamiento externo está fuera de la tapa y, al pulsar, llega justo hasta ella.
    const rodEnd = EXTERNAL(act) ? wall + dir * (2 + toward) : seat;
    return { act, spring, pilot, seat, wall, rodEnd, dir };
  };
  return { sol, lands, xs, bodyL, bodyR, L: side('left'), R: side('right') };
}

/**
 * El paso más grande (hasta 12) con el que la válvula cabe más o menos en el ancho de su símbolo
 * y las cámaras de pilotaje no tapan sus racores (las correderas de carrera larga, como la 5/3
 * de centro a presión, se hacen algo más finas).
 */
function fitPitch(cfg: WayValveConfig, base: SpoolSolution, p: Params) {
  const ext = boxesExtent(cfg);
  for (let pitch = PITCH; pitch > 6; pitch -= 0.5) {
    const l = layout(cfg, base, pitch, p);
    const okL = l.L.wall - 1 >= ext.left - (l.L.pilot ? 20 : 35);
    const okR = l.R.wall + 1 <= ext.right + (l.R.pilot ? 20 : 35);
    if (okL && okR) return pitch;
  }
  return 6;
}

export function makeWayValve3D(cfg: WayValveConfig) {
  const base = solveSpool(cfg);
  const paths = allPaths(cfg);
  const ext = boxesExtent(cfg);

  return function WayValve3D({ compId, mode, params }: Model3DProps) {
    const actKey = `${str(params, 'actLeft')}|${str(params, 'actRight')}|${Boolean(params.springs)}`;
    const geo = useMemo(() => {
      const pitch = fitPitch(cfg, base, params);
      const l = layout(cfg, base, pitch, params);
      const { sol, xs } = l;
      const portX = (id: string) => valvePortPos(cfg, cfg.ports.find((pc) => pc.id === id)!).x;
      const zSide = (id: string) => (cfg.ports.find((pc) => pc.id === id)!.side === 'top' ? -1 : 1);
      const main = new Map(cfg.ports.map((pc) => [pc.id, mainStation(cfg, sol, pc.id)]));
      // Conducto de cada puerto: del racor a su ranura principal.
      const channel = (id: string) => {
        const px = portX(id);
        const sx = xs[main.get(id)!];
        const z = zSide(id);
        return Math.abs(px - sx) < 0.5
          ? [new THREE.Vector3(px, Y, z * FACE), new THREE.Vector3(px, Y, z * R_GROOVE)]
          : [
              new THREE.Vector3(px, Y, z * FACE),
              new THREE.Vector3(px, Y, z * CH_LEVEL),
              new THREE.Vector3(sx, Y, z * CH_LEVEL),
              new THREE.Vector3(sx, Y, z * R_GROOVE),
            ];
      };
      // Galería bajo el taladro que une las ranuras repetidas de un mismo puerto.
      const gallery = (xa: number, xb: number) => [
        new THREE.Vector3(xa, Y - R_GROOVE + 0.5, 0),
        new THREE.Vector3(xa, Y + GALLERY_Y, 0),
        new THREE.Vector3(xb, Y + GALLERY_Y, 0),
        new THREE.Vector3(xb, Y - R_GROOVE + 0.5, 0),
      ];
      const galleries = cfg.ports.flatMap((pc) =>
        sol.bore
          .map((b, j) => ({ b, j }))
          .filter(({ b, j }) => b === pc.id && j !== main.get(pc.id))
          .map(({ j }) => ({ port: pc.id, pts: gallery(xs[main.get(pc.id)!], xs[j]) })),
      );
      // Recorrido de las partículas de una vía: racor → ranura → cámara anular → ranura → racor.
      const route = (id: string, towardX: number) => {
        let j = main.get(id)!;
        sol.bore.forEach((b, k) => {
          if (b === id && Math.abs(xs[k] - towardX) < Math.abs(xs[j] - towardX)) j = k;
        });
        const pts = channel(id);
        if (j !== main.get(id)) pts.push(...gallery(xs[main.get(id)!], xs[j]).slice(1));
        pts.push(new THREE.Vector3(xs[j], Y + FLOW_Y, 0));
        return pts;
      };
      const flowPaths = paths.map((path) => {
        const a = route(path.from, xs[main.get(path.to)!]);
        const b = route(path.to, xs[main.get(path.from)!]).reverse();
        const pts = [...a, ...b];
        return { sampler: new PolylineSampler(pts) };
      });
      return {
        ...l,
        channels: cfg.ports.map((pc) => polylineTube(channel(pc.id), CH_R, 3, 8)),
        galleries: galleries.map((g) => ({ port: g.port, geom: polylineTube(g.pts, CH_R, 2, 8) })),
        flowPaths,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actKey]);
    const { sol, lands, xs, bodyL, bodyR, L, R } = geo;

    const spool = useRef<THREE.Group>(null);
    const springL = useRef<THREE.InstancedMesh>(null);
    const springR = useRef<THREE.InstancedMesh>(null);
    const pilotL = useRef<THREE.Mesh>(null);
    const pilotR = useRef<THREE.Mesh>(null);
    const particles = useRef<THREE.InstancedMesh>(null);
    const portMats = useMemo(() => cfg.ports.map(() => tintMat(0.95)), []);
    // Conductos translúcidos para que se vean las partículas que circulan por dentro.
    const chanMats = useMemo(() => cfg.ports.map(() => tintMat(0.45)), []);
    const portIndex = useMemo(() => new Map(cfg.ports.map((pc, i) => [pc.id, i])), []);
    const chamberMats = useMemo(() => lands.slice(1).map(() => tintMat(0.55)), [lands]);
    const pilotMatL = useMemo(() => tintMat(0.4), []);
    const pilotMatR = useMemo(() => tintMat(0.4), []);
    const phase = useMemo(() => paths.map(() => 0), []);
    const simDelta = useSimDelta();
    const tmp = useMemo(
      () => ({ v: new THREE.Vector3(), m: new THREE.Matrix4(), c: new THREE.Color() }),
      [],
    );
    const [engaged, setEngaged] = useState({ l: false, r: false });
    const pilotLeft = hasPilot(params, 'left');
    const pilotRight = hasPilot(params, 'right');

    useLiveState<WayValveState>(compId, (s, snap) => {
      const pos = s?.pos ?? cfg.rest;
      const off = spoolOffset(cfg, sol, pos);
      if (spool.current) spool.current.position.x = off;
      if (!!s?.leftOn !== engaged.l || !!s?.rightOn !== engaged.r)
        setEngaged({ l: !!s?.leftOn, r: !!s?.rightOn });
      const maxBar = useSim.getState().maxBar;
      const bar = (id: string) => s?.portBar[id] ?? 0;

      setSpring(springL.current, L.wall, L.seat + off - L.wall);
      setSpring(springR.current, R.seat + off, R.wall - (R.seat + off));
      const chamber = (mesh: THREE.Mesh | null, x0: number, x1: number) => {
        if (!mesh) return;
        mesh.position.x = (x0 + x1) / 2;
        mesh.scale.x = Math.max(0.5, Math.abs(x1 - x0));
      };
      chamber(pilotL.current, L.wall, L.seat + off);
      chamber(pilotR.current, R.seat + off, R.wall);
      setPressureColor(pilotMatL.color, bar(cfg.pilots.left), maxBar);
      setPressureColor(pilotMatR.color, bar(cfg.pilots.right), maxBar);
      cfg.ports.forEach((pc, i) => {
        setPressureColor(portMats[i].color, bar(pc.id), maxBar);
        chanMats[i].color.copy(portMats[i].color);
      });
      // Cada cámara anular tiene la presión de los puertos que toca en este momento.
      chamberPorts(sol, lands, off).forEach((ports, i) => {
        const b = ports.length ? Math.max(...ports.map(bar)) : 0;
        setPressureColor(chamberMats[i].color, s ? b : 0, maxBar);
      });

      const im = particles.current;
      if (!im) return;
      const dtSim = simDelta(snap);
      let idx = 0;
      geo.flowPaths.forEach((fp, i) => {
        const flow = s ? s.flows[i] : 0;
        const open = s ? s.openings[i] : 0;
        const visible = open > 0.05 && Math.abs(flow) > 2e-6;
        const speed = Math.sign(flow) * 300 * Math.sqrt(Math.abs(flow) / 1e-3);
        phase[i] = (phase[i] + (speed * dtSim) / Math.max(1, fp.sampler.length) + 1) % 1;
        setPressureColor(tmp.c, Math.max(bar(paths[i].from), bar(paths[i].to)), maxBar).offsetHSL(
          0,
          0,
          0.18,
        );
        for (let k = 0; k < PARTICLES_PER_PATH; k++, idx++) {
          if (!visible) tmp.m.makeScale(0, 0, 0);
          else {
            fp.sampler.at((phase[i] + k / PARTICLES_PER_PATH + 1) % 1, tmp.v);
            tmp.m.makeTranslation(tmp.v.x, tmp.v.y, tmp.v.z);
          }
          im.setMatrixAt(idx, tmp.m);
          im.setColorAt(idx, tmp.c);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });

    const grooveW = sol.pitch * GROOVE_FRAC;
    const housing = (sd: typeof L) => {
      const x0 = Math.min(sd.wall, sd.dir < 0 ? bodyL : bodyR);
      const x1 = Math.max(sd.wall, sd.dir < 0 ? bodyL : bodyR);
      return (
        <>
          <Shell
            geom={box(x1 - x0 + 2, HOUSING, HOUSING)}
            mat="aluminium"
            mode={mode}
            position={[(x0 + x1) / 2 + sd.dir, Y, 0]}
          />
          {/* Tapa exterior con el paso del eje */}
          <Part
            geom={box(2, HOUSING + 2, HOUSING + 2)}
            mat="anodizedBlue"
            position={[sd.wall + sd.dir, Y, 0]}
          />
        </>
      );
    };

    return (
      <group>
        {/* Cuerpo con el taladro, las ranuras y los conductos */}
        <Shell
          geom={box(bodyR - bodyL, BODY_H, BODY_D)}
          mat="anodizedBlue"
          mode={mode}
          position={[(bodyL + bodyR) / 2, Y, 0]}
        />
        {sol.bore.map((id, j) => (
          <mesh
            key={j}
            geometry={cylX(R_GROOVE, grooveW, 24)}
            material={portMats[portIndex.get(id)!]}
            position={[xs[j], Y, 0]}
          />
        ))}
        {cfg.ports.map((pc, i) => {
          const p = valvePortPos(cfg, pc);
          return (
            <group key={pc.id}>
              <mesh geometry={geo.channels[i]} material={chanMats[i]} />
              <Fitting at={[p.x, p.y]} out={pc.side === 'top' ? 'z-' : 'z+'} />
            </group>
          );
        })}
        {geo.galleries.map((g, i) => (
          <mesh key={i} geometry={g.geom} material={chanMats[portIndex.get(g.port)!]} />
        ))}

        {/* Tapas laterales */}
        {housing(L)}
        {housing(R)}

        {/* Corredera: eje, resaltes con juntas y cámaras anulares entre ellos */}
        <group ref={spool}>
          <Part
            geom={cylX(2.4, Math.abs(R.rodEnd - L.rodEnd))}
            mat="steel"
            position={[(L.rodEnd + R.rodEnd) / 2, Y, 0]}
          />
          {lands.map((ld, i) => {
            const w = ld.x1 - ld.x0;
            const rings = w > sol.pitch * 0.6 ? [ld.x0 + 1.4, ld.x1 - 1.4] : [(ld.x0 + ld.x1) / 2];
            return (
              <group key={i}>
                <Part
                  geom={cylX(R_BORE - 0.25, w)}
                  mat="steel"
                  position={[(ld.x0 + ld.x1) / 2, Y, 0]}
                />
                {rings.map((x) => (
                  <Part key={x} geom={oringX(R_BORE - 0.55, 0.6)} mat="dark" position={[x, Y, 0]} />
                ))}
              </group>
            );
          })}
          {lands.slice(1).map((ld, i) => {
            const x0 = lands[i].x1;
            return (
              <mesh
                key={i}
                geometry={cylX(R_BORE - 0.1, ld.x0 - x0, 24)}
                material={chamberMats[i]}
                position={[(x0 + ld.x0) / 2, Y, 0]}
              />
            );
          })}
          {/* Asientos de muelle / émbolos de pilotaje en los extremos */}
          {(L.spring || L.pilot) && (
            <Part geom={cylX(HOUSING / 2 - 2.5, 2)} mat="aluminium" position={[L.seat, Y, 0]} />
          )}
          {(R.spring || R.pilot) && (
            <Part geom={cylX(HOUSING / 2 - 2.5, 2)} mat="aluminium" position={[R.seat, Y, 0]} />
          )}
          {EXTERNAL(L.act) && (
            <group position={[L.rodEnd, 0, 0]}>
              <Actuator3D type={L.act} engaged={engaged.l} />
            </group>
          )}
          {EXTERNAL(R.act) && (
            <group position={[R.rodEnd, 0, 0]} scale={[-1, 1, 1]}>
              <Actuator3D type={R.act} engaged={engaged.r} />
            </group>
          )}
        </group>

        {/* Partículas por las vías abiertas (fijas al cuerpo) */}
        <instancedMesh
          ref={particles}
          args={[sphere(1.2), partMat('white'), Math.max(1, paths.length * PARTICLES_PER_PATH)]}
          frustumCulled={false}
        />

        {/* Muelles entre la tapa y el asiento de la corredera */}
        {L.spring && <Spring ref={springL} x0={L.wall} length={L.seat - L.wall} />}
        {R.spring && <Spring ref={springR} x0={R.seat} length={R.wall - R.seat} />}

        {/* Pilotajes: cámara de aire entre la tapa y el émbolo de la corredera */}
        {pilotLeft && (
          <>
            <mesh
              ref={pilotL}
              geometry={cylX(HOUSING / 2 - 2, 1)}
              material={pilotMatL}
              position={[0, Y, 0]}
            />
            <Fitting at={[ext.left - 30, 0]} out="x-" />
            <mesh
              geometry={cylX(CH_R, Math.max(0.5, L.wall - (ext.left - 20)))}
              material={pilotMatL}
              position={[(L.wall + ext.left - 20) / 2, Y, 0]}
            />
          </>
        )}
        {pilotRight && (
          <>
            <mesh
              ref={pilotR}
              geometry={cylX(HOUSING / 2 - 2, 1)}
              material={pilotMatR}
              position={[0, Y, 0]}
            />
            <Fitting at={[ext.right + 30, 0]} out="x+" />
            <mesh
              geometry={cylX(CH_R, Math.max(0.5, ext.right + 20 - R.wall))}
              material={pilotMatR}
              position={[(R.wall + ext.right + 20) / 2, Y, 0]}
            />
          </>
        )}
      </group>
    );
  };
}
