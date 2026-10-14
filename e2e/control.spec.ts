import { expect, test } from '@playwright/test';

test('GRAFCET y contactos: los editores muestran la ejecución y se pueden crear', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // GRAFCET de mando directo: la etapa 0 está activa y al pulsar S1 evoluciona.
  await page.locator('select:has(option:text("Ejemplos…"))').selectOption('15-grafcet-ciclo-AB-BA');
  await page.getByTestId('sheet-grafcet').click();
  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('gf-step-0')).toHaveAttribute('data-active', 'on');
  await page.evaluate(() => {
    const { useSim, useProject } = (window as any).__fluid;
    const s1 = (Object.values(useProject.getState().circuit.components) as any[]).find(
      (x) => x.label === 'S1',
    );
    useSim.getState().setSpeed(0.25);
    useSim.getState().press(s1.id);
    setTimeout(() => useSim.getState().release(s1.id), 200);
  });
  await expect(page.getByTestId('gf-step-1')).toHaveAttribute('data-active', 'on', {
    timeout: 3000,
  });
  await page.getByTestId('sim-stop').click();

  // Esquema de contactos del PLC.
  await page.getByTestId('sheet-circuit').click();
  await page.locator('select:has(option:text("Ejemplos…"))').selectOption('16-plc-contactos');
  await page.getByTestId('sheet-ladder').click();
  await expect(page.getByTestId('rung-0')).toBeVisible();
  await page.getByTestId('rung-0').click();
  await expect(page.getByTestId('rung-cond')).toHaveValue('(I0.0 + M0.0) · I0.1');

  // Proyecto nuevo: crear un GRAFCET desde cero y añadir una etapa.
  await page.evaluate(() =>
    (window as any).__fluid.useProject.getState().load({
      format: 'fluidlab-3d',
      version: 2,
      name: 'Nuevo',
      circuit: { components: {}, connections: {}, junctions: {} },
    }),
  );
  await page.getByTestId('sheet-grafcet').click();
  await page.getByTestId('grafcet-new').click();
  await page.getByTestId('grafcet-add-step').click();
  await expect(page.getByTestId('gf-step-2')).toBeVisible();
  expect(errors).toEqual([]);
});
