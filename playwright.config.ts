import { defineConfig, devices } from "@playwright/test";

export function webServerFor(prebuilt: boolean) {
  return {
    command: prebuilt ? "node -e \"require('node:fs').accessSync('out/index.html')\" && npx serve out -l 4173" : "npm run build && npx serve out -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: { ...process.env, PLAYWRIGHT_TEST_BUILD: "1" },
  };
}

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: webServerFor(process.env.PLAYWRIGHT_PREBUILT === "1"),
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" } },
    { name: "pixel-7", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
