import { defineConfig, devices } from "@playwright/test";

// End to end against the real API (odel-backend, dev profile) and `bun run dev` on port 3000:
//   bunx playwright test -c playwright.real.config.ts
export default defineConfig({
  testDir: "./tests/real",
  timeout: 120_000,
  workers: 1,
  outputDir: process.env.PW_OUTPUT ?? "test-results/real",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 }, trace: "retain-on-failure" },
});
