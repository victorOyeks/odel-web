// B1 end-to-end walkthrough against the hosted dev site, in a visible browser.
// Run: ODEL_E2E_PROVIDER_TOTP=<secret> bun tests/live/b1-walkthrough.mjs   (SLOW=ms between actions, SLUG=short address, UNTIL=last group letter)
// A fresh test university (Lakeshore) is created through the console and walked through phase B1: setup, staff, students,
// welcome emails, student activation and sign-in, the audit log and isolation from Wesley. Every person has a .test address,
// so nothing is emailed for real; codes and links are read from the dev email log. The university is deleted at the end, always.
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";

const IP = "62.169.21.189";
const CONSOLE = "https://odel-console-dev.oyeksglobal.com";
const WESLEY = "https://wesley.odel-dev.oyeksglobal.com";
const BASE = "odel-dev.oyeksglobal.com";
// The provider admin's authenticator secret is never in the repo: pass it in ODEL_E2E_PROVIDER_TOTP.
const CHUKA = { email: "chuka.obi@oyeksglobal.com", secret: process.env.ODEL_E2E_PROVIDER_TOTP ?? "" };
if (!CHUKA.secret) { console.error("Set ODEL_E2E_PROVIDER_TOTP to the provider admin's authenticator secret."); process.exit(2); }
const UNTIL = (process.env.UNTIL ?? "Z").toUpperCase();

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
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ---- the dev email log (read with curl: this Mac's DNS cannot resolve the dev hosts) ----
function emails(to) {
  const out = execFileSync("curl", ["-s", "--resolve", `odel-console-dev.oyeksglobal.com:443:${IP}`, `${CONSOLE}/api/v1/dev/emails?to=${encodeURIComponent(to)}`]).toString();
  return JSON.parse(out).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
}
const seenMail = new Set();
/** The newest email to `to` sent after `after` (ms) that matches `test` and was not used before; waits up to 60 seconds. */
async function waitEmail(to, after, test = () => true, { timeout = 60_000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const m = emails(to).find((e) => Date.parse(e.created_at) >= after - 5000 && !seenMail.has(to + e.created_at) && test(e));
    if (m) { seenMail.add(to + m.created_at); return m; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`no email to ${to} within ${timeout / 1000} seconds`);
}
const codeIn = (e) => (e.body.match(/\b(\d{6})\b/) ?? [])[1];

// ---- reporting ----
let n = 0; const results = [];
// ---- API watcher: every /api call of every page, checked per step and summed up per group ----
// A step fails on an unexpected 4xx/5xx (negative steps, titled "Negative", allow 4xx; `allow` lists more), a write without the
// CSRF header, a code or password in a URL, an error body without {error, message}, or a response missing a contract field.
const SHAPES = [
  ["GET", /\/api\/v1\/setup\/checklist$/, ["sessionName", "steps", "done", "total", "percent", "steps.0.number", "steps.0.key", "steps.0.title", "steps.0.summary", "steps.0.status"]],
  ["GET", /\/api\/v1\/students(\?|$)/, ["items", "page", "size", "total", "items.0.id", "items.0.matricNumber", "items.0.fullName", "items.0.programme.code", "items.0.levelLabel", "items.0.centre.code", "items.0.status", "items.0.statusLabel"]],
  ["GET", /\/api\/v1\/students\/[0-9a-f-]{36}$/, ["id", "matricNumber", "fullName", "programme", "centre", "status", "account", "history"]],
  ["POST", /\/api\/v1\/imports\/students\/validate$/, ["importId", "status", "totalRows", "ready.count", "ready.new", "ready.updated", "errors.count", "warnings.count", "problems"]],
  ["POST", /\/api\/v1\/imports\/students\/[^/]+\/confirm$/, ["importId", "status", "added", "updated", "skipped", "importedAt", "importedBy.fullName"]],
  ["GET", /\/api\/v1\/imports\/students(\?|$)/, ["items", "total", "items.0.fileName", "items.0.importedBy.fullName", "items.0.added"]],
  ["GET", /\/api\/v1\/students\/welcome$/, ["template.subject", "template.body", "fields", "preview.subject", "audience.notActivated", "audience.withEmail", "audience.noEmail", "audience.alreadyActive"]],
  ["*", /\/api\/v1\/students\/welcome\/sends(\/[0-9a-f-]{36})?$/, ["id", "status", "startedAt", "totals.toSend", "totals.sent", "totals.failed", "totals.skippedNoEmail", "totals.skippedTestAddress", "totals.skippedActive", "progressPercent"]],
  ["POST", /\/api\/v1\/auth\/student\/activation\/(start|resend)$/, ["activationId", "maskedEmail", "codeSent", "expiresInSeconds", "resendInSeconds"]],
  ["POST", /\/api\/v1\/auth\/student\/password-reset\/(start|resend)$/, ["resetId", "maskedEmail", "codeSent", "expiresInSeconds", "resendInSeconds"]],
  ["POST", /\/api\/v1\/auth\/student\/activation\/verify$/, ["activationToken", "expiresInSeconds", "student.fullName"]],
  ["GET", /\/api\/v1\/student-profile$/, ["matricNumber", "fullName", "programme.name", "levelLabel", "centre.name", "status"]],
  ["GET", /\/api\/v1\/academic\/courses(\?|$)/, ["items", "total", "catalogueTotal", "programmeTotal", "items.0.code", "items.0.units", "items.0.offeredTo", "items.0.needsLecturer"]],
  ["GET", /\/api\/v1\/academic\/centres$/, ["items", "items.0.code", "items.0.rooms", "items.0.seats", "items.0.computers"]],
  ["GET", /\/api\/v1\/people(\?|$)/, ["items", "total", "counts.total", "counts.active", "counts.invited", "items.0.roles", "items.0.twoStepSetUp", "items.0.status"]],
  ["GET", /\/api\/v1\/audit(\?|$)/, ["items", "total", "items.0.at", "items.0.summary", "items.0.type"]],
];
function missing(body, keys) {
  const out = [];
  for (const k of keys) {
    let v = body; let skip = false;
    for (const part of k.split(".")) {
      if (Array.isArray(v) && /^\d+$/.test(part) && v.length === 0) { skip = true; break; }
      if (v == null || typeof v !== "object" || !(part in v)) { v = undefined; break; }
      v = v[part];
    }
    if (!skip && v === undefined) out.push(k);
  }
  return out;
}
let calls = []; const groupCalls = [];
function watch(ctx, who) {
  ctx.on("request", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/v1/dev/")) return;
    // (The sign-in handoff's one-time code, exchanged at once on a redirect like OAuth's, is the one allowed code in a URL.)
    if (u.pathname !== "/api/v1/auth/handoff" && /(^|[?&])(code|password|token|activationToken|resetToken)=/i.test(u.search)) calls.push({ who, problem: `a secret in the URL: ${u.pathname}${u.search}` });
    if (req.method() !== "GET" && ["fetch", "xhr"].includes(req.resourceType()) && !req.headers()["x-xsrf-token"]) calls.push({ who, problem: `${req.method()} ${u.pathname} has no CSRF header` });
  });
  ctx.on("response", (res) => {
    const req = res.request(); const u = new URL(res.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/v1/dev/")) return;
    const rec = { who, method: req.method(), path: u.pathname + u.search, status: res.status(), kind: req.resourceType() };
    calls.push(rec);
    if (!["fetch", "xhr"].includes(rec.kind)) return;
    rec.body = res.json().then((b) => {
      if (rec.status >= 400 && b && (typeof b.error !== "string" || typeof b.message !== "string")) rec.problem = `${rec.method} ${u.pathname} ${rec.status}: error body without {error, message}`;
      if (rec.status < 300) for (const [m, re, keys] of SHAPES) if ((m === "*" || m === rec.method) && re.test(u.pathname + u.search)) {
        const miss = missing(b, keys); if (miss.length) rec.problem = `${rec.method} ${u.pathname}: missing ${miss.join(", ")}`;
      }
    }).catch(() => {});
  });
}
// A body can stay pending forever when the page navigates away: wait at most 3 seconds.
async function settleCalls() { await Promise.race([Promise.all(calls.map((c) => c.body).filter(Boolean)), new Promise((r) => setTimeout(r, 3000))]); }
function apiProblems(title, allow) {
  const neg = /^Negative/.test(title);
  const out = [];
  for (const c of calls) {
    if (c.problem) out.push(c.problem);
    if (!c.status || c.status < 400) continue;
    if (c.status >= 500) { out.push(`${c.method} ${c.path} answered ${c.status}`); continue; }
    if (neg || allow.includes(c.status) || allow.some((x) => x instanceof RegExp && x.test(`${c.status} ${c.method} ${c.path}`))) continue;
    out.push(`${c.method} ${c.path} answered ${c.status}`);
  }
  const writes = calls.filter((c) => c.status && c.method !== "GET").map((c) => `${c.method} ${c.path}`);
  const dup = [...new Set(writes.filter((w, i) => writes.indexOf(w) !== i))];
  return { out: [...new Set(out)], dup };
}

// ---- checkpoint screenshots (viewport only), numbered in run order, in a fresh folder for this run ----
const SHOTS = `${homedir()}/Desktop/ODeL test screenshots/B1 end to end (${new Date().toISOString().slice(0, 10)})`;
rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true });
let shots = 0;
async function shot(page, name) {
  shots += 1;
  const file = `${String(shots).padStart(3, "0")} ${name.replace(/[\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 90).trim()}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}` }).catch(() => {});
}
/** Every screen and dialog: nothing scrolls sideways; an open dialog fits the window and its buttons are fully visible. */
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const over = document.documentElement.scrollWidth - window.innerWidth;
    if (over > 0) out.push(`the page scrolls sideways by ${over}px`);
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const d of [...document.querySelectorAll("dialog[open], [role=dialog]")].filter(vis)) {
      const r = d.getBoundingClientRect(); const name = (d.querySelector("h2,h1")?.textContent ?? "dialog").trim().slice(0, 50);
      if (r.top < -1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.right > window.innerWidth + 1) out.push(`"${name}" is ${Math.round(r.height)}px tall and does not fit the ${window.innerHeight}px window`);
      for (const btn of [...d.querySelectorAll("button, a[href]")].filter(vis)) {
        const b = btn.getBoundingClientRect(); const label = btn.textContent.trim().slice(0, 30);
        if (!label || btn.closest("[class*=overflow-y-auto], [class*=overflow-auto]")) continue; // inside a scrolling body: reachable by scrolling
        if (b.bottom > window.innerHeight + 1 || b.top < -1 || b.right > window.innerWidth + 1) out.push(`"${label}" in "${name}" is cut off`);
      }
    }
    return out;
  });
}

async function step(page, title, fn, { allow = [] } = {}) {
  n += 1; const id = String(n).padStart(3, "0");
  calls = [];
  try {
    await fn();
    await page.waitForTimeout(1000); // let the person watching see the result
    const lay = await layoutProblems(page).catch(() => []);
    if (lay.length) throw new Error(`Layout: ${lay.join(" | ")}`);
    await shot(page, title);
    await settleCalls();
    const { out, dup } = apiProblems(title, allow);
    groupCalls.push(...calls.filter((c) => c.status));
    if (dup.length) console.log(`      note: the same write sent twice in this step: ${dup.join("; ")}`);
    if (out.length) throw new Error(`API: ${out.join(" | ")}`);
    results.push({ id, title, ok: true });
    console.log(`  ✓ ${id} ${title}`);
  } catch (e) {
    groupCalls.push(...calls.filter((c) => c.status));
    const seen = await page.evaluate(() => ([...document.querySelectorAll("[role=dialog]")].filter((d) => d.getClientRects().length).pop()?.innerText ?? document.querySelector("main")?.innerText ?? document.body.innerText).replace(/\s+/g, " ").slice(0, 900)).catch(() => "");
    console.log(`      at ${page.url()}\n      page says: ${seen}`);
    await shot(page, `FAILED ${title}`);
    results.push({ id, title, ok: false, error: String(e.message).split("\n")[0] });
    console.log(`  ✗ ${id} ${title}\n      ${String(e.message).split("\n")[0]}`);
    throw e;
  }
}
function apiSummary() {
  if (!groupCalls.length) return;
  const by = {};
  for (const c of groupCalls) by[c.status] = (by[c.status] ?? 0) + 1;
  const errs = [...new Set(groupCalls.filter((c) => c.status >= 400).map((c) => `${c.status} ${c.method} ${c.path.split("?")[0]}`))];
  console.log(`    API: ${groupCalls.length} calls · ${Object.entries(by).map(([k, v]) => `${k}×${v}`).join(" ")}${errs.length ? ` · errors: ${errs.join("; ")}` : ""}`);
  groupCalls.length = 0;
}
let stopped = false;
async function group(letter, name, fn, { always = false } = {}) {
  if (!always && (stopped || letter > UNTIL)) { stopped = true; return; }
  console.log(`\n${letter} · ${name}`);
  try { await fn(); } catch { console.log("    (rest of this group skipped)"); }
  apiSummary();
}

const browser = await chromium.launch({
  headless: false, slowMo: Number(process.env.SLOW ?? 600),
  // A 1440×900 window; the page gets what is left after the browser's own bars, so what you see is what is checked.
  args: ["--window-size=1440,900", `--host-resolver-rules=MAP odel-dev.oyeksglobal.com ${IP}, MAP odel-console-dev.oyeksglobal.com ${IP}, MAP *.odel-dev.oyeksglobal.com ${IP}`],
});
const desktop = { viewport: null, acceptDownloads: true };
// One window for the whole walkthrough: the console and the university keep their own cookies (per host), and people on the
// university's address take turns by signing out and in, as on a shared computer.
const ctx = await browser.newContext(desktop);
watch(ctx, "browser");
const p = await ctx.newPage();
const c = p, a = p, s = p, b = p;
// A navigation that a sign-out redirect interrupts is tried once more.
{
  const goto = p.goto.bind(p);
  p.goto = async (url, opts) => {
    try { return await goto(url, opts); }
    catch (e) { if (!/ERR_ABORTED|interrupted by another navigation/.test(String(e))) throw e; await p.waitForTimeout(800); return goto(url, opts); }
  };
}
const base = await p.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
const desk = () => p.setViewportSize(base);
const phone = () => p.setViewportSize({ width: 390, height: 844 });

// ---- who is signed in on the university's address ----
let who = null;
async function leave() {
  if (!who) return;
  await p.goto(who === "student" ? `${UNI}/` : `${UNI}/staff`);
  await p.waitForLoadState("load"); await p.waitForTimeout(700);
  const btn = p.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first();
  if (await btn.count()) {
    await btn.click(); await p.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await p.waitForURL(/sign-in/); await p.waitForLoadState("load"); await p.waitForTimeout(700);
  }
  who = null;
}
async function staffIn(person) {
  if (who === person.key) return;
  await leave(); await desk();
  await p.goto(`${UNI}/staff/sign-in`); await google(p, person.pick);
  await p.waitForURL((u) => !u.pathname.startsWith("/api/"));
  if (/two-step/.test(p.url())) {
    await typeCode(p, await code(person.secret()));
    if (person.trust) { const t = p.getByText("Trust this computer for 30 days"); if (await t.isVisible()) await t.click(); }
    await p.getByRole("button", { name: "Verify" }).click();
  }
  await p.waitForURL((u) => u.pathname.startsWith("/staff") && !u.pathname.startsWith("/staff/sign-in"));
  who = person.key;
}

// ---- page helpers ----
async function typeCode(page, value) {
  await page.locator('input[inputmode="numeric"]').first().click();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type(value, { delay: 40 });
}
// Typed the way a person types (short values character by character); dates, files and long texts are filled at once.
{
  const proto = Object.getPrototypeOf(p.locator("body"));
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
async function google(page, who) {
  await page.getByText("Continue with university Google account").click();
  await page.waitForURL(/auth\/dev\/google/);
  if (who.includes("@")) { await page.fill("#email", who); await page.getByRole("button", { name: "Continue", exact: true }).click(); }
  else await page.getByRole("button", { name: new RegExp(who) }).click();
}
/** Choose the option whose text matches. */
async function pick(select, re) {
  await select.locator("option").nth(1).waitFor({ state: "attached" });
  const v = await select.evaluate((el, src) => { const r = new RegExp(src); return [...el.options].find((o) => r.test(o.textContent))?.value ?? null; }, re.source);
  if (v == null) throw new Error(`no option matching ${re}`);
  await select.selectOption(v);
}
/** A GET from inside the page (same origin, its cookies). */
const apiGet = (page, path) => page.evaluate(async (p) => { const r = await fetch(p); return { status: r.status, body: await r.json().catch(() => null) }; }, path);
async function noSideways(page) {
  await page.waitForLoadState("load"); await page.waitForTimeout(500);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) throw new Error(`the page scrolls sideways by ${over}px`);
}
const csvFile = (name, rows) => ({ name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\n") + "\n") });
const steps = (page) => page.getByRole("region", { name: "Setup steps" }).getByRole("listitem");
async function checklist(page) { await page.goto(`${UNI}/staff/setup`); await page.getByText(/of 9 steps complete/).waitFor(); }
async function expectDone(page, ...nums) {
  for (const k of nums) {
    const t = await steps(page).nth(k - 1).innerText();
    if (!/Done/.test(t)) throw new Error(`step ${k} is not done: ${t.replace(/\s+/g, " ")}`);
  }
}

const slug = process.env.SLUG ?? "lakeshore";
const DOMAIN = "lakeshore.test";
const uni = { name: "Lakeshore University", short: "Lakeshore ODeL", slug, admin: "Bola Ige", email: `bola.ige@${DOMAIN}` };
const UNI = `https://${slug}.${BASE}`;
const BELLO = { name: "Dr Funmi Bello", email: `f.bello@${DOMAIN}` };
const ADE = { name: "Mrs Bisi Ade", email: `b.ade@${DOMAIN}` };
const ADEOLA = { matric: "LU/ODL/24/0153", email: `adeola.okafor@${DOMAIN}`, name: "Adeola Okafor" };
const NO_EMAIL = "LU/ODL/24/0201";
let adminSecret = null, belloSecret = null, uniId = null;

/** Dev only: delete a university, sent from inside the signed-in console page (session cookie + CSRF header, like the app). */
async function consoleIn() {
  await desk(); await c.goto(CONSOLE);
  if (/sign-in/.test(c.url())) { // the console session may have ended after 30 idle minutes
    await google(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click(); await c.getByText(/Wesley University/).first().waitFor();
  }
}
async function deleteUni(id) {
  await consoleIn();
  const r = await c.evaluate(async (id) => {
    const read = () => decodeURIComponent((document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/) ?? [])[1] ?? "");
    if (!read()) await fetch("/api/v1/public/context");
    const res = await fetch(`/api/v1/dev/tenants/${id}`, { method: "DELETE", headers: { "X-XSRF-TOKEN": read() } });
    return { status: res.status, body: await res.text() };
  }, id);
  if (r.status !== 204) throw new Error(`delete answered ${r.status}: ${r.body}`);
}

await group("A", "Provider signs in to the console", async () => {
  await step(c, "Console asks to sign in", async () => { await c.goto(CONSOLE); await c.waitForURL(/\/sign-in/); });
  await step(c, "Chuka Obi chosen on the dev Google page, then his two-step code", async () => {
    await google(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click();
    await c.getByText(/Wesley University/).first().waitFor();
  });
  await step(c, "A Lakeshore left by an interrupted run is deleted first", async () => {
    const r = await apiGet(c, "/api/v1/platform/tenants");
    const old = r.body?.items?.find((t) => t.slug === slug);
    if (old) { await deleteUni(old.id); console.log("      (deleted a leftover test university; waiting a minute for the gateway to forget it)"); await c.waitForTimeout(61_000); }
  });
});

await group("B", "Provider adds Lakeshore University, staff domain lakeshore.test", async () => {
  await step(c, "Add a university: details", async () => {
    await c.goto(`${CONSOLE}/universities/new`); await c.getByText("Add a university").first().waitFor();
    await c.getByLabel("Full name").fill(uni.name); await c.getByLabel("Short name").fill(uni.short);
    await c.getByLabel("Short address").fill(uni.slug);
    await c.getByLabel(/First admin’s name/).fill(uni.admin); await c.getByLabel(/First admin’s email/).fill(uni.email);
    await c.getByLabel("Staff Google domain").fill(DOMAIN);
    await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByLabel("Main colour").first().waitFor();
  });
  await step(c, "Branding, defaults, review and create", async () => {
    await c.getByLabel("Main colour").first().fill("#1F5F7A"); await c.getByLabel("Accent colour").first().fill("#D4A017");
    await c.getByText(/reads well/).first().waitFor();
    await c.getByRole("button", { name: "Next: rules and payments" }).click();
    await c.getByRole("button", { name: "Next: review" }).click();
    await c.getByRole("button", { name: "Create the university" }).click(); await c.getByText(/is set up/).first().waitFor();
    uniId = c.url().match(/universities\/([0-9a-f-]{36})/)?.[1] ?? null;
    if (!uniId) throw new Error("no university id in the address");
  });
  await step(c, "The first admin's invitation is in the email log (a .test address: recorded, not sent)", async () => {
    const m = await waitEmail(uni.email, Date.now() - 120_000, (e) => /invited/i.test(e.subject));
    if (!m.body.includes(`${UNI}/staff`)) throw new Error(`the invitation does not link to ${UNI}/staff`);
  });
});

const ADMIN = { key: "admin", pick: "Bola Ige", secret: () => adminSecret, trust: true };
const BELLO_IN = { key: "bello", pick: "f.bello@lakeshore.test", secret: () => belloSecret };
await group("C", "Bola Ige (ODeL admin) gets in: two-step set-up, day-one checklist (W-10)", async () => {
  await step(a, "Lakeshore's sign-in page", async () => {
    // The gateway remembers an unknown address for a minute (e.g. right after the previous run deleted it): try again until it opens.
    for (let i = 0; i < 8; i++) {
      await a.goto(`${UNI}/staff/sign-in`);
      if (await a.getByText("Lakeshore University").first().isVisible().catch(() => false)) break;
      await a.waitForTimeout(10_000);
    }
    await a.getByText("Lakeshore University").first().waitFor();
  }, { allow: [404] });
  await step(a, "Dev 'Choose an account' lists Bola Ige; two-step set-up shows the key (W-04)", async () => {
    await google(a, "Bola Ige"); await a.getByText("1. Scan with your authenticator app").waitFor();
    adminSecret = (await a.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  });
  await step(a, "Right code, backup codes saved, lands on the checklist", async () => {
    await typeCode(a, await code(adminSecret)); await a.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await a.getByText("Save your backup codes").waitFor(); await a.getByRole("button", { name: /saved them/ }).click();
    await a.waitForURL(/\/staff\/setup$/); who = "admin";
  });
  await step(a, "Day one: 0 of 9 steps, import locked until steps 1, 2 and 4, welcome locked", async () => {
    await a.getByText("0 of 9 steps complete").waitFor();
    if (!/Finish steps 1, 2 and 4 first/.test(await steps(a).nth(7).innerText())) throw new Error("step 8 is not locked as expected");
    if (!/Import students first/.test(await steps(a).nth(8).innerText())) throw new Error("step 9 is not locked as expected");
  });
  await step(a, "Phone size: the checklist on a 390 px screen does not scroll sideways", async () => {
    await a.setViewportSize({ width: 390, height: 844 }); await noSideways(a); await a.getByText("0 of 9 steps complete").waitFor();
  });
  await desk();
});

await group("D", "Sessions and semesters (W-11, W-11c)", async () => {
  const sheet = a.getByRole("dialog", { name: "New session" });
  const first = sheet.getByRole("group", { name: "First semester" });
  const second = sheet.getByRole("group", { name: "Second semester" });
  async function dates(s2start = "2027-03-15") {
    await first.getByLabel("Starts").fill("2026-10-05"); await first.getByLabel("Ends").fill("2027-02-26");
    await first.getByLabel("Registration opens").fill("2026-10-05"); await first.getByLabel("Registration closes", { exact: true }).fill("2026-10-23");
    await second.getByLabel("Starts").fill(s2start); await second.getByLabel("Ends").fill("2027-07-30");
  }
  await step(a, "Start from the checklist: no session yet", async () => {
    await a.getByRole("link", { name: "Start: Session and semesters" }).click(); await a.getByRole("heading", { name: "No session yet" }).waitFor();
  });
  await step(a, "Negative - '2026-27' is refused: write it as 2026/2027", async () => {
    await a.getByRole("button", { name: "New session" }).first().click();
    await sheet.getByLabel("Session name").fill("2026-27"); await dates();
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText("Write the session as 2026/2027.").first().waitFor();
  });
  await step(a, "Negative - a second semester starting before the first ends is refused", async () => {
    await sheet.getByLabel("Session name").fill("2026/2027"); await second.getByLabel("Starts").fill("2027-02-01");
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/The second semester must start after the first one ends/).first().waitFor();
  });
  await step(a, "2026/2027 with two semesters and a registration window saved as a draft", async () => {
    await second.getByLabel("Starts").fill("2027-03-15");
    await sheet.getByRole("button", { name: "Save draft" }).click(); await a.getByText("2026/2027 is saved as a draft.").waitFor();
    await a.getByRole("table", { name: /Sessions/ }).getByText("Draft").waitFor();
  });
  await step(a, "Negative - the same session name again is refused", async () => {
    await a.getByRole("button", { name: "New session" }).first().click();
    await sheet.getByLabel("Session name").fill("2026/2027"); await dates();
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/There is already a 2026\/2027 session/).first().waitFor();
  });
  await step(a, "Negative - a session whose dates overlap 2026/2027 is refused", async () => {
    await sheet.getByLabel("Session name").fill("2027/2028");
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/These dates overlap 2026\/2027/).first().waitFor();
    await sheet.getByRole("button", { name: "Cancel" }).click();
  });
  await step(a, "Make 2026/2027 active", async () => {
    await a.getByRole("button", { name: "Make 2026/2027 active" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "Make active" }).click();
    await a.getByText("2026/2027 is now the active session.").waitFor();
  });
  await step(a, "Checklist: step 1 done with its summary", async () => {
    await checklist(a); await expectDone(a, 1);
    await steps(a).nth(0).getByText(/2026\/2027 · 2 semesters/).waitFor();
  });
});

await group("E", "Academic structure (W-12, W-12c)", async () => {
  await step(a, "Faculty of Science → Computer Science → B.Sc. Computer Science", async () => {
    await a.goto(`${UNI}/staff/academic-setup/structure`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "Add faculty" }).first().click();
    let dlg = a.getByRole("dialog", { name: "Add a faculty" });
    await dlg.getByLabel("Name").fill("Faculty of Science"); await dlg.getByLabel("Code").fill("SCI");
    await dlg.getByRole("button", { name: "Add faculty" }).click();
    await a.getByRole("heading", { name: "Faculty of Science", level: 2 }).waitFor();
    await a.getByRole("button", { name: "Add department" }).click();
    dlg = a.getByRole("dialog", { name: "Add a department" });
    await dlg.getByLabel("Name").fill("Computer Science"); await dlg.getByLabel("Code").fill("CSC");
    await dlg.getByRole("button", { name: "Add department" }).click();
    await a.getByRole("heading", { name: "Computer Science", level: 2 }).waitFor();
    await a.getByRole("button", { name: "Add programme" }).click();
    dlg = a.getByRole("dialog", { name: "Add a programme" });
    await dlg.getByLabel("Name").fill("B.Sc. Computer Science"); await dlg.getByLabel("Code").fill("BSC-CSC");
    await dlg.getByRole("button", { name: "Add programme" }).click();
    await a.getByRole("heading", { name: "B.Sc. Computer Science", level: 2 }).waitFor();
    await a.getByText("4 years · 8 semesters").waitFor();
  });
  await step(a, "Negative - a faculty code already used is refused", async () => {
    await a.getByRole("button", { name: "Add faculty" }).first().click();
    const dlg = a.getByRole("dialog", { name: "Add a faculty" });
    await dlg.getByLabel("Name").fill("Faculty of Sciences"); await dlg.getByLabel("Code").fill("SCI");
    await dlg.getByRole("button", { name: "Add faculty" }).click(); await dlg.getByText("SCI is already used by Faculty of Science.").first().waitFor();
    await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  const imp = a.getByRole("dialog", { name: "Import faculties, departments and programmes" });
  await step(a, "Structure CSV with a bad row: the row is reported and nothing is saved yet", async () => {
    await a.getByRole("button", { name: "Import from CSV" }).click();
    await imp.getByLabel("Choose a CSV file").setInputFiles(csvFile("lakeshore_structure.csv", [
      "faculty_name,faculty_code,department_name,department_code,programme_name,programme_code,degree,duration_years,entry_levels",
      "Faculty of Management Sciences,MGT,Accounting,ACC,B.Sc. Accounting,BSC-ACC,B.Sc.,4,100;200",
      "Faculty of Management Sciences,MGT,Business Administration,BUS,B.Sc. Business Administration,BSC-BUS,B.Sc.,9,100",
    ]));
    await imp.getByText("1 row needs fixing").waitFor(); await imp.getByText(/^Row 3: .*duration/i).waitFor();
    const tree = await a.getByRole("tree").innerText();
    if (tree.includes("Management")) throw new Error("the tree already shows the file's faculty before confirming");
  });
  await step(a, "Import the rest: only the good row is added", async () => {
    await imp.getByRole("button", { name: "Import the rest" }).click();
    await imp.getByText("Added 1 faculty, 1 department and 1 programme.").waitFor();
    await imp.getByRole("button", { name: "Done" }).click();
    await a.getByRole("tree").getByText("Faculty of Management Sciences").waitFor();
    if ((await a.getByRole("tree").innerText()).includes("Business Administration")) throw new Error("the bad row was imported");
  });
  await step(a, "Checklist: step 2 done", async () => { await checklist(a); await expectDone(a, 1, 2); });
});

await group("F", "Course catalogue (W-13, W-13b, W-13c)", async () => {
  await step(a, "Add CSC 201 · Data Structures (3 units, 200L, first semester), typed as csc201", async () => {
    await a.goto(`${UNI}/staff/courses`);
    await a.getByRole("button", { name: "Add course" }).first().click();
    const dlg = a.getByRole("dialog", { name: "Add a course" });
    await dlg.getByLabel("Code").fill("csc201"); await dlg.getByLabel("Units").fill("3"); await dlg.getByLabel("Title").fill("Data Structures");
    await dlg.getByLabel("Level").selectOption("200"); await dlg.getByLabel("Semester").selectOption("1");
    await dlg.getByRole("button", { name: "Offered to" }).click(); await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
    await dlg.getByRole("button", { name: "Add course" }).click();
    await a.getByText("Added CSC 201 · Data Structures.").waitFor();
  });
  await step(a, "Negative - CSC 201 a second time is refused", async () => {
    await a.getByRole("button", { name: "Add course" }).first().click();
    const dlg = a.getByRole("dialog", { name: "Add a course" });
    await dlg.getByLabel("Code").fill("CSC 201"); await dlg.getByLabel("Units").fill("2"); await dlg.getByLabel("Title").fill("Data Structures again");
    await dlg.getByLabel("Level").selectOption("200"); await dlg.getByLabel("Semester").selectOption("1");
    await dlg.getByRole("button", { name: "Offered to" }).click(); await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
    await dlg.getByRole("button", { name: "Add course" }).click();
    await dlg.getByText(/CSC 201 is already in the catalogue/).first().waitFor();
    await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  const imp = a.getByRole("dialog", { name: "Import the course catalogue" });
  await step(a, "Catalogue CSV with an unknown programme: the row is reported, nothing saved yet", async () => {
    await a.getByRole("button", { name: "Import CSV" }).click();
    await imp.getByLabel("Choose a CSV file").setInputFiles(csvFile("lakeshore_catalogue.csv", [
      "code,title,units,level,semester,programme_code,kind",
      "CSC 202,Operating Systems,3,200,2,BSC-CSC,core",
      "ACC 201,Financial Accounting,3,200,1,BSC-ACC,core",
      "CSC 203,Computer Networks,3,200,1,BSC-XYZ,core",
    ]));
    await imp.getByText("1 row needs fixing").waitFor(); await imp.getByText(/^Row 4: .*BSC-XYZ/).waitFor();
    const r = await apiGet(a, "/api/v1/academic/courses?search=CSC%20202");
    if (r.body?.total !== 0) throw new Error(`CSC 202 is already saved before confirming (${JSON.stringify(r.body?.total)})`);
  });
  await step(a, "Import the rest: two courses added, the bad one not", async () => {
    await imp.getByRole("button", { name: "Import the rest" }).click();
    await imp.getByText("Added 2 courses to the catalogue.").waitFor(); await imp.getByRole("button", { name: "Done" }).click();
    await a.getByText("ACC 201").first().waitFor();
    if (await a.getByText("CSC 203").count()) throw new Error("the bad row was imported");
  });
  await step(a, "Checklist: step 3 done", async () => { await checklist(a); await expectDone(a, 1, 2, 3); });
});

await group("G", "Study centres and rooms (W-14, W-14c, W-14d)", async () => {
  await step(a, "Add Akure Study Centre (AKR, Ondo, phone)", async () => {
    await a.goto(`${UNI}/staff/centres`);
    await a.getByRole("button", { name: "Add centre" }).first().click();
    const dlg = a.getByRole("dialog", { name: "Add a study centre" });
    await dlg.getByLabel("Centre name").fill("Akure Study Centre"); await dlg.getByLabel("Code").fill("AKR");
    await dlg.getByLabel("State").selectOption("Ondo"); await dlg.getByLabel(/Phone students can call/).fill("0803 555 0117");
    await dlg.getByRole("button", { name: "Add centre" }).click();
    await a.getByRole("dialog", { name: "Akure Study Centre" }).getByText("No rooms yet").waitFor();
  });
  await step(a, "Negative - a room with more computers than seats is refused", async () => {
    await a.getByRole("dialog", { name: "Akure Study Centre" }).getByRole("button", { name: "Add room" }).click();
    const dlg = a.getByRole("dialog", { name: "Add a room" });
    await dlg.getByLabel("Room name").fill("Room 1"); await dlg.getByLabel("Seats").fill("30"); await dlg.getByLabel("Computers").fill("40");
    await dlg.getByRole("button", { name: "Add room" }).click(); await dlg.getByText("A room cannot have more computers than seats.").waitFor();
  });
  await step(a, "Room 1 with 30 seats and 30 computers", async () => {
    const dlg = a.getByRole("dialog", { name: "Add a room" });
    await dlg.getByLabel("Computers").fill("30"); await dlg.getByRole("button", { name: "Add room" }).click();
    const profile = a.getByRole("dialog", { name: "Akure Study Centre" });
    await profile.getByText("30 seats · 30 computers · exam use").waitFor(); await profile.getByRole("button", { name: "Cancel" }).click();
  });
  await step(a, "Checklist: step 4 done, import of students unlocked", async () => {
    await checklist(a); await expectDone(a, 1, 2, 3, 4);
    if (/Locked/.test(await steps(a).nth(7).innerText())) throw new Error("step 8 is still locked");
  });
});

await group("H", "People & roles (W-15, W-15b, W-15c)", async () => {
  const dlg = a.getByRole("dialog", { name: "Invite a staff member" });
  await step(a, "Negative - an address outside lakeshore.test is refused", async () => {
    await a.goto(`${UNI}/staff/people`);
    await a.getByRole("button", { name: "Invite staff" }).first().click();
    await dlg.getByLabel("Full name").fill(BELLO.name); await dlg.getByLabel("University email").fill("f.bello@gmail.com");
    await dlg.getByRole("button", { name: "Lecturer", exact: true }).click();
    await pick(dlg.getByLabel("Department", { exact: true }), /Computer Science · Faculty of Science/);
    await dlg.getByRole("button", { name: "Send invite" }).click(); await dlg.getByText(`Use an @${DOMAIN} address`).first().waitFor();
  });
  await step(a, "Invite Dr Funmi Bello, lecturer in Computer Science", async () => {
    await dlg.getByLabel("University email").fill(BELLO.email); await dlg.getByRole("button", { name: "Send invite" }).click();
    await a.getByText(`Invited ${BELLO.name}.`).waitFor();
  });
  await step(a, "Invite Mrs Bisi Ade, coordinator of the Akure centre", async () => {
    await a.getByRole("button", { name: "Invite staff" }).first().click();
    await dlg.getByLabel("Full name").fill(ADE.name); await dlg.getByLabel("University email").fill(ADE.email);
    await dlg.getByRole("button", { name: "Centre coordinator", exact: true }).click();
    await pick(dlg.getByLabel("Study centre"), /Akure Study Centre/);
    await dlg.getByRole("button", { name: "Send invite" }).click(); await a.getByText(`Invited ${ADE.name}.`).waitFor();
  });
  await step(a, "Their invitations are in the email log, with Lakeshore's sign-in link", async () => {
    for (const p of [BELLO, ADE]) {
      const m = await waitEmail(p.email, Date.now() - 300_000, (e) => /invited/i.test(e.subject));
      if (!m.body.includes(`${UNI}/staff`)) throw new Error(`${p.email}'s invitation has no link to ${UNI}/staff`);
    }
  });
  const bulk = a.getByRole("dialog", { name: "Invite staff from a CSV file" });
  await step(a, "Bulk invite CSV: unknown role, an existing email and a wrong domain are reported, nothing sent yet", async () => {
    await a.getByRole("button", { name: "Bulk invite (CSV)" }).click();
    await bulk.getByLabel("Choose a CSV file").setInputFiles(csvFile("lakeshore_staff.csv", [
      "full_name,email,role,scope_type,scope_code",
      `Dr Kemi Ola,k.ola@${DOMAIN},Lecturer,UNIVERSITY,`,
      `Mr Tunde Ojo,t.ojo@${DOMAIN},Wizard,UNIVERSITY,`,
      `Dr Funmi Bello,${BELLO.email},Lecturer,UNIVERSITY,`,
      "Mrs Yemi Ade,yemi.ade@gmail.com,Facilitator,UNIVERSITY,",
    ]));
    await bulk.getByText("3 rows need fixing").waitFor();
    if ((await apiGet(a, "/api/v1/people?search=Kemi")).body?.total !== 0) throw new Error("Kemi Ola was invited before confirming");
  });
  await step(a, "Confirm: the good row is invited", async () => {
    await bulk.getByRole("button", { name: "Import the rest" }).click(); await bulk.getByText(/Invited 1 person/).waitFor();
    await bulk.getByRole("button", { name: "Done" }).click();
    await a.getByRole("button", { name: "Dr Kemi Ola" }).first().waitFor();
  });
  await step(a, "Checklist: step 5 done (a lecturer is invited)", async () => { await checklist(a); await expectDone(a, 5); });
});

await group("I", "Staffing (W-16, W-16b, W-16c)", async () => {
  const tab = (re) => a.getByRole("link", { name: re });
  async function assign(course, who) {
    await a.getByRole("button", { name: `Assign staff for ${course}` }).click();
    const dlg = a.getByRole("dialog", { name: new RegExp(`Who teaches ${course}`) });
    await pick(dlg.getByLabel("Lecturer"), who); await dlg.getByRole("button", { name: "Save" }).click();
    await a.getByText(`Saved who teaches ${course}.`).waitFor();
  }
  await step(a, "Before any import: the banner, and 3 courses still need a lecturer", async () => {
    await a.goto(`${UNI}/staff/academic-setup/staffing`);
    await a.getByText(/No students imported yet for 2026\/2027/).waitFor(); await tab(/^Courses \(3 need a lecturer\)/).waitFor();
    if (!/3 courses still need a lecturer/.test(await (await checklistText()))) throw new Error("the checklist does not say 3 courses still need a lecturer");
  });
  await step(a, "Dr Bello on CSC 201: 2 left", async () => { await assign("CSC 201", /Bello/); await tab(/^Courses \(2 need a lecturer\)/).waitFor(); });
  await step(a, "Dr Kemi Ola on CSC 202 and ACC 201: none left", async () => {
    await assign("CSC 202", /Kemi Ola/); await assign("ACC 201", /Kemi Ola/); await tab(/^Courses \(0 need a lecturer\)/).waitFor();
  });
  await step(a, "Mrs Ade is the Akure coordinator", async () => {
    await tab(/^Centres \(/).click();
    await a.getByRole("button", { name: "Assign coordinator for Akure Study Centre" }).click();
    const dlg = a.getByRole("dialog", { name: "Coordinator for Akure Study Centre" });
    await pick(dlg.getByLabel("Coordinator"), /Bisi Ade/); await dlg.getByRole("button", { name: "Save" }).click();
    await a.getByText("Saved the coordinator for Akure Study Centre.").waitFor();
  });
  await step(a, "Checklist: step 6 done", async () => { await checklist(a); await expectDone(a, 6); });
});
async function checklistText() {
  const back = p.url();
  await p.goto(`${UNI}/staff/setup`); await p.getByText(/of 9 steps complete/).waitFor();
  const t = await p.getByRole("region", { name: "Setup steps" }).innerText();
  await p.goto(back); return t;
}

await group("J", "Grading rules (W-17, W-17b, W-17c, W-17d)", async () => {
  await step(a, "First visit: the built-in defaults", async () => {
    await a.goto(`${UNI}/staff/academic-setup/grading`); await a.getByText("These are the built-in default rules").waitFor();
  });
  await step(a, "Negative - CA 40 / exam 50 is refused (W-17c) and Save is disabled", async () => {
    await a.getByLabel("Coursework (CA)").fill("40"); await a.getByLabel("Exam").fill("50");
    await a.getByText("Must add up to 100").waitFor(); await a.getByText("Fix 1 problem: the weights add up to 90").waitFor();
    if (await a.getByRole("button", { name: /^(Confirm these rules|Save rules)$/ }).isEnabled()) throw new Error("Save is enabled with 40/50");
    await a.getByLabel("Coursework (CA)").fill("30"); await a.getByLabel("Exam").fill("70");
  });
  await step(a, "Negative - overlapping bands C and D are refused", async () => {
    await a.getByRole("button", { name: "Edit bands" }).click();
    const cFrom = await a.getByRole("group", { name: "Band C" }).getByLabel("From").inputValue();
    await a.getByRole("group", { name: "Band D" }).getByLabel("To").fill(String(Number(cFrom) + 2));
    await a.getByText(/bands C and D overlap/).waitFor();
    if (await a.getByRole("button", { name: "Save bands" }).isEnabled()) throw new Error("Save bands is enabled with overlapping bands");
    await a.getByRole("button", { name: "Cancel" }).first().click();
  });
  await step(a, "Confirm the default rules", async () => {
    // After typing 30/70 back the form counts as changed, so the button reads "Save rules".
    await a.getByRole("button", { name: /^(Confirm these rules|Save rules)$/ }).click(); await a.getByText(/Saved\. Version \d+ applies from/).waitFor();
  });
  await step(a, "B.Sc. Computer Science gets its own rules (40/60)", async () => {
    await pick(a.getByLabel("Rules for"), /B\.Sc\. Computer Science/);
    await a.getByText("B.Sc. Computer Science follows the default rules").waitFor();
    await a.getByLabel("Coursework (CA)").fill("40"); await a.getByLabel("Exam").fill("60");
    await a.getByRole("button", { name: "Save rules" }).click(); await a.getByText("B.Sc. Computer Science has its own rules").waitFor();
  });
  await step(a, "…and uses the default again", async () => {
    await a.getByRole("button", { name: "Use the default again" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "Use the default" }).click();
    await a.getByText("B.Sc. Computer Science follows the default rules").waitFor();
  });
  await step(a, "Checklist: steps 1 to 7 done, 7 of 9", async () => {
    await checklist(a); await expectDone(a, 1, 2, 3, 4, 5, 6, 7); await a.getByText("7 of 9 steps complete").waitFor();
  });
});

await group("K", "Staff accounts: suspend, restore and reset two-step (W-21)", async () => {
  await step(b, "Bola signs out; Dr Bello signs in for the first time and sets up two-step", async () => {
    await leave(); await b.goto(`${UNI}/staff/sign-in`); await google(b, BELLO.email);
    await b.getByText("1. Scan with your authenticator app").waitFor();
    belloSecret = (await b.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
    await typeCode(b, await code(belloSecret)); await b.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await b.getByRole("button", { name: /saved them/ }).click(); await b.waitForURL(/\/staff/); who = "bello";
  });
  await step(a, "Dr Bello signs out; Bola signs in with her code and trusts this computer", async () => { await staffIn(ADMIN); });
  const sheet = a.getByRole("dialog", { name: BELLO.name });
  async function openBello() { await a.goto(`${UNI}/staff/people`); await a.getByRole("button", { name: BELLO.name }).first().click(); await sheet.getByText(/Active|Suspended/).first().waitFor(); }
  await step(a, "Suspend asks for a reason and names the course he lectures", async () => {
    await openBello(); await sheet.getByText("Active").first().waitFor();
    await sheet.getByRole("button", { name: `Suspend ${BELLO.name}` }).click();
    const dlg = a.getByRole("dialog", { name: `Suspend ${BELLO.name}?` });
    await dlg.getByText(/CSC 201/).first().waitFor();
    await dlg.getByRole("button", { name: "Suspend" }).click(); await dlg.getByText("Write why. It is kept in the audit log.").waitFor();
    await dlg.getByLabel("Reason (kept in the audit log)").fill("On leave from 1 Dec"); await dlg.getByRole("button", { name: "Suspend" }).click();
    await a.getByText(`${BELLO.name} is suspended and was signed out everywhere.`).waitFor();
  });
  await step(b, "Negative - suspended: Dr Bello's sign-in is refused", async () => {
    await leave(); await b.goto(`${UNI}/staff/sign-in`); await google(b, BELLO.email); await b.waitForURL(/error=suspended/);
    await b.getByText(/suspended/i).first().waitFor();
  });
  await step(a, "Bola signs in again (trusted computer: no code) and restores his access", async () => {
    await staffIn(ADMIN); await openBello();
    await sheet.getByRole("button", { name: "Restore access" }).click(); await a.getByText(`${BELLO.name} can sign in again.`).first().waitFor();
  });
  await step(a, "Reset his two-step sign-in (reason required)", async () => {
    await sheet.getByRole("button", { name: "Reset two-step sign-in" }).click();
    const dlg = a.getByRole("dialog", { name: /Reset Dr Funmi Bello’s two-step sign-in/ });
    await dlg.getByRole("button", { name: "Reset two-step sign-in" }).click(); await dlg.getByText(/Write why/).waitFor();
    await dlg.getByLabel("Reason (kept in the audit log)").fill("Lost phone"); await dlg.getByRole("button", { name: "Reset two-step sign-in" }).click();
    await a.getByText(/Reset Dr Funmi Bello’s two-step sign-in/).first().waitFor();
    await a.keyboard.press("Escape");
  });
  await step(b, "His next sign-in asks him to set up two-step again (W-04); he was emailed", async () => {
    await leave(); await b.goto(`${UNI}/staff/sign-in`); await google(b, BELLO.email); await b.getByText("1. Scan with your authenticator app").waitFor();
    await waitEmail(BELLO.email, Date.now() - 300_000, (e) => /two-step/i.test(e.subject + e.body));
    belloSecret = (await b.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
    await typeCode(b, await code(belloSecret)); await b.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await b.getByRole("button", { name: /saved them/ }).click(); await b.waitForURL(/\/staff/); who = "bello";
  });
});

// ---- the portal export: 300 students plus 3 bad rows (a duplicate matric, an unknown centre, an unknown programme), one without email
const FIRST = ["Chidi", "Amaka", "Tunde", "Ngozi", "Emeka", "Halima", "Kunle", "Zainab", "Femi", "Chioma", "Ibrahim", "Yetunde", "Obinna", "Aisha", "Segun"];
const LAST = ["Okeke", "Adeyemi", "Balogun", "Eze", "Lawal", "Nwosu", "Okonkwo", "Bakare", "Danjuma", "Afolabi", "Uche", "Ogunleye"];
const HEADER = "matric_number,surname,first_name,other_names,programme_code,level,study_centre,email,phone";
const PORTAL = [HEADER];
for (let i = 1; i <= 300; i++) {
  const m = `LU/ODL/24/${String(i).padStart(4, "0")}`;
  if (m === ADEOLA.matric) { PORTAL.push(`${m},Okafor,Adeola,,BSC-CSC,200,AKR,${ADEOLA.email},0803 412 4417`); continue; }
  if (m === NO_EMAIL) { PORTAL.push(`${m},Musa,Ibrahim,,BSC-CSC,200,Akure,,0803 412 0201`); continue; }
  const f = FIRST[i % FIRST.length], l = LAST[(i * 7) % LAST.length];
  PORTAL.push(`${m},${l},${f},,${i % 2 ? "BSC-CSC" : "BSC-ACC"},${i % 3 ? 100 : 200},${i % 4 ? "AKR" : "Akure Study Centre"},${f.toLowerCase()}.${l.toLowerCase()}${i}@${DOMAIN},0803 412 ${String(i).padStart(4, "0")}`);
}
PORTAL.push(`LU/ODL/24/0299,Okeke,Chidi,,BSC-CSC,100,AKR,chidi.copy@${DOMAIN},`);
PORTAL.push(`LU/ODL/24/0301,Bello,Sade,,BSC-CSC,100,Ikeja,sade.bello@${DOMAIN},`);
PORTAL.push(`LU/ODL/24/0302,Ojo,Kayode,,BSC-XYZ,100,AKR,kayode.ojo@${DOMAIN},`);
const PORTAL_NAME = "lakeshore_portal_export.csv";

await group("L", "Import students (W-18, W-19, W-18b)", async () => {
  await step(a, "Dr Bello signs out; Bola signs back in (trusted computer: no code)", async () => { await staffIn(ADMIN); });
  await step(a, "Import page with the column guide; the CSV template downloads", async () => {
    await a.goto(`${UNI}/staff/students/import`, { waitUntil: "networkidle" }); await a.getByRole("heading", { name: "Import admitted students" }).waitFor();
    const [dl] = await Promise.all([a.waitForEvent("download"), a.getByText("Download template").first().click()]);
    const text = readFileSync(await dl.path()).toString();
    if (!/matric_number/.test(text.split("\n")[0])) throw new Error(`the template header is ${text.split("\n")[0]}`);
  });
  await step(a, "Negative - an Excel file is refused: save it as CSV", async () => {
    await a.getByLabel("Choose the portal CSV file").setInputFiles({ name: "portal.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK") });
    await a.getByText(/Save it as CSV/).first().waitFor();
  });
  await step(a, `Upload ${PORTAL.length - 1} rows: W-19 shows 299 ready, 4 errors, 1 warning`, async () => {
    await a.getByLabel("Choose the portal CSV file").setInputFiles(csvFile(PORTAL_NAME, PORTAL));
    await a.getByRole("heading", { name: "Check before importing" }).waitFor({ timeout: 60_000 });
    await a.getByRole("button", { name: "Import 299 valid rows" }).waitFor();
    const main = await a.locator("main").innerText();
    for (const re of [/Study centre "Ikeja" not found/, /appears twice in this file/, /Programme code "BSC-XYZ" unknown/, /No email: this student cannot get the welcome/])
      if (!re.test(main)) throw new Error(`the report does not show ${re}`);
  });
  await step(a, "Nothing is saved before confirming", async () => {
    const r = await apiGet(a, "/api/v1/students?q=Okafor");
    if (r.status !== 200 || r.body.total !== 0) throw new Error(`students already saved: ${r.status} ${JSON.stringify(r.body?.total)}`);
  });
  await step(a, "Confirm: 299 students imported, the bad rows skipped", async () => {
    await a.getByRole("button", { name: "Import 299 valid rows" }).click();
    await a.getByRole("heading", { name: "Students imported" }).waitFor({ timeout: 60_000 }); await a.getByText(/299 new/).first().waitFor();
  });
  await step(a, "Import history lists the file", async () => {
    await a.goto(`${UNI}/staff/students/import`); await a.getByRole("button", { name: "Import history" }).click();
    await a.getByRole("dialog", { name: "Import history" }).getByText(PORTAL_NAME).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(a, "Checklist: step 8 done, step 9 open", async () => {
    await checklist(a); await expectDone(a, 8); if (/Locked/.test(await steps(a).nth(8).innerText())) throw new Error("step 9 is still locked");
  });
});

await group("M", "Add one student (W-22c)", async () => {
  const dlg = a.getByRole("dialog", { name: "Add a student" });
  async function fill(matric) {
    await dlg.getByLabel("First name").fill("Grace"); await dlg.getByLabel("Surname").fill("Nwosu");
    await dlg.getByLabel("Matric number").fill(matric);
    await pick(dlg.getByLabel("Programme and level"), /B\.Sc\. Computer Science · 100L/); await pick(dlg.getByLabel("Study centre"), /Akure/);
    await dlg.getByLabel("Email (for the welcome email)").fill(`grace.nwosu@${DOMAIN}`);
    const cb = dlg.getByLabel("Send the welcome email now"); if (await cb.isChecked()) await cb.uncheck();
  }
  await step(a, "Negative - a matric number already on the platform is refused", async () => {
    await a.goto(`${UNI}/staff/students`); await a.getByRole("button", { name: "Add a student" }).click();
    await fill(ADEOLA.matric); await dlg.getByRole("button", { name: "Add student" }).click();
    await dlg.getByText(/already/i).first().waitFor();
  });
  await step(a, "A late admission, Grace Nwosu, is added", async () => {
    await dlg.getByLabel("Matric number").fill("LU/ODL/24/0400"); await dlg.getByRole("button", { name: "Add student" }).click();
    await a.getByText("Added Grace Nwosu.").waitFor();
  });
});

await group("N", "Welcome emails (W-20, W-20d, W-20c)", async () => {
  const ed = a.getByRole("dialog", { name: "Edit the welcome email" });
  let saved = "";
  await step(a, "Negative - the wording without {activation_link} is refused", async () => {
    await a.goto(`${UNI}/staff/students/welcome`, { waitUntil: "networkidle" }); await a.getByRole("heading", { name: "Send welcome messages" }).waitFor();
    await a.getByRole("button", { name: "Edit the wording" }).click();
    saved = await ed.getByLabel("Welcome email").inputValue();
    await ed.getByLabel("Welcome email").fill(saved.replaceAll("{activation_link}", ""));
    await ed.getByRole("button", { name: "Save template" }).click(); await ed.getByText(/activation_link/).first().waitFor();
  });
  await step(a, "Negative - an unknown field {foo} is refused", async () => {
    await ed.getByLabel("Welcome email").fill(saved + "\n{foo}");
    await ed.getByRole("button", { name: "Save template" }).click(); await ed.getByText(/Unknown field \{foo\}/).first().waitFor();
  });
  await step(a, "Edited wording saved", async () => {
    await ed.getByLabel("Welcome email").fill(saved + "\nThe Lakeshore ODeL office is open 8am to 4pm.");
    await ed.getByRole("button", { name: "Save template" }).click(); await a.getByText(/Saved the welcome email/).waitFor();
  });
  await step(a, "Send a test to me: it reaches Bola's address in the log with the new wording", async () => {
    const t0 = Date.now();
    await a.getByRole("button", { name: "Send a test to me" }).click(); await a.getByText(`Sent a test to ${uni.email}.`, { exact: false }).waitFor();
    const m = await waitEmail(uni.email, t0, (e) => /8am to 4pm/.test(e.body));
    if (!/activate/.test(m.body)) throw new Error("the test email has no activation link");
  });
  await step(a, "Send to everyone with an email: progress, then the delivery report (W-20c)", async () => {
    await a.getByRole("button", { name: /^Send to \d+ students?$/ }).click();
    await a.getByRole("button", { name: "Send now" }).click();
    const report = a.getByRole("dialog", { name: "Welcome messages sent" });
    await report.waitFor({ timeout: 240_000 });
    await report.getByText(/emails delivered/).waitFor(); await report.getByText(/did not get the welcome/).waitFor();
    await report.getByRole("table", { name: /did not get the welcome/ }).getByText(/Ibrahim Musa|Musa Ibrahim/).waitFor();
  });
  await step(a, "Adeola's welcome is in the log with her activation link", async () => {
    const m = await waitEmail(ADEOLA.email, Date.now() - 600_000, (e) => /activate\?matric=/.test(e.body));
    if (!m.body.includes(`${UNI}/activate?matric=LU%2FODL%2F24%2F0153`)) throw new Error(`unexpected link in: ${m.body.slice(0, 300)}`);
  });
  await step(a, "Checklist: step 9 done, 9 of 9", async () => { await checklist(a); await expectDone(a, 9); await a.getByText("9 of 9 steps complete").waitFor(); });
});

const pw = (label) => s.getByLabel(label, { exact: true });
await group("O", "Adeola activates on her phone (M-01 … M-06, E-01 … E-03), 390 px", async () => {
  await step(s, "Bola signs out; the student portal's welcome page (M-01) fits a 390 px phone", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/`); await s.getByRole("link", { name: "Activate my account" }).waitFor(); await noSideways(s);
  });
  await step(s, "Negative - an unknown matric number (E-01)", async () => {
    await s.getByRole("link", { name: "Activate my account" }).click();
    await s.getByLabel("Matric number").fill("LU/ODL/24/9999"); await s.getByRole("button", { name: "Send my code" }).click();
    await s.getByText(/We could not find this number/).waitFor(); await noSideways(s);
  });
  await step(s, "Negative - a student with no email (E-03) is told to contact the centre", async () => {
    await s.getByLabel("Matric number").fill(NO_EMAIL); await s.getByRole("button", { name: /Send my code|Try again/ }).click();
    await s.getByText("We have no email address for you", { exact: true }).waitFor(); await s.getByText(/0803 555 0117/).first().waitFor();
  });
  let t0 = 0;
  await step(s, "The link in her welcome email opens with the matric number filled in; the code is sent (M-03)", async () => {
    await s.goto(`${UNI}/activate?matric=LU%2FODL%2F24%2F0153`);
    if ((await s.getByLabel("Matric number").inputValue()) !== ADEOLA.matric) throw new Error("the matric number is not filled in");
    t0 = Date.now(); await s.getByRole("button", { name: "Send my code" }).click();
    await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor(); await s.getByText(/a•+@lakeshore\.test/).waitFor(); await noSideways(s);
  });
  let first = "";
  await step(s, "The code is in the email log within 60 seconds", async () => {
    first = codeIn(await waitEmail(ADEOLA.email, t0, (e) => !!codeIn(e) && !/activate\?matric/.test(e.body)));
    if (!first) throw new Error("no code in the email");
  });
  await step(s, "Negative - a wrong code: 2 tries left", async () => {
    await typeCode(s, first === "000000" ? "111111" : "000000"); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByText("That code is not right. 2 tries left before we send a new one.").waitFor();
  });
  await step(s, "I can't access this email: the Akure centre to call", async () => {
    await s.getByRole("button", { name: "I can’t access this email" }).click();
    const d = s.getByRole("dialog", { name: "Can’t access this email?" }); await d.getByText(/Akure Study Centre/).waitFor();
    await d.getByRole("button", { name: "Cancel" }).click();
  });
  let second = "";
  await step(s, "Resend after the 60-second wait sends a new code", async () => {
    const btn = s.getByRole("button", { name: "Send a new code" }); await btn.waitFor({ timeout: 75_000 });
    const t1 = Date.now(); await btn.click(); await s.getByText(/We sent a new code to/).waitFor();
    second = codeIn(await waitEmail(ADEOLA.email, t1, (e) => !!codeIn(e)));
  });
  await step(s, "Right code: create a password; the rules tick as she types (M-04)", async () => {
    await typeCode(s, second); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByRole("heading", { name: "Create a password" }).waitFor();
    await pw("New password").fill("short"); await s.getByRole("list", { name: "Password rules" }).getByText(/\(not yet\)/).first().waitFor();
    await noSideways(s);
  });
  await step(s, "Negative - passwords that do not match", async () => {
    await pw("New password").fill("Adeola2026"); await pw("Confirm password").fill("Adeola2025");
    await s.getByRole("button", { name: "Continue" }).click(); await s.getByText("The two passwords do not match.").first().waitFor();
  });
  await step(s, "Privacy notice: accepting without the tick is refused, then accepted (M-05)", async () => {
    await pw("Confirm password").fill("Adeola2026"); await s.getByRole("button", { name: "Continue" }).click();
    await s.getByRole("heading", { name: "How we use your information" }).waitFor();
    await s.getByRole("button", { name: "Accept and continue" }).click(); await s.getByText("Tick the box to accept the privacy notice.").waitFor();
    await s.getByLabel("I have read and accept the privacy notice").check(); await s.getByRole("button", { name: "Accept and continue" }).click();
  });
  await step(s, "Check your details (M-06), then Home with her programme and centre", async () => {
    await s.getByRole("heading", { name: "Check your details" }).waitFor(); await s.getByText(/LU\/ODL\/24\/0153 · B\.Sc\. Computer Science · 200L/).waitFor();
    await s.getByRole("button", { name: "Save and go to my dashboard" }).click();
    await s.getByRole("heading", { name: "Your courses appear after registration" }).waitFor(); await s.getByText("Akure Study Centre").first().waitFor();
    who = "student"; await noSideways(s);
  });
  await step(s, "Negative - activating again: this account is already active (E-02)", async () => {
    await leave(); await s.goto(`${UNI}/activate?matric=LU%2FODL%2F24%2F0153`);
    await s.getByRole("button", { name: "Send my code" }).click(); await s.getByText("This account is already active").waitFor();
  });
});

await group("P", "A second welcome send skips the student who is already active", async () => {
  await step(a, "Bola signs back in at desktop size", async () => { await staffIn(ADMIN); });
  await step(a, "The page counts 1 already active; the new send's report says it was skipped", async () => {
    await a.goto(`${UNI}/staff/students/welcome`, { waitUntil: "networkidle" }); await a.getByText(/The 1 already active get nothing/).waitFor();
    await a.getByRole("button", { name: /^Send to \d+ students?$/ }).click(); await a.getByRole("button", { name: "Send now" }).click();
    const report = a.getByRole("dialog", { name: "Welcome messages sent" }); await report.waitFor({ timeout: 240_000 });
    await report.getByText(/1 already active were skipped/).waitFor();
  });
});

await group("Q", "Student sign-in, lockout and reset by code (M-08, E-04, E-05, M-09 … M-11), 390 px", async () => {
  async function signIn(pass) {
    await s.getByLabel("Matric number or email").fill(ADEOLA.matric); await pw("Password").fill(pass);
    await s.getByRole("button", { name: "Sign in" }).click();
  }
  await step(s, "Sign in with matric number and password: Home", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`); await noSideways(s);
    await signIn("Adeola2026"); await s.getByRole("heading", { name: "Your courses appear after registration" }).waitFor(); who = "student";
  });
  await step(s, "Negative - a wrong password: 4 tries left (E-04)", async () => {
    await leave(); await s.goto(`${UNI}/sign-in`);
    await signIn("Wrong-pass1"); await s.getByText(/Wrong password\. 4 tries left/).waitFor();
  });
  await step(s, "Negative - five wrong passwords lock sign-in with the time (E-05)", async () => {
    for (let i = 2; i <= 5; i++) { await pw("Password").fill(`Wrong-pass${i}`); await s.getByRole("button", { name: "Sign in" }).click(); await s.waitForTimeout(600); }
    await s.getByText("Too many attempts").waitFor(); await s.getByText(/until \d{1,2}:\d{2}\s?[ap]m/).first().waitFor();
    if (await s.getByRole("button", { name: "Sign in" }).isEnabled()) throw new Error("Sign in is still enabled while locked");
    await noSideways(s);
  });
  await step(s, "Reset by emailed code from the lockout banner: new password, signed in", async () => {
    await s.getByRole("link", { name: "Reset password" }).click(); await s.waitForURL(/reset-password/);
    const t0 = Date.now(); await s.getByRole("button", { name: "Continue" }).click();
    await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor();
    await typeCode(s, codeIn(await waitEmail(ADEOLA.email, t0, (e) => !!codeIn(e)))); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByRole("heading", { name: "Choose a new password" }).waitFor();
    await pw("New password").fill("Adeola2027"); await pw("Confirm password").fill("Adeola2027");
    await s.getByRole("button", { name: "Save and sign in" }).click(); await s.getByRole("heading", { name: "Your courses appear after registration" }).waitFor();
    who = "student";
  });
});

await group("R", "The office side: students list and record (W-22, W-22b)", async () => {
  const rec = a.getByRole("dialog", { name: ADEOLA.name });
  async function openAdeola() { await a.goto(`${UNI}/staff/students?q=${encodeURIComponent(ADEOLA.matric)}`); await a.getByRole("button", { name: ADEOLA.name }).first().click(); await rec.getByText("Activation message").waitFor(); }
  await step(a, "Adeola signs out; Bola signs in; search by name finds her", async () => {
    await staffIn(ADMIN); await a.goto(`${UNI}/staff/students`); await a.getByLabel("Search students").fill("Okafor"); await a.getByRole("button", { name: "Find" }).click();
    await a.getByRole("button", { name: ADEOLA.name }).first().waitFor();
  });
  await step(a, "Filters: Akure, 200L, Active shows only her", async () => {
    await a.goto(`${UNI}/staff/students`);
    await a.locator('select[name="centre"]').selectOption("AKR"); await a.locator('select[name="level"]').selectOption("200"); await a.locator('select[name="status"]').selectOption("ACTIVE");
    await a.getByRole("button", { name: "Find" }).click(); await a.getByText("1 student match.").waitFor(); await a.getByRole("button", { name: ADEOLA.name }).first().waitFor();
  });
  await step(a, "Search by matric number; the record shows her active with the consent date", async () => {
    await a.goto(`${UNI}/staff/students?q=${encodeURIComponent(ADEOLA.matric)}`); await a.getByRole("button", { name: ADEOLA.name }).first().click();
    await rec.getByText("Active").first().waitFor(); await rec.getByText(/Accepted the privacy notice \(version .+\) on/).waitFor(); await rec.getByText(/activated/).first().waitFor();
  });
  let t0 = 0;
  await step(a, "Send a reset code from the record", async () => {
    t0 = Date.now(); await rec.getByRole("button", { name: "Send code" }).click();
    await rec.getByText(`Emailed a password reset code to ${ADEOLA.email}.`).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(s, "The office's email link opens the reset screen without a second code; she sets a new password", async () => {
    const m = await waitEmail(ADEOLA.email, t0, (e) => !!codeIn(e) && /reset-password/.test(e.body));
    const link = (m.body.match(/https:\/\/\S+reset-password\S*/) ?? [])[0]; if (!link) throw new Error("no reset link in the email");
    await leave(); await phone(); await s.goto(link); await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor();
    await typeCode(s, codeIn(m)); await s.getByRole("button", { name: "Verify" }).click();
    await pw("New password").fill("Adeola2028"); await pw("Confirm password").fill("Adeola2028");
    await s.getByRole("button", { name: "Save and sign in" }).click(); await s.getByRole("heading", { name: "Your courses appear after registration" }).waitFor();
    who = "student";
    const again = emails(ADEOLA.email).filter((e) => Date.parse(e.created_at) > Date.parse(m.created_at));
    if (again.length) throw new Error("a second code was emailed");
  });
  await step(a, "Bola signs back in; resend the welcome from a not-activated student's record", async () => {
    await staffIn(ADMIN); await a.goto(`${UNI}/staff/students?q=LU%2FODL%2F24%2F0001`); await a.locator("main table").getByRole("button").first().click();
    const sheet = a.getByRole("dialog").filter({ hasText: "Activation message" });
    await sheet.getByRole("button", { name: "Resend" }).click(); await sheet.getByText(/Sent the welcome email to/).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(a, "Suspend Adeola (reason required)", async () => {
    await openAdeola();
    await rec.getByRole("button", { name: "Suspend this student" }).click();
    const d = a.getByRole("dialog", { name: `Suspend ${ADEOLA.name}?` });
    await d.getByRole("button", { name: "Suspend" }).click(); await d.getByText(/Write why/).waitFor();
    await d.getByLabel("Reason").fill("Fees query"); await d.getByRole("button", { name: "Suspend" }).click();
    await a.getByText(`${ADEOLA.name} is suspended and was signed out.`).first().waitFor();
  });
  await step(s, "Negative - suspended: her sign-in is refused (E-06)", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`);
    await s.getByLabel("Matric number or email").fill(ADEOLA.matric); await pw("Password").fill("Adeola2028"); await s.getByRole("button", { name: "Sign in" }).click();
    await s.getByText("Your account is suspended").waitFor();
  });
  await step(a, "Bola signs in and restores her access", async () => {
    await staffIn(ADMIN); await openAdeola();
    await rec.getByRole("button", { name: "Restore access" }).click(); await a.getByText(`${ADEOLA.name} can sign in again.`).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(s, "She signs in again", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`);
    await s.getByLabel("Matric number or email").fill(ADEOLA.matric); await pw("Password").fill("Adeola2028"); await s.getByRole("button", { name: "Sign in" }).click();
    await s.getByRole("heading", { name: "Your courses appear after registration" }).waitFor(); who = "student";
  });
});

await group("S", "The university's audit log", async () => {
  await step(a, "Adeola signs out; Bola signs in", async () => { await staffIn(ADMIN); });
  async function has(type, re) {
    await a.goto(`${UNI}/staff/reports/audit${type ? `?type=${type}` : ""}`);
    await a.getByRole("table", { name: /Audit log/ }).waitFor();
    if (!re.test(await a.locator("main").innerText())) throw new Error(`the ${type ?? "full"} audit log does not show ${re}`);
  }
  await step(a, "The import", async () => { await has("STUDENTS", new RegExp(`Imported ${PORTAL_NAME}: 299 added`)); });
  await step(a, "The welcome sends", async () => { await has("STUDENTS", /sent the welcome email to \d+ students not yet active \(1 already active skipped\)/); });
  await step(a, "Her activation", async () => { await has("SIGN_IN", /Adeola Okafor \(LU\/ODL\/24\/0153\) activated the account/); });
  await step(a, "Her suspension", async () => { await has("STUDENTS", /suspended Adeola Okafor/); });
  await step(a, "Her password resets", async () => { await has("STUDENTS", /Adeola Okafor chose a new password with an emailed code/); });
  await step(a, "Dr Bello's suspension and two-step reset", async () => {
    await has("ROLES", /Suspended Dr Funmi Bello: On leave from 1 Dec/); await has("SIGN_IN", /Reset Dr Funmi Bello's two-step sign-in: Lost phone/);
  });
});

await group("S2", "Audit entries carry the person's own IP address", async () => {
  await step(a, "The university's audit log shows a real client IP, not the server's own", async () => {
    await a.goto(`${UNI}/staff/reports/audit`);
    const r = await apiGet(a, "/api/v1/audit?size=50");
    const ips = [...new Set(r.body.items.map((x) => x.ip))];
    if (ips.some((ip) => /^(127\.|::1$|0:0:0:0:0:0:0:1$)/.test(ip ?? ""))) throw new Error(`audit IPs: ${ips.join(", ")}`);
  });
  await step(c, "(diagnostic) IPs in the platform audit over time", async () => {
    await consoleIn(); const r = await apiGet(c, "/api/v1/platform/audit?size=200");
    const byHour = {};
    for (const x of r.body?.items ?? []) { const k = `${String(x.at).slice(0, 13)} ${x.ip}`; byHour[k] = (byHour[k] ?? 0) + 1; }
    console.log("      " + Object.entries(byHour).map(([k, v]) => `${k}×${v}`).join(" · "));
  });
});

await group("T", "Universities are kept apart: Wesley cannot see Lakeshore", async () => {
  await step(a, "Lakeshore's admin opening Wesley's staff pages is sent to Wesley's sign-in", async () => {
    await a.goto(`${WESLEY}/staff/students`); await a.waitForURL(/\/staff\/sign-in/);
  }, { allow: [401, 403] });
  await step(a, "Wesley's API refuses Lakeshore's session", async () => {
    const r = await apiGet(a, "/api/v1/students?q=Okafor"); if (r.status !== 401 && r.status !== 403) throw new Error(`Wesley answered ${r.status}`);
    const k = await apiGet(a, "/api/v1/setup/checklist"); if (k.status !== 401 && k.status !== 403) throw new Error(`Wesley's checklist answered ${k.status}`);
  }, { allow: [401, 403] });
  await step(a, "Negative - Lakeshore's admin cannot sign in on Wesley", async () => {
    await google(a, uni.email); await a.waitForURL(/error=wrong_domain/);
  });
  await step(s, "Negative - Adeola's matric number is unknown on Wesley's portal", async () => {
    await s.goto(`${WESLEY}/sign-in`); await s.getByLabel("Matric number or email").fill(ADEOLA.matric); await pw("Password").fill("Adeola2028");
    await s.getByRole("button", { name: "Sign in" }).click(); await s.getByText(/could not find that matric number/).waitFor();
  });
  await step(a, "Lakeshore's own pages still work for its admin", async () => { await checklist(a); });
});

// Always, even after a failure: delete the test university so dev keeps only the real ones.
await group("Z", "Clean up: the test university is deleted", async () => {
  await step(c, "Provider deletes Lakeshore (dev only)", async () => {
    if (!uniId) throw new Error("the test university was not created, nothing to delete");
    await deleteUni(uniId);
  });
  await step(a, "Its address now shows 'not set up'", async () => {
    await a.waitForTimeout(61_000); // the gateway remembers an address for a minute
    await a.goto(`${UNI}/staff/sign-in`); await a.getByText("This web address is not set up").waitFor();
  }, { allow: [404] });
}, { always: true });

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} of ${results.length} steps passed.`);
process.exit(passed === results.length ? 0 : 1);
