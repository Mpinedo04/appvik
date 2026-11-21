import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../components/models';
import { evalForceProfile, parseForceProfile } from '../components/pneumatic/cylinder-core';
import { resolvePositions } from '../components/pneumatic/way-valve/config';
import { VALVE_52 } from '../components/pneumatic/way-valve/config';
import {
  addComponent,
  changeComponentType,
  connect,
  flipItemsY,
  validate,
} from '../core/model/edit';
import { localToWorld, transformDir } from '../core/model/geometry';
import { emptyCircuit } from '../core/model/types';
import { Simulation } from '../core/sim/engine';
import { parseProject } from '../store/project';
import { decompressFluidSimCt, importFluidSimCt } from './fluidsim';

beforeAll(registerAllModels);

/** Empaqueta un cuerpo textual de FluidSIM en el formato binario comprimido (solo literales + XOR 0x9A). */
function encodeMockCt(body: string): Uint8Array {
  const header = new Uint8Array([0x50, 0xc2, 0xe8, 0xb3, 0x55, 0x7f, 0xce, 0xce, 0x0d, 0x0a]);
  const params = new Uint8Array([
    0x01, 0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x08, 0x10, 0x00, 0x0b, 0x00, 0x9a, 0x00, 0x30, 0x00,
  ]);
  const plain = new TextEncoder().encode(`ENDCOPREVIEW\n${body}`);
  const chunks: number[] = [...params];
  for (let i = 0; i < plain.length; i += 120) {
    const slice = plain.subarray(i, Math.min(plain.length, i + 120));
    chunks.push(0x80 + slice.length);
    for (const b of slice) chunks.push(b);
  }
  const out = new Uint8Array(header.length + chunks.length);
  out.set(header, 0);
  for (let i = 0; i < chunks.length; i++) out[header.length + i] = chunks[i] ^ 0x9a;
  return out;
}

const SAMPLE_CT_TEXT = `PPE1 O0 20480 409600 36864 425984 270 0 0
 S P_LIM F 6
 S FLOW F 1000
PConnection O1 30720 412672 40960 422912 0 0 0
CylDGPPAB O2 307200 102400 364544 135168 0 0 0
 S description S Double acting cylinder
 S HUB F 100
PConnection O3 311296 131072 321536 141312 0 0 0
PConnection O4 360448 131072 370688 141312 0 0 0
WV_5 O5 286720 245760 397312 282624 0 0 0
 S SPRING_L S FALSE
 S SPRING_R S TRUE
 S ACTUATION_L_EL_PN S AL_PE2
 S ACTUATION_R_EL_PN S ARN
 S NN_FLOW F 500
PConnection O6 337920 245760 348160 256000 0 0 0
PConnection O7 362496 245760 372736 256000 0 0 0
PConnection O8 337920 282624 348160 292864 0 0 0
PConnection O9 350208 282624 360448 292864 0 0 0
PConnection O10 362496 282624 372736 292864 0 0 0
PConnection O11 286720 266240 296960 276480 0 0 0
PConnection O12 397312 266240 407552 276480 0 0 0
WV_3 O13 102400 327680 188416 364544 0 0 0
 S SPRING_L S FALSE
 S SPRING_R S TRUE
 S ACTUATION_L_MA S AL_MA3
 S POS_RESET S (2\tC3C)
 S NN_FLOW F 120
PConnection O14 143360 327680 153600 337920 0 0 0
PConnection O15 143360 364544 153600 374784 0 0 0
PConnection O16 155648 364544 165888 374784 0 0 0
PTriconnection O17 143360 409600 155648 421888 0 0 0
PConnection O18 143360 409600 155648 421888 0 0 0
PConnection O19 143360 409600 155648 421888 0 0 0
PConnection O20 143360 409600 155648 421888 0 0 0
R_SCHALT O21 317440 75776 353280 87040 0 0 0
 S label0 S 1A0
 S pos0 F 0
 S label1 S 1A1
 S pos1 F 100
text O22 286720 102400 307200 122880 0 0 0
 S text S 1A
text O23 266240 245760 286720 266240 0 0 0
 S text S 1V1
text O24 81920 327680 102400 348160 0 0 0
 S text S 1S1
0 0 0 # 0 0 0 0 0 0
gate1 # 0 1
CON PLine 1 18
 S Style I 2
gate1 # 2 3
gate2 # 2 4
CON PLine 3 6
 S Style I 2
CON PLine 4 7
 S Style I 2
gate1 # 5 6
gate2 # 5 7
gate3 # 5 8
gate4 # 5 9
gate5 # 5 10
gate6 # 5 11
gate7 # 5 12
CON PLine 9 19
 S Style I 2
CON PLine 11 14
 S Style I 4
gate1 # 13 14
gate2 # 13 15
gate3 # 13 16
CON PLine 15 20
 S Style I 4
gate1 # 17 18
gate2 # 17 19
gate3 # 17 20
ENDCT
ENDSYM
`;

describe('importador de FluidSIM (.ct)', () => {
  it('descomprime e importa un circuito binario .ct como proyecto válido de FluidLab 3D', () => {
    const bytes = encodeMockCt(SAMPLE_CT_TEXT);
    expect(decompressFluidSimCt(bytes)).toContain('CylDGPPAB');

    const { project, warnings, stats } = importFluidSimCt(bytes, 'mando_indirecto.ct');
    expect(warnings).toEqual([]);
    expect(stats.components).toBe(4);
    expect(stats.connections).toBe(6);
    expect(stats.junctions).toBe(1);

    // Pasa la validación oficial de FluidLab 3D (round-trip JSON)
    const validated = parseProject(JSON.stringify(project));
    expect(validated.name).toBe('mando_indirecto');

    const comps = Object.values(validated.circuit.components);
    const cyl = comps.find((c) => c.type === 'pneu-cyl-double');
    const v52 = comps.find((c) => c.type === 'pneu-valve-52-pilot');
    const btn = comps.find((c) => c.type === 'pneu-valve-32nc');
    expect(cyl?.label).toBe('1A');
    expect(cyl?.params.marks).toBe('1A0@0; 1A1@100');
    expect(v52?.label).toBe('1V1');
    expect(btn?.label).toBe('1S1');
  });

  it('el circuito importado simula correctamente al pulsar la válvula 3/2', () => {
    const { project } = importFluidSimCt(encodeMockCt(SAMPLE_CT_TEXT), 'sim.ct');
    const sim = new Simulation(project.circuit);
    const comps = Object.values(project.circuit.components);
    const cyl = comps.find((c) => c.type === 'pneu-cyl-double')!;
    const btn = comps.find((c) => c.type === 'pneu-valve-32nc')!;

    sim.advance(0.3);
    expect(sim.state(cyl.id).pos).toBeLessThan(0.01);

    sim.userAction(btn.id, 'press');
    sim.advance(0.8);
    expect(sim.state(cyl.id).pos).toBeGreaterThan(0.95);

    sim.userAction(btn.id, 'release');
    sim.advance(0.8);
    expect(sim.state(cyl.id).pos).toBeLessThan(0.05);
  });

  it('rechaza archivos que no son FluidSIM .ct', () => {
    expect(() => decompressFluidSimCt(new Uint8Array([1, 2, 3, 4]))).toThrow(/FluidSIM/);
  });

  it('conserva estilos ISO 1219 (pilot/work) y enruta en L desde las derivaciones sin líneas extra', () => {
    const { project } = importFluidSimCt(encodeMockCt(SAMPLE_CT_TEXT), 'styles.ct');
    const conns = Object.values(project.circuit.connections);
    const pilots = conns.filter((c) => c.style === 'pilot');
    const works = conns.filter((c) => c.style === 'work');
    expect(pilots.length).toBe(2);
    expect(works.length).toBe(4);

    // La conexión de la derivación al puerto 1 de 1V1 debe ser un único codo en L sobre la Y de la derivación
    const v52 = Object.values(project.circuit.components).find(
      (c) => c.type === 'pneu-valve-52-pilot',
    )!;
    const j = Object.values(project.circuit.junctions)[0];
    const supplyToV52 = conns.find(
      (c) =>
        (c.a.kind === 'port' && c.a.comp === v52.id && c.a.port === '1') ||
        (c.b.kind === 'port' && c.b.comp === v52.id && c.b.port === '1'),
    )!;
    expect(supplyToV52.points.length).toBeLessThanOrEqual(1);
    if (supplyToV52.points.length === 1) {
      expect(supplyToV52.points[0].y).toBe(j.y);
    }
  });

  it('soporta señal dominante, posición inicial y tapón de escape en válvulas', () => {
    const c = emptyCircuit();
    const sup = addComponent(c, 'pneu-supply', 0, 200, { pressure: 6 });
    const v = addComponent(c, 'pneu-valve-52', 200, 100, {
      actLeft: 'pushbutton',
      actRight: 'pushbutton',
      dominant: 'left',
      initPos: '0',
      ex_3: 'plug',
    });
    connect(c, { kind: 'port', comp: sup, port: '1' }, { kind: 'port', comp: v, port: '1' });

    const sim = new Simulation(c);
    // Posición inicial en casilla izquierda (0)
    expect(sim.state(v).pos).toBe(0);
    // Al accionar ambos lados, prevalece el lado dominante ('left' -> casilla 0)
    sim.userAction(v, 'press', 'right');
    sim.advance(0.1);
    expect(sim.state(v).pos).toBe(1);
    sim.userAction(v, 'press', 'left');
    sim.advance(0.1);
    expect(sim.state(v).pos).toBe(0);

    // Cambio de cuerpo de válvula en caliente conservando la conexión al puerto 1
    changeComponentType(c, v, 'pneu-valve-53-closed');
    expect(c.components[v].type).toBe('pneu-valve-53-closed');
    expect(Object.keys(c.connections).length).toBe(1);
  });

  it('soporta casillas personalizadas (hasta 4 pos.), muelle neumático, espejo vertical, texto libre y perfil de fuerza', () => {
    // 1. Casillas personalizadas (4 posiciones)
    const customPos = resolvePositions(VALVE_52, { customBoxes: 'left,closed,exhaust,right' });
    expect(customPos.length).toBe(4);
    expect(customPos[1].blocked).toContain('1');

    // 2. Espejo vertical (flipY)
    const c = emptyCircuit();
    const id = addComponent(c, 'pneu-valve-32nc', 100, 100, { actRight: 'pneu-spring' });
    flipItemsY(c, [id]);
    expect(c.components[id].flipY).toBe(true);
    expect(localToWorld(c.components[id], { x: 10, y: 20 })).toEqual({ x: 110, y: 80 });
    expect(transformDir(c.components[id], 'down')).toBe('up');

    // 3. Texto libre y cajetín sin puertos abiertos
    addComponent(c, 'util-text', 200, 200, { text: 'Ejercicio 5' });
    addComponent(c, 'util-titleblock', 300, 300, { title: 'Examen Neumática' });
    const issues = validate(c).filter((i) => !i.comp.includes(id));
    expect(issues).toEqual([]);

    // 4. Perfil de fuerza por tramos
    const pts = parseForceProfile('0:0; 50:100; 100:300');
    expect(evalForceProfile(pts, 25)).toBeCloseTo(50, 5);
    expect(evalForceProfile(pts, 75)).toBeCloseTo(200, 5);
  });

  it('importa circuitos hidráulicos y eléctricos de FluidSIM (.ct) junto con textos libres', () => {
    const hydElecCt = `Ag1 O0 102400 307200 122880 327680 0 0 0
 S FLOW F 6
 S P_LIM F 80
HConnection O1 107520 302080 117760 312320 0 0 0
tank1 O2 163840 307200 176128 319488 0 0 0
HConnection O3 164864 302080 175104 312320 0 0 0
CylH3 O4 102400 61440 163840 94208 0 0 0
 S HUB F 200
 S ALPHA F 90
HConnection O5 107520 89088 117760 99328 0 0 0
HConnection O6 153600 89088 163840 99328 0 0 0
HWV_4 O7 102400 184320 184320 221184 0 0 0
 S ACTUATION_L_EL_PN S AL_EL1
 S SPRING_R S TRUE
HConnection O8 122880 179200 133120 189440 0 0 0
HConnection O9 135168 179200 145408 189440 0 0 0
HConnection O10 122880 216064 133120 226304 0 0 0
HConnection O11 135168 216064 145408 226304 0 0 0
UEConnection O12 102400 199680 112640 209920 0 0 0
 S label S Y1
pol2 O13 307200 81920 322560 88064 0 0 0
EConnection O14 317440 79872 327680 90112 0 0 0
pol1 O15 307200 286720 322560 292864 0 0 0
EConnection O16 317440 284672 327680 294912 0 0 0
schliesser O17 307200 143360 322560 174080 0 0 0
 S label S S1
EConnection O18 317440 138240 327680 148480 0 0 0
EConnection O19 317440 168960 327680 179200 0 0 0
magnet O20 307200 215040 348160 245760 0 0 0
 S label S Y1
EConnection O21 317440 209920 327680 220160 0 0 0
EConnection O22 317440 240640 327680 250880 0 0 0
text O23 102400 20480 204800 40960 0 0 0
 S text S Ejercicio Hidraulico
0 0 0 # 0 0 0 0 0 0
gate1 # 0 1
gate1 # 2 3
gate1 # 4 5
gate2 # 4 6
gate1 # 7 8
gate2 # 7 9
gate3 # 7 10
gate4 # 7 11
gate5 # 7 12
CON HLine 1 10
 S Style I 2
CON HLine 3 11
 S Style I 2
CON HLine 5 8
 S Style I 2
CON HLine 6 9
 S Style I 2
gate1 # 13 14
gate1 # 15 16
gate1 # 17 18
gate2 # 17 19
gate1 # 20 21
gate2 # 20 22
CON ELine 14 18
CON ELine 19 21
CON ELine 22 16
ENDCT
ENDSYM
`;
    const { project, warnings } = importFluidSimCt(encodeMockCt(hydElecCt), 'electrohyd.ct');
    expect(warnings).toEqual([]);
    const comps = Object.values(project.circuit.components);
    expect(comps.some((x) => x.type === 'hyd-power-unit')).toBe(true);
    expect(comps.some((x) => x.type === 'hyd-cyl-double' && x.params.angle === 90)).toBe(true);
    expect(comps.some((x) => x.type === 'hyd-valve-42' && x.params.solLeft === 'Y1')).toBe(true);
    expect(comps.some((x) => x.type === 'elec-solenoid' && x.label === 'Y1')).toBe(true);
    expect(comps.some((x) => x.type === 'util-text' && x.params.text === 'Ejercicio Hidraulico')).toBe(true);

    const conns = Object.values(project.circuit.connections);
    expect(conns.filter((x) => x.medium === 'hyd').length).toBe(4);
    expect(conns.filter((x) => x.medium === 'elec').length).toBe(3);
  });
});
