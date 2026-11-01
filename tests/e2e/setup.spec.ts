import { test, expect } from "@playwright/test";
test("unconfigured screen is honest, readable and has no overflow", async ({
  page,
}, info) => {
  await page.route("**/firebase-config.json", (route) =>
    route.fulfill({
      json: {
        apiKey: "",
        appId: "",
        projectId: "mydia-29ac2",
        authDomain: "mydia-29ac2.firebaseapp.com",
        messagingSenderId: "188406916055",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "알림 센터 연결하기" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "전체 공지 발송" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator(".setup-grid")).toHaveCSS("display", "grid");
  await page.screenshot({
    path: `tests/artifacts/setup-${info.project.name}.png`,
    fullPage: true,
  });
});
