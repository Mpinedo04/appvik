/**
 * Genera los circuitos de ejemplo en src/examples/*.json.
 * Uso: npx vite-node scripts/gen-examples.ts
 */
import { writeFileSync } from 'node:fs';
import { registerAllModels } from '../src/components/models';
import { CircuitBuilder } from '../src/core/model/builder';
import { PROJECT_FORMAT, PROJECT_VERSION, type Circuit } from '../src/core/model/types';

registerAllModels();

function save(file: string, name: string, description: string, circuit: Circuit) {
  const project = { format: PROJECT_FORMAT, version: PROJECT_VERSION, name, description, circuit };
  writeFileSync(
    new URL(`../src/examples/${file}`, import.meta.url),
    JSON.stringify(project, null, 2) + '\n',
  );
  console.log('escrito', file);
}

// 01 · Mando directo de un cilindro de doble efecto
{
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 120);
  const valve = b.add('pneu-valve-52', 270, 260);
  const src = b.add('pneu-supply', 300, 400);
  const gauge = b.add('pneu-gauge', 450, 270);
  b.connect(valve, '4', cyl, '1');
  b.connect(valve, '2', cyl, '2');
  const feed = b.connect(src, '1', valve, '1');
  b.tee(feed, 300, 330, gauge, '1');
  save(
    '01-mando-directo-cilindro.json',
    'Mando directo de un cilindro de doble efecto',
    'Al mantener pulsada la válvula 5/2 el cilindro avanza; al soltarla, el muelle devuelve la válvula y el cilindro retrocede.',
    b.circuit,
  );
}

// 99 · Prueba de rendimiento: 12 mandos directos (48 componentes)
{
  const b = new CircuitBuilder();
  for (let i = 0; i < 12; i++) {
    const ox = (i % 4) * 300;
    const oy = Math.floor(i / 4) * 360;
    const cyl = b.add('pneu-cyl-double', 300 + ox, 120 + oy);
    const valve = b.add('pneu-valve-52', 270 + ox, 260 + oy, {
      actLeft: i % 2 ? 'lever' : 'pushbutton',
    });
    const src = b.add('pneu-supply', 300 + ox, 400 + oy);
    const sil = b.add('pneu-silencer', 330 + ox, 330 + oy);
    b.connect(valve, '4', cyl, '1');
    b.connect(valve, '2', cyl, '2');
    b.connect(src, '1', valve, '1');
    b.connect(valve, '3', sil, '1');
  }
  save(
    '99-prueba-rendimiento.json',
    'Prueba de rendimiento (48 componentes)',
    'Doce mandos directos para comprobar la fluidez de la simulación y de la vista 3D.',
    b.circuit,
  );
}
