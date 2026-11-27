import { expect, test, type Page } from "@playwright/test";

// Needs: API on :8080 with SPRING_PROFILES_ACTIVE=dev, web dev server on :3000.
const API = process.env.ODEL_API_URL ?? "http://localhost:8080";
const WEB = (host: string, path = "/") => `http://${host}.localhost:3000${path}`;
const stamp = Date.now().toString(36);

async function totp(secret: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/dev/totp?secret=${encodeURIComponent(secret)}`);
  const text = await res.text();
  const m = text.match(/\d{6}/);
  if (!m) throw new Error(`No code from /dev/totp: ${res.status} ${text}`);
  return m[0];
}

async function code(page: Page, value: string) {
  await page.getByLabel("Digit 1 of 6").first().click();
  await page.keyboard.type(value);
}

/** Google start → API dev stub → email. Returns where we landed. */
async function devGoogle(page: Page, signInUrl: string, email: string) {
  await page.goto(signInUrl);
  await page.getByRole("link", { name: "Continue with university Google account" }).click();
  await page.waitForURL(/\/api\/v1\/auth\/dev\/google/);
  await page.getByRole("textbox").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/api/"));
}

const secrets: Record<string, string> = {};
const lastCode: Record<string, string> = {};

/** A fresh code: the API refuses a code that was already used in the same 30-second window. */
async function freshCode(email: string, secret: string): Promise<string> {
  // We cannot know whether an earlier run used the current code, so start from the next window.
  if (!(email in lastCode)) lastCode[email] = await totp(secret);
  for (let i = 0; i < 40; i++) {
    const c = await totp(secret);
    if (c !== lastCode[email]) return (lastCode[email] = c);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no fresh code");
}

/** Handles W-04/W-05 (remembering the secret) or W-03, then W-06 if shown. */
async function finishTwoStep(page: Page, email: string) {
  if (/\/set-up/.test(page.url())) {
    const key = (await page.locator("p.font-mono").first().textContent())!.replace(/\s+/g, "");
    secrets[email] = key;
    await code(page, await freshCode(email, key));
    await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(8);
    await page.getByRole("button", { name: /I’ve saved them/ }).click();
  } else if (/\/two-step/.test(page.url())) {
    const key = secrets[email] ?? process.env[`ODEL_TOTP_${email.split("@")[0].replace(/\W/g, "_").toUpperCase()}`];
    test.skip(!key, `${email} already has two-step sign-in; set its secret to continue`);
    await code(page, await freshCode(email, key!));
    // Do not trust this browser, so the next sign-in asks for a code again.
    await page.getByText("Trust this computer for 30 days").click();
    await expect(page.getByRole("checkbox", { name: "Trust this computer for 30 days" })).not.toBeChecked();
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL((u) => !/\/(set-up|two-step)/.test(u.pathname));
  if (/\/role/.test(page.url())) await page.getByRole("button", { name: /Continue as/ }).click();
}

test("B0 end to end against the real API", async ({ page }) => {
  const slug = process.env.ODEL_E2E_SLUG ?? "wesley";

  await test.step("provider signs in on the console", async () => {
    await devGoogle(page, WEB("console", "/sign-in"), "chuka.obi@odel.dev");
    await finishTwoStep(page, "chuka.obi@odel.dev");
    await expect(page.getByRole("heading", { name: "Universities on the platform" })).toBeVisible();
  });

  const exists = await page.getByRole("link", { name: /Wesley University/ }).count();
  if (!exists) {
    await test.step("provider creates Wesley", async () => {
      await page.getByRole("link", { name: "Add a university" }).click();
      await page.getByLabel("Full name").fill("Wesley University");
      await page.getByLabel("Short name").fill("Wesley ODeL");
      await page.getByLabel("Web address").fill(`odel.wesleyuni.edu.ng`);
      await page.getByLabel("Short address").fill(slug);
      await page.getByLabel(/First admin’s name/).fill("Ngozi Adebayo");
      await page.getByLabel(/First admin’s email/).fill("ngozi.adebayo@wesleyuni.edu.ng");
      await page.getByLabel("Staff Google domain").fill("wesleyuni.edu.ng");
      await page.getByRole("button", { name: "Next: branding" }).click();
      await page.locator("#f-primary").fill("#1A2368");
      await page.locator("#f-accent").fill("#C27808");
      await page.getByRole("button", { name: "Next: rules and payments" }).click();
      await page.getByRole("button", { name: "Next: review" }).click();
      await page.getByRole("button", { name: "Create the university" }).click();
      await expect(page.getByRole("heading", { name: "Wesley University is set up" })).toBeVisible();
    });
  }

  await test.step("audit trail lists the creation", async () => {
    await page.goto(WEB("console", "/audit"));
    await expect(page.getByText(/Created Wesley University/).first()).toBeVisible();
  });

  await test.step("logo upload goes through the /api proxy to dev storage (SA-03)", async () => {
    await page.goto(WEB("console", "/universities/new"));
    await page.getByLabel("Full name").fill(`Upload Check ${stamp}`);
    await page.getByLabel("Web address").fill(`odl.check-${stamp}.edu.ng`);
    await page.getByLabel(/First admin’s name/).fill("Test Admin");
    await page.getByLabel("Staff Google domain").fill(`check-${stamp}.edu.ng`);
    await page.getByLabel(/First admin’s email/).fill(`admin@check-${stamp}.edu.ng`);
    await page.getByRole("button", { name: "Next: branding" }).click();
    await page.locator("#f-logo").setInputFiles("public/mock/wesley-crest.png");
    await expect(page.getByText("wesley-crest.png")).toBeVisible();
    const ok = await page.locator("aside img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(ok).toBe(true);
  });

  await test.step("first admin signs in on wesley.localhost and sees the empty W-10", async () => {
    await page.context().clearCookies();
    await devGoogle(page, WEB("wesley", "/staff/sign-in"), "ngozi.adebayo@wesleyuni.edu.ng");
    await finishTwoStep(page, "ngozi.adebayo@wesleyuni.edu.ng");
    await expect(page).toHaveURL(/\/staff\/setup$/);
    await expect(page.getByText(/0 of 9 steps complete/)).toBeVisible();
  });

  await test.step("sign out, then sign in again with a code", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("You signed out")).toBeVisible();
    await devGoogle(page, WEB("wesley", "/staff/sign-in"), "ngozi.adebayo@wesleyuni.edu.ng");
    expect(page.url()).toMatch(/\/two-step/);
    await finishTwoStep(page, "ngozi.adebayo@wesleyuni.edu.ng");
    await expect(page).toHaveURL(/\/staff\/setup$/);
  });
  void stamp;
});
