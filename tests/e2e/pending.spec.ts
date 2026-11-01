import {test, expect} from '@playwright/test';

test('configured web app with deferred backend never offers login or sends requests', async ({page}) => {
  const calls: string[] = [];
  page.on('request', request => {
    if (/cloudfunctions\.net|identitytoolkit\.googleapis\.com/.test(request.url())) calls.push(request.url());
  });
  await page.route('**/firebase-config.json', route => route.fulfill({
    json:{apiKey:'test-only-public-web-key',authDomain:'mydia-29ac2.firebaseapp.com',projectId:'mydia-29ac2',messagingSenderId:'188406916055',appId:'1:188406916055:web:abc',functionsRegion:'asia-northeast3',backendReady:false},
  }));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'발송 서버 배포 대기'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Google로 로그인'})).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('현재 로그인·발송·발송 기록 조회는 비활성 상태입니다. 실제 알림은 전송되지 않습니다.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(calls).toEqual([]);
});
