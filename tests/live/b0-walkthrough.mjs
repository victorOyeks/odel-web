// B0 end-to-end walkthrough against the hosted dev site, in a visible browser.
// Run: ODEL_E2E_PROVIDER_TOTP=<secret> SLUG=<new short address> bun tests/live/b0-walkthrough.mjs   (SLOW=ms between actions)
// Positive paths, edge cases and negative cases; each step printed as it passes or fails, a summary at the end.
import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const IP = "62.169.21.189";
const CONSOLE = "https://odel-console-dev.oyeksglobal.com";
const WESLEY = "https://wesley.odel-dev.oyeksglobal.com";
const BASE = "odel-dev.oyeksglobal.com";
// The provider admin's authenticator secret is never in the repo: pass it in ODEL_E2E_PROVIDER_TOTP.
const CHUKA = { name: "Chuka Obi", email: "chuka.obi@oyeksglobal.com", secret: process.env.ODEL_E2E_PROVIDER_TOTP ?? "" };
if (!CHUKA.secret) { console.error("Set ODEL_E2E_PROVIDER_TOTP to the provider admin's authenticator secret."); process.exit(2); }
// No screenshots: the browser window is the view. On a failure the page address and its visible text are printed.

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
    await page.waitForTimeout(400);
    results.push({ id, title, ok: true, expect });
    console.log(`  ✓ ${id} ${title}`);
  } catch (e) {
    const seen = await page.evaluate(() => (document.querySelector("main")?.innerText ?? document.body.innerText).replace(/\s+/g, " ").slice(0, 700)).catch(() => "");
    console.log(`      at ${page.url()}\n      page says: ${seen}`);
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
  headless: false, slowMo: Number(process.env.SLOW ?? 300),
  args: [`--host-resolver-rules=MAP odel-dev.oyeksglobal.com ${IP}, MAP odel-console-dev.oyeksglobal.com ${IP}, MAP *.odel-dev.oyeksglobal.com ${IP}`],
});
const desktop = { viewport: { width: 1440, height: 900 } };
const consoleCtx = await browser.newContext(desktop);
const c = await consoleCtx.newPage();

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
  await page.keyboard.type(value);
}

const slug = process.env.SLUG ?? "lakeshore";
const uni = { name: "Lakeshore University", short: "Lakeshore ODeL", slug, admin: "Bola Ige", email: `oyeksglobal+${slug}@gmail.com`, domain: "gmail.com" };
const UNI = `https://${slug}.${BASE}`;
let adminSecret = null, backup = [];

await group("A · Provider signs in to the console", async () => {
  await step(c, "Console asks to sign in (not signed in)", async () => { await c.goto(CONSOLE); await c.waitForURL(/\/sign-in/); });
  await step(c, "Negative - an email that is not a platform admin is refused", async () => {
    await signInStub(c, "", { email: "someone@gmail.com" }); await c.waitForURL(/error=/); await c.getByText(/not on the staff list|not a university account|could not find/i).first().waitFor();
  });
  await step(c, "Dev sign-in page lists the platform's accounts", async () => {
    await c.getByText("Continue with university Google account").click(); await c.waitForURL(/auth\/dev\/google/); await c.getByText("Choose an account").waitFor();
  });
  await step(c, "Chuka chosen - asked for the two-step code (W-03)", async () => {
    await c.getByRole("button", { name: /Chuka Obi/ }).click(); await c.getByText("Enter your 6-digit code").waitFor();
  });
  await step(c, "Negative - a wrong code is refused with tries left", async () => {
    await typeCode(c, "000000"); await c.getByRole("button", { name: "Verify" }).click(); await c.getByText(/not right|2 (tries|attempts)/i).first().waitFor();
  });
  await step(c, "Right code - Universities list (SA-01)", async () => {
    await c.locator('input[inputmode="numeric"]').first().click();
    for (let i = 0; i < 6; i++) await c.keyboard.press("Backspace");
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click();
    await c.getByText(/Wesley University/).first().waitFor();
  });
});

await group("B · Provider adds Lakeshore University (SA-02 to SA-05b)", async () => {
  await step(c, "Add a university - empty form (SA-02c)", async () => { await c.goto(`${CONSOLE}/universities/new`); await c.getByText("Add a university").first().waitFor(); });
  await step(c, "Edge - Next with nothing filled in shows what is missing", async () => {
    await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/Enter|Type/).first().waitFor();
  });
  await step(c, "Negative - a .test domain is refused as its own web address", async () => {
    await c.getByLabel("Full name").fill(uni.name); await c.getByLabel("Short name").fill(uni.short);
    await c.getByLabel("Own web address (optional)").fill("odl.lakeshore.test");
    await c.getByLabel("Short address").fill("wesley");
    await c.getByLabel(/First admin’s name/).fill(uni.admin); await c.getByLabel(/First admin’s email/).fill(uni.email);
    await c.getByLabel("Staff Google domain").fill(uni.domain);
    await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/test domains/).waitFor();
  });
  await step(c, "Negative - a short address already in use is refused (SA-02b)", async () => {
    await c.getByLabel("Own web address (optional)").fill("");
    await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/already|taken/i).first().waitFor();
  });
  await step(c, "Details filled in - own web address left empty", async () => {
    await c.getByLabel("Short address").fill(uni.slug); await c.getByLabel("Staff Google domain").fill(uni.domain);
    await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByLabel("Main colour").first().waitFor();
  });
  await step(c, "Negative - a pale main colour fails the readability check (SA-03b)", async () => {
    await c.getByLabel("Main colour").first().fill("#F5D76E"); await c.getByLabel("Accent colour").first().fill("#D4A017");
    await c.getByText(/hard to read/).first().waitFor();
  });
  await step(c, "Branding - readable plum and gold, with a live preview (SA-03)", async () => {
    await c.getByLabel("Main colour").first().fill("#6B2D5C"); await c.getByText(/reads well/).first().waitFor();
  });
  await step(c, "Rules and payments - defaults for now (SA-04)", async () => {
    await c.getByRole("button", { name: "Next: rules and payments" }).click(); await c.getByRole("button", { name: "Next: review" }).waitFor();
  });
  await step(c, "Review everything before creating (SA-05)", async () => {
    await c.getByRole("button", { name: "Next: review" }).click(); await c.getByRole("button", { name: "Create the university" }).waitFor();
  });
  await step(c, "Created - next steps show it is live at its platform address (SA-05b)", async () => {
    await c.getByRole("button", { name: "Create the university" }).click(); await c.getByText(/is set up/).first().waitFor();
    await c.locator("main").getByText(/Live at https:/).filter({ visible: true }).first().waitFor();
    const live = await c.locator("main").innerText();
    if (!live.includes(`Live at ${UNI}`)) throw new Error(`expected "Live at ${UNI}" on the page`);
  });
  await step(c, "University page - web addresses and the invitation (SA-01b)", async () => {
    await c.getByText("Open the university page").click(); await c.getByText("Web addresses").waitFor();
  });
});

const adminCtx = await browser.newContext(desktop);
const a = await adminCtx.newPage();
await group("C · Lakeshore's first admin gets in (W-01 to W-05, W-10)", async () => {
  await step(a, "Lakeshore's own sign-in page, in its colours", async () => { await a.goto(`${UNI}/staff/sign-in`); await a.getByText("Lakeshore University").first().waitFor(); });
  await step(a, "Negative - a personal email outside the staff domain is refused (W-02)", async () => {
    await signInStub(a, "", { email: "bola@yahoo.com" }); await a.waitForURL(/error=wrong_domain/);
  });
  await step(a, "Negative - an unknown address on the staff domain is refused (W-02)", async () => {
    await signInStub(a, "", { email: "stranger@gmail.com" }); await a.waitForURL(/error=not_linked/);
  });
  await step(a, "Dev sign-in page lists Lakeshore's staff - Bola Ige", async () => {
    await a.getByText("Continue with university Google account").click(); await a.getByRole("button", { name: /Bola Ige/ }).waitFor();
  });
  await step(a, "First sign-in - set up two-step: QR code and key (W-04)", async () => {
    await a.getByRole("button", { name: /Bola Ige/ }).click(); await a.getByText("1. Scan with your authenticator app").waitFor();
    adminSecret = (await a.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  });
  await step(a, "Negative - a wrong setup code is refused", async () => {
    await typeCode(a, "123456"); await a.getByRole("button", { name: "Turn on two-step sign-in" }).click(); await a.getByText(/not right|tries|attempts/i).first().waitFor();
  });
  await step(a, "Right code - 8 backup codes to save (W-05)", async () => {
    await a.locator('input[inputmode="numeric"]').first().click(); for (let i = 0; i < 6; i++) await a.keyboard.press("Backspace");
    await typeCode(a, await code(adminSecret)); await a.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await a.getByText("Save your backup codes").waitFor();
    backup = (await a.getByLabel("Backup codes").innerText()).match(/\d{4}-\d{4}/g) ?? [];
    if (backup.length !== 8) throw new Error(`expected 8 backup codes, saw ${backup.length}`);
  });
  await step(a, "Lands on the empty setup checklist (W-10)", async () => {
    await a.getByRole("button", { name: /saved them/ }).click(); await a.getByText("Session and semesters").first().waitFor();
  });
  await step(a, "Phone size - the same checklist on a 390 px screen", async () => {
    await a.setViewportSize({ width: 390, height: 844 }); await a.waitForTimeout(600);
  });
  await a.setViewportSize({ width: 1440, height: 900 });
});

await group("D · Signing out and back in (S-04, S-02, W-03)", async () => {
  await step(a, "Sign out asks to confirm (S-04)", async () => { await a.waitForLoadState("networkidle"); await a.getByRole("button", { name: "Sign out" }).first().click(); await a.getByText("Sign out?").waitFor(); });
  await step(a, "Signed out - back to sign-in (S-02)", async () => { await a.getByRole("dialog").getByRole("button", { name: "Sign out" }).click(); await a.waitForURL(/sign-in/); });
  await step(a, "Edge - sign in with a backup code instead of the app", async () => {
    await signInStub(a, "Bola Ige"); await a.getByText("Enter your 6-digit code").waitFor(); await a.waitForLoadState("networkidle");
    await a.getByText("Use a backup code instead").click(); await a.getByText("Use a backup code", { exact: true }).waitFor(); await a.getByLabel("Backup code").fill(backup[0]);
    await a.getByRole("button", { name: "Verify" }).click(); await a.getByText("Session and semesters").first().waitFor();
  });
  await step(a, "Negative - the same backup code cannot be used twice", async () => {
    await signOut(a);
    await signInStub(a, "Bola Ige"); await a.getByText("Enter your 6-digit code").waitFor(); await a.waitForLoadState("networkidle");
    await a.getByText("Use a backup code instead").click(); await a.getByLabel("Backup code").fill(backup[0]);
    await a.getByRole("button", { name: "Verify" }).click(); await a.getByText(/not right|tries|attempts/i).first().waitFor();
  });
  await step(a, "Negative - three wrong codes end the sign-in", async () => {
    await a.getByText("Use the code from my app instead").click();
    for (const _ of [1, 2]) { await a.locator('input[inputmode="numeric"]').first().click(); for (let i = 0; i < 6; i++) await a.keyboard.press("Backspace"); await typeCode(a, "000000"); await a.getByRole("button", { name: "Verify" }).click(); await a.waitForTimeout(800); }
    await a.waitForURL(/too_many_attempts/, { timeout: 10000 });
  });
  await step(a, "Right code with 'Trust this computer for 30 days'", async () => {
    await signInStub(a, "Bola Ige"); await typeCode(a, await code(adminSecret)); await a.getByText("Trust this computer for 30 days").click();
    await a.getByRole("button", { name: "Verify" }).click(); await a.getByText("Session and semesters").first().waitFor();
  });
  await step(a, "Edge - a trusted computer skips the code next time", async () => {
    await signOut(a);
    await signInStub(a, "Bola Ige"); await a.getByText("Session and semesters").first().waitFor();
  });
});

await group("E · Universities are kept apart", async () => {
  await step(a, "Negative - Lakeshore's admin is not signed in on the provider console", async () => { await a.goto(CONSOLE); await a.waitForURL(/\/sign-in/); });
  await step(a, "Negative - Lakeshore's admin is refused on Wesley's portal", async () => {
    await a.goto(`${WESLEY}/staff/sign-in`); await signInStub(a, "", { email: uni.email }); await a.waitForURL(/error=wrong_domain/);
  });
  await step(a, "Negative - an address with no university behind it", async () => { await a.goto(`https://nowhere.${BASE}/staff/sign-in`); await a.waitForLoadState("networkidle"); });
  await step(a, "Student portal on Lakeshore's address (opens in B1)", async () => { await a.goto(`${UNI}/`); await a.waitForLoadState("networkidle"); });
});

await group("F · Provider sees it all (SA-01b, SA-09)", async () => {
  await step(c, "Lakeshore's page - invitation accepted", async () => { await c.reload(); await c.getByText(/accepted/i).first().waitFor(); });
  await step(c, "Audit trail - creation, sign-ins, failed codes, sign-outs (SA-09)", async () => {
    await c.goto(`${CONSOLE}/audit`); await c.locator("main").getByText(/Bola Ige signed in/).first().waitFor();
    await c.locator("main").getByText(new RegExp(`Created Lakeshore University`)).first().waitFor();
  });
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} of ${results.length} steps passed.`);
process.exit(passed === results.length ? 0 : 1);
