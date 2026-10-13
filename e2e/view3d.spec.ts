import { expect, test } from '@playwright/test';

test('la vista 3D y la dividida se abren, simulan y no dan errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByTestId('layout-split').click();
  await expect(page.getByTestId('scene3d').locator('canvas')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#circuit-svg')).toBeVisible();

  await page.getByTestId('layout-3d').click();
  await expect(page.locator('#circuit-svg')).toHaveCount(0);
  for (const mode of ['xray', 'cut', 'normal']) await page.getByTestId(`render-${mode}`).click();
  // Las válvulas: esquema ISO y vuelta a la corredera real.
  await page.getByTestId('valve-iso').click();
  await page.getByTestId('valve-real').click();

  // Simula y acciona la válvula desde el store (el clic 3D depende del raycast de WebGL).
  await page.getByTestId('sim-start').click();
  const pos = await page.evaluate(async () => {
    const { useSim, useProject } = (window as any).__fluid;
    const c = Object.values(useProject.getState().circuit.components) as any[];
    const valve = c.find((x) => x.type === 'pneu-valve-52');
    const cyl = c.find((x) => x.type === 'pneu-cyl-double');
    useSim.getState().press(valve.id, 'left');
    await new Promise((r) => setTimeout(r, 1500));
    return useSim.getState().snapshot.comp[cyl.id].pos;
  });
  expect(pos).toBeGreaterThan(0.99);
  expect(errors).toEqual([]);
});
