import { defineConfig, devices } from "@playwright/test";
import process from "node:process";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/artifacts",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview -- --port 4174 --base=/fcm_sending/",
      url: "http://127.0.0.1:4174/fcm_sending/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
