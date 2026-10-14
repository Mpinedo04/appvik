import { expect, test } from '@playwright/test';
import { loadExample } from './util';

test('electroneumática: al pulsar S1 en el lienzo el relé se enclava y la lámpara se enciende', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await loadExample(page, '08-enclavamiento-marcha-paro');
  await page.getByTestId('layout-2d').click();
  await page.getByTestId('sim-start').click();

  const ids = await page.evaluate(() => {
    const { useProject } = (window as any).__fluid;
    const c = Object.values(useProject.getState().circuit.components) as any[];
    const by = (label: string, type: string) =>
      c.find((x) => x.label === label && x.type === type).id;
    return {
      s1: by('S1', 'elec-button-no'),
      h1: by('H1', 'elec-lamp'),
      k1: by('K1', 'elec-relay'),
    };
  });
  // Clic (pulsar y soltar) sobre el símbolo de S1.
  const box = (await page.locator(`[data-kind="comp"][data-id="${ids.s1}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(800);

  const state = await page.evaluate(({ h1, k1 }) => {
    const { useSim } = (window as any).__fluid;
    const snap = useSim.getState().snapshot;
    return { lamp: snap.comp[h1].on, relay: snap.comp[k1].on, short: snap.elec.short };
  }, ids);
  expect(state).toEqual({ lamp: true, relay: true, short: false });
  // Los cables con tensión se pintan en rojo.
  // (una polilínea vertical tiene ancho 0 y Playwright la considera oculta: se cuentan).
  expect(await page.locator('#circuit-svg polyline[stroke="#dc2626"]').count()).toBeGreaterThan(3);

  // También en 3D, sin errores.
  await page.getByTestId('layout-3d').click();
  await expect(page.getByTestId('scene3d').locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
