import { expect, test } from '@playwright/test';

test('carga el ejemplo, simula y el cilindro avanza al pulsar la válvula', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const canvas = page.locator('#circuit-svg');
  const cylinder = canvas.locator('[data-type="pneu-cyl-double"]');
  const valve = canvas.locator('[data-type="pneu-valve-52"]');
  await expect(cylinder).toBeVisible();
  await expect(page.getByText('Sin puertos abiertos')).toBeVisible();

  // Posición del vástago leída del dibujo (rect del vástago = penúltimo rect del símbolo).
  const rodX = () =>
    cylinder
      .locator('rect')
      .nth(-2)
      .evaluate((r) => Number(r.getAttribute('x')));
  const x0 = await rodX();

  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('sim-time')).toContainText('t =');

  const box = (await valve.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(rodX, { timeout: 5000 }).toBeGreaterThan(x0 + 80);
  await expect(page.locator('.explain')).toContainText('1→4 abierta');

  await page.mouse.up();
  await expect.poll(rodX, { timeout: 5000 }).toBeLessThan(x0 + 1);

  await page.getByTestId('sim-stop').click();
  await expect(page.getByTestId('sim-time')).toHaveText('Edición');
});

test('se puede añadir un componente desde la biblioteca y deshacerlo', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#circuit-svg');
  const before = await canvas.locator('[data-kind="comp"]').count();
  await page.locator('.lib-item[data-type="pneu-gauge"]').dblclick();
  await expect(canvas.locator('[data-kind="comp"]')).toHaveCount(before + 1);
  await page.locator('.canvas-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(canvas.locator('[data-kind="comp"]')).toHaveCount(before);
});
