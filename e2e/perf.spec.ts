import { expect, test } from '@playwright/test';

// Intenta usar la GPU real (ANGLE/Direct3D); si no hay, Chromium cae a SwiftShader.
test.use({
  launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] },
});

test('rendimiento de la vista 3D con 48 componentes', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('fluidlab3d.view', JSON.stringify({ layout: '3d' })),
  );
  await page.reload();
  await page.locator('select[aria-label="Ejemplos"]').selectOption('99-prueba-rendimiento');
  await expect(page.getByTestId('scene3d').locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('sim-start').click();
  const fps = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1000));
    let n = 0;
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const f = () => {
        n++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
    return (n * 1000) / (performance.now() - t0);
  });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconocido';
  });
  console.log(`FPS con 48 componentes: ${fps.toFixed(1)} (GPU: ${renderer})`);
  // Con GPU real se exige fluidez; con renderizado por software sólo que funcione.
  expect(fps).toBeGreaterThan(/SwiftShader/i.test(renderer) ? 1 : 30);
});
