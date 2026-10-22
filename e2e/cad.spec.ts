import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { loadExample } from './util';

const STEP = 'node_modules/occt-import-js/test/testfiles/cax-if/as1-oc-214/as1-oc-214.stp';

async function download(page: Page, testId: string) {
  await page.getByTestId('cad-menu').click();
  const [d] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByTestId(testId).click(),
  ]);
  return { name: d.suggestedFilename(), data: readFileSync((await d.path())!) };
}

/** Posición en el mundo de la pieza CAD (centro de su caja). */
const partX = (page: Page) =>
  page.evaluate(() => {
    const { sceneApi, useProject } = (window as any).__fluid;
    const id = (
      Object.values(useProject.getState().circuit.components).find(
        (c: any) => c.type === 'cad-part',
      ) as any
    ).id;
    let x: number | null = null;
    sceneApi.root()?.traverse((o: any) => {
      if (x === null && o.isMesh && o.parent?.parent?.parent?.parent?.userData.compId === id) {
        o.updateWorldMatrix(true, false);
        x = o.matrixWorld.elements[12];
      }
    });
    return x as number | null;
  });

test('SolidWorks: importar un STEP, unirlo al cilindro y exportar DXF, STL y 3MF', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await loadExample(page, '02-mando-indirecto');

  // Importar el conjunto STEP (lo lee OpenCascade en WebAssembly).
  await page.getByTestId('cad-menu').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('cad-import').click(),
  ]);
  await chooser.setFiles(STEP);
  await expect(page.locator('body')).toContainText('Importada', {
    timeout: 60000,
  });
  const part = await page.evaluate(() => {
    const { useProject } = (window as any).__fluid;
    return Object.values(useProject.getState().circuit.components).find(
      (c: any) => c.type === 'cad-part',
    ) as any;
  });
  expect(part.params.mesh.startsWith('z:')).toBe(true);
  expect(part.params.unit).toBe('mm');
  await expect(page.locator('#circuit-svg [data-type="cad-part"]')).toBeVisible();

  // Unirla al vástago del cilindro 1A desde el panel de propiedades.
  const follow = page.locator('label.field', { hasText: 'Unida al actuador' }).locator('input');
  await follow.fill('1A');
  await follow.press('Enter');
  await expect.poll(() => partX(page), { timeout: 20000 }).not.toBeNull();
  const x0 = (await partX(page))!;

  // Simular: al pulsar 1S1 el cilindro sale y la pieza se desplaza con el vástago.
  await page.evaluate(() => {
    const { useSim, useProject } = (window as any).__fluid;
    useSim.getState().start();
    const s1 = Object.values(useProject.getState().circuit.components).find(
      (c: any) => c.label === '1S1',
    ) as any;
    useSim.getState().press(s1.id);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__fluid.useSim.getState().snapshot?.comp, {}), {
      timeout: 20000,
    })
    .toBeTruthy();
  await expect
    .poll(async () => ((await partX(page)) ?? x0) - x0, { timeout: 30000 })
    .toBeGreaterThan(0.5);
  await page.evaluate(() => (window as any).__fluid.useSim.getState().stop());
  await expect
    .poll(async () => Math.abs(((await partX(page)) ?? 0) - x0), { timeout: 10000 })
    .toBeLessThan(0.01);

  // Esquema a DXF
  const dxf = await download(page, 'cad-export-dxf');
  expect(dxf.name).toMatch(/\.dxf$/);
  const text = dxf.data.toString('latin1');
  expect(text).toContain('AC1009');
  expect(text).toMatch(/\r\nTEXT\r\n[\s\S]*\r\n1V1\r\n/);
  expect((text.match(/\r\nPOLYLINE\r\n/g) ?? []).length).toBeGreaterThan(10);
  expect(text.trimEnd().endsWith('EOF')).toBe(true);

  // Modelo 3D a STL (binario: 84 bytes + 50 por triángulo)
  const stl = await download(page, 'cad-export-stl');
  const n = stl.data.readUInt32LE(80);
  expect(n).toBeGreaterThan(10000);
  expect(stl.data.length).toBe(84 + 50 * n);

  // Modelo 3D a 3MF (ZIP con el modelo)
  const mf = await download(page, 'cad-export-3mf');
  expect(mf.data.subarray(0, 2).toString()).toBe('PK');
  const model = strFromU8(unzipSync(new Uint8Array(mf.data))['3D/3dmodel.model']);
  expect(model).toContain('unit="millimeter"');
  expect(model).toContain('name="1A"');
  expect(model).toContain('name="CAD1"');

  expect(errors).toEqual([]);
});
