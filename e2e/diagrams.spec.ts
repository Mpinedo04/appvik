import { expect, test } from '@playwright/test';

test('ciclo A+ B+ B− A−: el diagrama espacio-fase muestra la secuencia', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('select[aria-label="Ejemplos"]').selectOption('07-ciclo-AB-BA');
  await page.getByTestId('diagrams').click();
  await page.getByTestId('sim-start').click();
  await page.evaluate(() => {
    const { useSim, useProject } = (window as any).__fluid;
    const c = Object.values(useProject.getState().circuit.components) as any[];
    const start = c.find((x) => x.type === 'pneu-valve-32nc');
    useSim.getState().press(start.id, 'left');
    setTimeout(() => useSim.getState().release(start.id), 200);
  });
  await page.getByTestId('tab-phase').click();
  // Espera a que pasen 3 s de tiempo simulado (sin GPU la simulación va más despacio).
  await expect
    .poll(() => page.evaluate(() => (window as any).__fluid.useSim.getState().snapshot?.t ?? 0), {
      timeout: 60000,
    })
    .toBeGreaterThan(3);
  await expect(page.getByTestId('phase-sequence')).toHaveText('Secuencia: 1A+ → 2A+ → 2A− → 1A−');
  await expect(page.locator('.phase-svg')).toBeVisible();
});
