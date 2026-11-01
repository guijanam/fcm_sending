import { test, expect } from '@playwright/test';

test('production build serves assets and public config under the GitHub Pages subpath', async ({ page }) => {
  const root = 'http://127.0.0.1:4174/fcm_sending/';
  const response = await page.goto(root);
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).not.toContain('/@vite/client');
  expect(html).not.toContain('/src/main.tsx');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLScriptElement).src));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) {
    expect(src).toContain('/fcm_sending/assets/');
    const asset = await page.request.get(src);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toMatch(/javascript/);
  }
  const config = await page.request.get(`${root}firebase-config.json`);
  expect(config.status()).toBe(200);
  expect(config.headers()['content-type']).toContain('application/json');
  expect((await config.json()).projectId).toBe('mydia-29ac2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByRole('button', { name: '전체 공지 발송', exact: true })).toHaveCount(0);
});
