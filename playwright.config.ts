import { defineConfig, devices } from "@playwright/test";

// Runs against a production build in mock mode (no API needed):
//   bun run build && bun run test
const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["real/**"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://wesley.localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } }],
  webServer: {
    command: `bun --bun next start -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    reuseExistingServer: !process.env.CI,
    env: { ODEL_MOCK_API: "1", ODEL_MOCK_SEED: "demo" },
    timeout: 60_000,
  },
});
