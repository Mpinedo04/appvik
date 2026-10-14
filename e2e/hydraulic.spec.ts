import { expect, test } from '@playwright/test';
import { loadExample } from './util';

test('hidráulica: la prensa llega al tarado de la limitadora y el 3D no da errores', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await loadExample(page, '11-prensa-hidraulica');
  await page.getByTestId('layout-split').click();
  await expect(page.getByTestId('scene3d').locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('render-cut').click();
  await page.getByTestId('sim-start').click();
  const bar = await page.evaluate(async () => {
    const { useSim, useProject } = (window as any).__fluid;
    const c = Object.values(useProject.getState().circuit.components) as any[];
    const valve = c.find((x) => x.type === 'hyd-valve-43-tandem');
    const gauge = c.find((x) => x.type === 'hyd-gauge');
    useSim.getState().setSpeed(2);
    useSim.getState().press(valve.id, 'left');
    useSim.getState().release(valve.id);
    await new Promise((r) => setTimeout(r, 3000));
    return useSim.getState().snapshot.comp[gauge.id].bar;
  });
  expect(bar).toBeGreaterThan(47);
  expect(bar).toBeLessThan(53);
  expect(errors).toEqual([]);
});
