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
