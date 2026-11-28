// Re-test of the QA report's B0 defects (ODEL-B0-001, -002, -003) on the hosted dev site, in a visible browser.
// Run: ODEL_E2E_PROVIDER_TOTP=<secret> bun tests/live/qa-b0-defects-retest.mjs   (SLOW=ms between actions). Creates nothing.
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";

const IP = "62.169.21.189";
const CONSOLE = "https://odel-console-dev.oyeksglobal.com";
const WESLEY = "https://wesley.odel-dev.oyeksglobal.com";
const BASE = "odel-dev.oyeksglobal.com";
// The provider admin's authenticator secret is never in the repo: pass it in ODEL_E2E_PROVIDER_TOTP.
const CHUKA = { name: "Chuka Obi", email: "chuka.obi@oyeksglobal.com", secret: process.env.ODEL_E2E_PROVIDER_TOTP ?? "" };
if (!CHUKA.secret) { console.error("Set ODEL_E2E_PROVIDER_TOTP to the provider admin's authenticator secret."); process.exit(2); }
// A checkpoint screenshot (viewport only) after each step, numbered, in ~/Desktop/ODeL test screenshots/B0 end to end (<date>)/.
// On a failure the page address and its visible text are printed too.
const SHOTS = `${homedir()}/Desktop/ODeL test screenshots/QA B0 defects retest (${new Date().toISOString().slice(0, 10)})`;
rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true });
let shots = 0;
async function shot(page, name) {
  shots += 1;
  const file = `${String(shots).padStart(3, "0")} ${name.replace(/[\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 90).trim()}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}` }).catch(() => {});
}

// ---- two-step codes (RFC 6238), each used once ----
function b32(s) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out = [];
  for (const c of s.replace(/\s|=/g, "").toUpperCase()) { v = (v << 5) | a.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32(secret)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const used = new Set();
async function code(secret) {
  for (;;) {
    const now = Math.floor(Date.now() / 1000 / 30);
    for (const s of [now, now - 1]) { const c = totp(secret, s); if (!used.has(secret + c)) { used.add(secret + c); return c; } }
    await new Promise((r) => setTimeout(r, 3000)); // every code in the window was used: wait for the next one
  }
}

// ---- reporting ----
let n = 0; const results = [];
async function step(page, title, fn, { expect = "pass" } = {}) {
  n += 1; const id = String(n).padStart(2, "0");
  try {
    await fn();
    await page.waitForTimeout(1000); // let the person watching see the result
    await shot(page, title);
    results.push({ id, title, ok: true, expect });
    console.log(`  ✓ ${id} ${title}`);
  } catch (e) {
    const seen = await page.evaluate(() => (document.querySelector("main")?.innerText ?? document.body.innerText).replace(/\s+/g, " ").slice(0, 700)).catch(() => "");
    console.log(`      at ${page.url()}\n      page says: ${seen}`);
    await shot(page, `FAILED ${title}`);
    results.push({ id, title, ok: false, expect, error: String(e.message).split("\n")[0] });
    console.log(`  ✗ ${id} ${title}\n      ${String(e.message).split("\n")[0]}`);
    throw e;
  }
}
async function group(name, fn) {
  console.log(`\n${name}`);
  try { await fn(); } catch { console.log("    (rest of this group skipped)"); }
}

const browser = await chromium.launch({
  headless: false, slowMo: Number(process.env.SLOW ?? 600),
  args: ["--window-size=1440,900", `--host-resolver-rules=MAP odel-dev.oyeksglobal.com ${IP}, MAP odel-console-dev.oyeksglobal.com ${IP}, MAP *.odel-dev.oyeksglobal.com ${IP}`],
});
const desktop = { viewport: null };
// One window for the whole walkthrough: the console and the university keep their own cookies (per host).
const ctx = await browser.newContext(desktop);
const page = await ctx.newPage();
const c = page, a = page;
const base = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
// Typed the way a person types (short values character by character); long values are filled at once.
{
  const proto = Object.getPrototypeOf(page.locator("body"));
  const fill = proto.fill;
  proto.fill = async function (value, opts) {
    const type = await this.evaluate((el) => (el.tagName === "TEXTAREA" ? "textarea" : el.type ?? "")).catch(() => "");
    if (value && value.length <= 60 && ["text", "email", "search", "password", "tel", "textarea", "number"].includes(type)) {
      await fill.call(this, "", opts);
      return this.pressSequentially(value, { delay: 40, ...(opts ?? {}) });
    }
    return fill.call(this, value, opts);
  };
}

async function signInStub(page, nameOrEmail, { email } = {}) {
  await page.getByText("Continue with university Google account").click();
  await page.waitForURL(/auth\/dev\/google/);
  if (email) { await page.fill("#email", email); await page.getByRole("button", { name: "Continue", exact: true }).click(); }
  else await page.getByRole("button", { name: new RegExp(nameOrEmail) }).click();
}
async function signOut(page) {
  await page.waitForLoadState("networkidle");
  const all = page.getByRole("button", { name: "Sign out" });
  const info = await all.evaluateAll((els) => els.map((e) => `${e.textContent.trim()}|visible=${!!(e.offsetWidth || e.offsetHeight)}`));
  if (process.env.DEBUG) console.log("      sign-out buttons:", info.join(" ; "));
  await all.filter({ visible: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/sign-in/);
}
async function typeCode(page, value) {
  await page.locator('input[inputmode="numeric"]').first().click();
  await page.keyboard.type(value, { delay: 40 });
}


let usedGooglePage = null;
await group("ODEL-B0-001 · Sign-in can start again after a used or repeated Google step (Wesley)", async () => {
  await step(a, "Wesley staff sign-in", async () => { await a.goto(`${WESLEY}/staff/sign-in`); await a.getByText("Continue with university Google account").waitFor(); });
  await step(a, "Dev Google page - Choose an account", async () => {
    await a.getByText("Continue with university Google account").click(); await a.waitForURL(/auth\/dev\/google/); await a.getByText("Choose an account").waitFor(); usedGooglePage = a.url();
  });
  await step(a, "Double-click Ngozi - only one sign-in goes through, lands on Enter your code", async () => {
    await a.getByRole("button", { name: /Ngozi Adebayo/ }).dblclick(); await a.getByText("Enter your 6-digit code").waitFor();
  });
  await step(a, "Reopen the used Google page - back on sign-in with Start again (no error page)", async () => {
    await a.goto(usedGooglePage); // a reload, a resubmitted form or an old tab all bring the used state back
    await a.waitForURL(/staff\/sign-in\?error=expired/); await a.getByText("Sign-in took too long").waitFor();
  });
  await step(a, "Continue with Google again - Choose an account opens", async () => {
    await a.getByText("Continue with university Google account").click(); await a.waitForURL(/auth\/dev\/google/); await a.getByText("Choose an account").waitFor();
  });
  await step(a, "Pick Ngozi - Enter your code (sign-in works again)", async () => {
    await a.getByRole("button", { name: /Ngozi Adebayo/ }).click(); await a.getByText("Enter your 6-digit code").waitFor();
  });
  await step(a, "Three wrong codes - Too many wrong codes (SOI-006)", async () => {
    for (let i = 0; i < 3; i++) {
      await typeCode(a, ["111111", "222222", "333333"][i]); await a.getByRole("button", { name: "Verify" }).click();
      if (i < 2) { await a.getByText(i === 0 ? /2 tries left/ : /1 try left|1 tries left/).first().waitFor(); await a.locator('input[inputmode="numeric"]').first().fill(""); }
    }
    await a.waitForURL(/error=too_many_attempts/); await a.getByText("Too many wrong codes").waitFor();
  });
  await step(a, "SOI-012 - Continue with Google - Choose an account, then Enter your code", async () => {
    await a.getByText("Continue with university Google account").click(); await a.getByText("Choose an account").waitFor();
    await a.getByRole("button", { name: /Ngozi Adebayo/ }).click(); await a.getByText("Enter your 6-digit code").waitFor();
  });
});

if (!process.env.ONLY || process.env.ONLY.includes("2")) await group("ODEL-B0-002 and -003 · Add a university, step 1 (console, nothing created)", async () => {
  await step(c, "Console sign-in as Chuka", async () => {
    await c.goto(CONSOLE); await c.waitForURL(/\/sign-in/); await signInStub(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click(); await c.getByText(/Wesley University/).first().waitFor();
  });
  const watch = [];
  c.on("response", async (r) => { if (r.url().includes("/platform/tenants")) watch.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https:\/\/[^/]+/, "")}`); });
  await step(c, "Add a university - empty form", async () => { await c.goto(`${CONSOLE}/universities/new`); await c.locator("#f-name").waitFor(); });
  await step(c, "ADU-014/015 - Full name, Short name and First admin 11111 are refused on Next", async () => {
    await c.fill("#f-name", "11111"); await c.fill("#f-shortName", "11111"); await c.fill("#f-slug", "harmony");
    await c.fill("#f-adminName", "11111"); await c.fill("#f-adminEmail", "tunde.bakare@gmail.com"); await c.fill("#f-googleDomain", "gmail.com");
    await c.getByRole("button", { name: /Next: branding/ }).click();
    if ((await c.getByText("Use letters: a name cannot be only numbers or symbols").count()) < 2) throw new Error("letters message not on both name fields");
    await c.getByText("Enter the first admin’s real name, in letters").waitFor();
    await c.locator("#f-name").waitFor(); // still on step 1
  });
  await step(c, "ADU-016 - Same Full name as Wesley (other case, extra spaces), new short address - refused on step 1", async () => {
    await c.fill("#f-name", "wesley   UNIVERSITY"); await c.fill("#f-shortName", "Wesley ODeL"); await c.fill("#f-adminName", "Tunde Bakare");
    await c.getByRole("button", { name: /Next: branding/ }).click();
    await c.getByText(/Wesley University is already on the platform \(wesley\)/).waitFor(); await c.locator("#f-name").waitFor();
  });
  await step(c, "A new name (Harmony University) passes step 1 - Branding (not created)", async () => {
    await c.fill("#f-name", "Harmony University"); await c.fill("#f-shortName", "Harmony ODeL");
    await c.getByRole("button", { name: /Next: branding/ }).click(); await c.getByText(/Step 2 of 4/).waitFor();
  });
  console.log("    API seen:\n      " + watch.join("\n      "));
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? "; failed: " + failed.map((f) => f.id + " " + f.title).join(" | ") : ""}`);
console.log(`Screenshots: ${SHOTS}`);
await page.waitForTimeout(3000);
await browser.close();
