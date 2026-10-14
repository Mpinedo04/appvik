/**
 * Válvula de vías en 3D, estilo «esquema ISO» (la otra opción es la corredera real, Model3D.tsx).
 *
 * La carcasa (con los racores) está fija bajo la casilla de reposo. Dentro se desliza un carro
 * con una cámara por cada posición; cada cámara lleva los conductos de esa posición. Al
 * accionar la válvula, el carro se desplaza y la cámara correspondiente queda bajo los
 * racores: es exactamente lo que representa el símbolo ISO, pero visto por dentro.
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { str } from '../../../core/registry';
import { maxBarFor } from '../../../store/sim';
import { setPressureColor } from '../../../view3d/colors';
import { box, cylX, cylZ, polylineTube, PolylineSampler, sphere } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { partMat, tintMat } from '../../../view3d/materials';
import { useLiveState, useSimDelta } from '../../../view3d/useLive';
import { Fitting, Part, Shell, Spring, setSpring, type Model3DProps } from '../../parts3d';
import { Actuator3D } from '../actuator3d';
import { boxesExtent, spoolShift, valvePortPos, type WayValveConfig } from './config';
import { allPaths, hasPilot, type WayValveState } from './model';

const BLOCK_H = 18;
const BLOCK_D = 34;
const FACE = BLOCK_D / 2;
const HOUSING_D = 44;
const PARTICLES_PER_PATH = 6;

export function makeWayValveIso3D(cfg: WayValveConfig) {
  const W = cfg.boxW;
  const n = cfg.positions.length;
  const ext = boxesExtent(cfg);
  const paths = allPaths(cfg);
  const minShift = (cfg.rest - (n - 1)) * W;
  const maxShift = cfg.rest * W;

  // Conductos de cada vía, en coordenadas del carro (posición de reposo).
  const channels = paths.map((path, g) => {
    const ox = (path.box - cfg.rest) * W;
    const inBox = paths.filter((p) => p.box === path.box);
    const k = inBox.indexOf(path);
    const y = AXIS_Y + (k - (inBox.length - 1) / 2) * 5;
    const pf = cfg.ports.find((p) => p.id === path.from)!;
    const pt = cfg.ports.find((p) => p.id === path.to)!;
    const xf = ox + W / 2 + pf.col;
    const xt = ox + W / 2 + pt.col;
    const zf = pf.side === 'top' ? -FACE : FACE;
    const zt = pt.side === 'top' ? -FACE : FACE;
    const pts =
      xf === xt
        ? [new THREE.Vector3(xf, y, zf), new THREE.Vector3(xt, y, zt)]
        : [
            new THREE.Vector3(xf, y, zf),
            new THREE.Vector3(xf, y, 0),
            new THREE.Vector3(xt, y, 0),
            new THREE.Vector3(xt, y, zt),
          ];
    return {
      g,
      box: path.box,
      pts,
      geom: polylineTube(pts, 2.2, 4),
      sampler: new PolylineSampler(pts),
    };
  });

  return function WayValve3D({ compId, mode, params }: Model3DProps) {
    const carriage = useRef<THREE.Group>(null);
    const springL = useRef<THREE.InstancedMesh>(null);
    const springR = useRef<THREE.InstancedMesh>(null);
    const pilotL = useRef<THREE.Mesh>(null);
    const pilotR = useRef<THREE.Mesh>(null);
    const particles = useRef<THREE.InstancedMesh>(null);
    const chanMats = useMemo(() => channels.map(() => tintMat(0.95)), []);
    const portMats = useMemo(() => cfg.ports.map(() => tintMat(0.95)), []);
    const pilotMatL = useMemo(() => tintMat(0.35), []);
    const pilotMatR = useMemo(() => tintMat(0.35), []);
    const phase = useMemo(() => channels.map(() => 0), []);
    const simDelta = useSimDelta();
    const tmp = useMemo(
      () => ({ v: new THREE.Vector3(), m: new THREE.Matrix4(), c: new THREE.Color() }),
      [],
    );

    const actLeft = str(params, 'actLeft');
    const actRight = str(params, 'actRight');
    const springsCenter = n >= 3 && Boolean(params.springs);
    const springLeft = actLeft === 'spring' || springsCenter;
    const springRight = actRight === 'spring' || springsCenter;
    const pilotLeft = hasPilot(params, 'left');
    const pilotRight = hasPilot(params, 'right');
    const anchorL = ext.left + minShift - 16;
    const anchorR = ext.right + maxShift + 16;
    const [engaged, setEngaged] = useState({ l: false, r: false });

    useLiveState<WayValveState>(compId, (s, snap) => {
      const pos = s?.pos ?? cfg.rest;
      const shift = spoolShift(cfg, pos);
      if (carriage.current) carriage.current.position.x = shift;
      if (!!s?.leftOn !== engaged.l || !!s?.rightOn !== engaged.r)
        setEngaged({ l: !!s?.leftOn, r: !!s?.rightOn });
      const maxBar = maxBarFor(cfg.medium);
      const leftEnd = ext.left + shift;
      const rightEnd = ext.right + shift;
      setSpring(springL.current, anchorL, leftEnd - anchorL);
      setSpring(springR.current, rightEnd, anchorR - rightEnd);
      const pilotPos = (mesh: THREE.Mesh | null, x0: number, x1: number) => {
        if (!mesh) return;
        mesh.position.x = (x0 + x1) / 2;
        mesh.scale.x = Math.max(0.5, Math.abs(x1 - x0));
      };
      pilotPos(pilotL.current, ext.left - 20, leftEnd);
      pilotPos(pilotR.current, rightEnd, ext.right + 20);
      setPressureColor(pilotMatL.color, s?.portBar[cfg.pilots.left] ?? 0, maxBar, cfg.medium);
      setPressureColor(pilotMatR.color, s?.portBar[cfg.pilots.right] ?? 0, maxBar, cfg.medium);

      cfg.ports.forEach((pc, i) =>
        setPressureColor(portMats[i].color, s?.portBar[pc.id] ?? 0, maxBar, cfg.medium),
      );
      channels.forEach((ch, i) => {
        const path = paths[ch.g];
        const live = s ? Math.max(s.portBar[path.from] ?? 0, s.portBar[path.to] ?? 0) : 0;
        // Sólo la cámara que está bajo los racores lleva aire; las demás quedan a 0 bar.
        const open = s ? s.openings[ch.g] : 0;
        setPressureColor(chanMats[i].color, open > 0.02 ? live : 0, maxBar, cfg.medium);
      });

      // Partículas por los conductos abiertos.
      const im = particles.current;
      if (!im) return;
      const dtSim = simDelta(snap);
      let idx = 0;
      channels.forEach((ch, i) => {
        const flow = s ? s.flows[ch.g] : 0;
        const open = s ? s.openings[ch.g] : 0;
        const visible = open > 0.05 && Math.abs(flow) > 2e-6;
        const speed = Math.sign(flow) * 300 * Math.sqrt(Math.abs(flow) / 1e-3);
        phase[i] = (phase[i] + (speed * dtSim) / Math.max(1, ch.sampler.length)) % 1;
        const bar = s
          ? Math.max(s.portBar[paths[ch.g].from] ?? 0, s.portBar[paths[ch.g].to] ?? 0)
          : 0;
        setPressureColor(tmp.c, bar, maxBar, cfg.medium).offsetHSL(0, 0, 0.18);
        for (let k = 0; k < PARTICLES_PER_PATH; k++, idx++) {
          if (!visible) {
            tmp.m.makeScale(0, 0, 0);
          } else {
            const u = (phase[i] + k / PARTICLES_PER_PATH + 1) % 1;
            ch.sampler.at(u, tmp.v);
            tmp.m.makeTranslation(tmp.v.x, tmp.v.y, tmp.v.z);
          }
          im.setMatrixAt(idx, tmp.m);
          im.setColorAt(idx, tmp.c);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });

    return (
      <group>
        {/* Carcasa fija con los racores, bajo la casilla de reposo */}
        <Shell
          geom={box(W + 6, 28, HOUSING_D)}
          mat="anodizedBlue"
          mode={mode}
          position={[W / 2, AXIS_Y, 0]}
        />
        {cfg.ports.map((pc, i) => {
          const p = valvePortPos(cfg, pc);
          const z = pc.side === 'top' ? -1 : 1;
          return (
            <group key={pc.id}>
              <mesh
                geometry={cylZ(2.2, HOUSING_D / 2 - FACE + 1)}
                material={portMats[i]}
                position={[p.x, AXIS_Y, z * (FACE + (HOUSING_D / 2 - FACE) / 2)]}
              />
              <Fitting at={[p.x, p.y]} out={pc.side === 'top' ? 'z-' : 'z+'} />
            </group>
          );
        })}

        {/* Carro con una cámara por posición */}
        <group ref={carriage}>
          {cfg.positions.map((pos, i) => {
            const ox = (i - cfg.rest) * W;
            return (
              <group key={i}>
                <Shell
                  geom={box(W - 2, BLOCK_H, BLOCK_D)}
                  mat="spool"
                  mode={mode}
                  position={[ox + W / 2, AXIS_Y, 0]}
                />
                {pos.blocked.map((id) => {
                  const pc = cfg.ports.find((p) => p.id === id)!;
                  const z = pc.side === 'top' ? -FACE : FACE;
                  return (
                    <Part
                      key={id}
                      geom={cylZ(3.2, 2)}
                      mat="dark"
                      position={[ox + W / 2 + pc.col, AXIS_Y, z]}
                    />
                  );
                })}
              </group>
            );
          })}
          {channels.map((ch, i) => (
            <mesh key={ch.g} geometry={ch.geom} material={chanMats[i]} />
          ))}
          <instancedMesh
            ref={particles}
            args={[
              sphere(1.3),
              partMat('white'),
              Math.max(1, channels.length * PARTICLES_PER_PATH),
            ]}
            frustumCulled={false}
          />
          {/* Tapas del carro y accionamientos */}
          <Part
            geom={box(2, BLOCK_H + 4, BLOCK_D - 6)}
            mat="aluminium"
            position={[ext.left - 1, AXIS_Y, 0]}
          />
          <Part
            geom={box(2, BLOCK_H + 4, BLOCK_D - 6)}
            mat="aluminium"
            position={[ext.right + 1, AXIS_Y, 0]}
          />
          <group position={[ext.left - 2, 0, 0]}>
            <Actuator3D type={actLeft} engaged={engaged.l} />
          </group>
          <group position={[ext.right + 2, 0, 0]} scale={[-1, 1, 1]}>
            <Actuator3D type={actRight} engaged={engaged.r} />
          </group>
        </group>

        {/* Muelles (anclados a una tapa fija; se comprimen al desplazarse el carro) */}
        {springLeft && (
          <>
            <Spring ref={springL} x0={anchorL} length={1} z={actLeft === 'spring' ? 0 : 10} />
            <Part
              geom={box(2, 16, 16)}
              mat="aluminium"
              position={[anchorL - 1, AXIS_Y, actLeft === 'spring' ? 0 : 10]}
            />
          </>
        )}
        {springRight && (
          <>
            <Spring ref={springR} x0={ext.right} length={1} z={actRight === 'spring' ? 0 : 10} />
            <Part
              geom={box(2, 16, 16)}
              mat="aluminium"
              position={[anchorR + 1, AXIS_Y, actRight === 'spring' ? 0 : 10]}
            />
          </>
        )}

        {/* Pilotajes: cámara de aire que empuja el carro */}
        {pilotLeft && (
          <>
            <mesh
              ref={pilotL}
              geometry={cylX(7, 1)}
              material={pilotMatL}
              position={[0, AXIS_Y, 0]}
            />
            <Fitting at={[ext.left - 30, 0]} out="x-" />
            <Part geom={box(2, 18, 18)} mat="aluminium" position={[ext.left - 21, AXIS_Y, 0]} />
          </>
        )}
        {pilotRight && (
          <>
            <mesh
              ref={pilotR}
              geometry={cylX(7, 1)}
              material={pilotMatR}
              position={[0, AXIS_Y, 0]}
            />
            <Fitting at={[ext.right + 30, 0]} out="x+" />
            <Part geom={box(2, 18, 18)} mat="aluminium" position={[ext.right + 21, AXIS_Y, 0]} />
          </>
        )}
      </group>
    );
  };
}
