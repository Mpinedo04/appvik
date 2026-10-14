import type { Page } from '@playwright/test';

/** Abre un ejemplo desde la galería. */
export async function loadExample(page: Page, id: string) {
  await page.getByTestId('gallery-open').click();
  await page.getByTestId(`example-${id}`).click();
}
