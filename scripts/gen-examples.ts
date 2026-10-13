/**
 * Genera los circuitos de ejemplo en src/examples/*.json a partir de src/examples/builders.ts.
 * Uso: npm run examples
 */
import { writeFileSync } from 'node:fs';
import { registerAllModels } from '../src/components/models';
import { PROJECT_FORMAT, PROJECT_VERSION } from '../src/core/model/types';
import { EXAMPLE_DEFS } from '../src/examples/builders';

registerAllModels();

for (const ex of EXAMPLE_DEFS) {
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: ex.name,
    description: ex.description,
    circuit: ex.build(),
  };
  writeFileSync(
    new URL(`../src/examples/${ex.file}`, import.meta.url),
    JSON.stringify(project, null, 2) + '\n',
  );
  console.log('escrito', ex.file);
}
