import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loadExample } from './util';

test('galería y exportación a PDF (esquema, contactos y lista de componentes)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await loadExample(page, '16-plc-contactos');
  await expect(page.locator('#circuit-svg [data-type="ctrl-plc"]')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByTestId('export-pdf').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const pdf = readFileSync((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20_000);
  // Tres hojas: esquema, contactos y lista de componentes.
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
  expect(errors).toEqual([]);
});
