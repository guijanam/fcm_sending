import { test, expect } from '@playwright/test';
test('test-only adapter exercises compose and confirmation without Firebase',async({page},info)=>{
 await page.goto('/tests/e2e/harness.html');
 await page.getByLabel('알림 제목').fill('이번 주 근무 안내');
 await page.getByLabel('알림 내용').fill('변경된 일정을 확인해 주세요.\n언제나 안전한 근무를 응원합니다.');
 await expect(page.getByRole('heading',{name:'이번 주 근무 안내'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`tests/artifacts/dashboard-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'발송 전 검토'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('button',{name:'취소'})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'발송 전 검토'})).toBeFocused();
});
