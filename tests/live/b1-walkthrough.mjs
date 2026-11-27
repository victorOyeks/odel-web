// B1 end-to-end walkthrough on Wesley University (the pilot university) on the hosted dev site, in one visible browser window.
// Run: ODEL_E2E_PROVIDER_TOTP=<Chuka's secret> ODEL_E2E_ADMIN_TOTP=<Ngozi's secret> bun tests/live/b1-walkthrough.mjs
//   ONLY=D,K   run just those groups (sign-in happens as needed); RUN=123 reuse the per-run student of an earlier run;
//   SLOW=ms between actions (default 600).
// Re-runnable: Wesley keeps the story data (2026/2027, Science → Computer Science → B.Sc. Computer Science, CSC 201, Akure with
// Room 1, Dr Bello, Mrs Ade, default grading, the imported students with Adeola Okafor). Each run finds what exists and creates
// only what is missing; refused negative cases never create anything. One-time student flows (activation, lockout, reset,
// suspension) use a fresh student per run (WU/ODL/24/9NNN). Students have .test addresses and staff are on wesleyuni.edu.ng,
// which the dev allow-list never emails: codes and links are read from the dev email log. Only the add-a-university wizard
// (group W) creates a throwaway university, and deletes it again. Secrets come only from the command line.
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
const NGOZI_SECRET = process.env.ODEL_E2E_ADMIN_TOTP ?? "";
if (!NGOZI_SECRET) { console.error("Set ODEL_E2E_ADMIN_TOTP to Ngozi Adebayo's authenticator secret."); process.exit(2); }
const ONLY = (process.env.ONLY ?? "").toUpperCase().split(",").map((x) => x.trim()).filter(Boolean);

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
const SHOTS = `${homedir()}/Desktop/ODeL test screenshots/B1 end to end (${new Date().toISOString().slice(0, 10)})${ONLY.length ? ` - only ${ONLY.join(",")}` : ""}`;
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
      // Text drawn on top of other text: every visible text run, compared with every other one in the dialog.
      const runs = [];
      const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.textContent.trim(); const el = t.parentElement;
        if (!text || !el || el.closest("option, select, script, style")) continue;
        const range = document.createRange(); range.selectNodeContents(t);
        for (const tr of range.getClientRects()) {
          if (tr.width <= 2 || tr.height <= 2) continue; // screen-reader-only text
          let clipped = false;
          for (let a = el; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (/(auto|hidden|scroll|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX)) {
              const ar = a.getBoundingClientRect();
              if (tr.top < ar.top - 1 || tr.bottom > ar.bottom + 1 || tr.left < ar.left - 1 || tr.right > ar.right + 1) { clipped = true; break; }
            }
          }
          if (!clipped) runs.push({ text: text.slice(0, 40), el, r: tr });
        }
      }
      for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
        const A = runs[i], B = runs[j];
        if (A.el === B.el) continue;
        const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (w > 3 && h > 3) { out.push(`in "${name}" the text "${A.text}" overlaps "${B.text}"`); i = runs.length; break; }
      }
      if (runs.some((x) => /^Loading/.test(x.text))) out.push(`LOADING in "${name}"`);
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
    let lay = await layoutProblems(page).catch(() => []);
    // A dialog may show "Loading…" for a moment; after 5 seconds it must have loaded.
    for (let t = 0; t < 5 && lay.some((x) => x.startsWith("LOADING")); t++) { await page.waitForTimeout(1000); lay = await layoutProblems(page).catch(() => []); }
    lay = lay.map((x) => (x.startsWith("LOADING") ? `"Loading…" still shows after 5 seconds ${x.slice(8)}` : x));
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
async function group(letter, name, fn) {
  if (ONLY.length && !ONLY.includes(letter)) return;
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
  await p.waitForURL((u) => (u.pathname.startsWith("/staff") && !u.pathname.startsWith("/staff/sign-in")) || u.pathname.endsWith("/role"));
  if (p.url().includes("/role")) { await p.getByRole("button", { name: /Continue as/ }).first().click(); await p.waitForURL((u) => !u.pathname.startsWith("/staff/sign-in")); }
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

// ---- Wesley and the people of the story ----
const UNI = WESLEY;
const DOMAIN = "wesleyuni.edu.ng";
const NGOZI = { name: "Ngozi Adebayo", email: `ngozi.adebayo@${DOMAIN}` };
const ADMIN = { key: "admin", pick: NGOZI.email, secret: () => NGOZI_SECRET, trust: true };
const BELLO = { name: "Dr Funmi Bello", email: `f.bello@${DOMAIN}` };
const ADE = { name: "Mrs Bisi Ade", email: `b.ade@${DOMAIN}` };
const KEMI = { name: "Dr Kemi Ola", email: `k.ola@${DOMAIN}` };
const ADEOLA = { matric: "WU/ODL/24/0153", email: "adeola.okafor@wesley.test", name: "Adeola Okafor", password: "Adeola2026" };
const NO_EMAIL = "WU/ODL/24/0201";
const GRACE = { matric: "WU/ODL/25/0389", first: "Grace", surname: "Nwosu" };
// The student for this run's one-time flows (activation, lockout, reset, suspension): a fresh matric number each run.
const RUN = process.env.RUN ?? String(100 + (Math.floor(Date.now() / 60000) % 900));
const letters = (d) => [...d].map((x) => "abcdefghij"[Number(x)]).join("");
const P = { matric: `WU/ODL/24/9${RUN}`, first: "Tobi", surname: `Run${letters(RUN)}`, email: `tobi.run${RUN}@wesley.test` };
P.name = `${P.first} ${P.surname}`;
const PORTAL_NAME = `wesley_portal_export_${RUN}.csv`;
const ALLOWED_REAL = ["gmail.com", "oyeksglobal.com"]; // the dev allow-list: these really get email
let belloSecret = null;
const found = {}; // what this run found on Wesley (codes, ids)

const enc = encodeURIComponent;
const isAllowedReal = (email) => !!email && ALLOWED_REAL.some((d) => email.toLowerCase().endsWith(`@${d}`) || email.toLowerCase().endsWith(`.${d}`));
async function consoleIn() {
  await desk(); await c.goto(CONSOLE);
  if (/sign-in/.test(c.url())) { // the console session may have ended after 30 idle minutes
    await google(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click(); await c.getByText(/Wesley University/).first().waitFor();
  }
}
/** Dev only: delete a throwaway university, sent from inside the signed-in console page (session cookie + CSRF header). */
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
/** Ngozi signs in if she is not the one signed in (a visible step only when something happens). */
async function asAdmin() {
  if (who === "admin") return;
  await step(a, "Ngozi Adebayo signs in (Google, then her two-step code; trusted computer after the first time)", () => staffIn(ADMIN));
}
const W = (path) => apiGet(a, `/api/v1${path}`);
async function onWesley() { if (!p.url().startsWith(UNI) || /sign-in/.test(p.url())) await p.goto(`${UNI}/staff/setup`); }
/** An open dialog: fits the window, buttons visible, no overlapping text, done loading within 5 s; then a checkpoint shot. */
async function dialogOk(page, name) {
  await page.waitForTimeout(400);
  let lay = await layoutProblems(page).catch(() => []);
  for (let t = 0; t < 5 && lay.some((x) => x.startsWith("LOADING")); t++) { await page.waitForTimeout(1000); lay = await layoutProblems(page).catch(() => []); }
  lay = lay.map((x) => (x.startsWith("LOADING") ? `"Loading…" still shows after 5 seconds ${x.slice(8)}` : x));
  if (lay.length) throw new Error(`Layout: ${lay.join(" | ")}`);
  await shot(page, `Dialog - ${name}`);
}
function findIn(st, { fac, dep, prog }) {
  for (const f of st.faculties ?? []) {
    if (fac && !(fac.codes.includes(f.code) || fac.names.test(f.name))) continue;
    if (!dep) return { f };
    for (const d of f.departments ?? []) {
      if (!(dep.codes.includes(d.code) || dep.names.test(d.name))) continue;
      if (!prog) return { f, d };
      for (const pr of d.programmes ?? []) if (prog.codes.includes(pr.code) || prog.names.test(pr.name)) return { f, d, pr };
    }
  }
  return {};
}
const SCI = { codes: ["SCI"], names: /^Faculty of Science$/ };
const CSC = { codes: ["CSC"], names: /^(Department of )?Computer Science$/ };
const BSC = { codes: ["BSC-CSC", "BSC-CSC-ODL"], names: /^B\.Sc\. Computer Science$/ };
const MGT = { codes: ["MGT"], names: /^Faculty of Management Sciences$/ };
const ACC = { codes: ["ACC"], names: /^(Department of )?Accounting$/ };
const BACC = { codes: ["BSC-ACC", "BSC-ACC-ODL"], names: /^B\.Sc\. Accounting$/ };
async function programmeCodes() {
  const st = (await W("/academic/structure")).body;
  found.csc = findIn(st, { fac: SCI, dep: CSC, prog: BSC }).pr?.code ?? null;
  found.acc = findIn(st, { fac: MGT, dep: ACC, prog: BACC }).pr?.code ?? findIn(st, { fac: { codes: [], names: /./ }, dep: { codes: [], names: /./ }, prog: BACC }).pr?.code ?? null;
  return st;
}
async function courseExists(codeStr) {
  const r = await W(`/academic/courses?search=${enc(codeStr)}&size=50`);
  return (r.body?.items ?? []).find((x) => x.code === codeStr) ?? null;
}

// ================================================================== W · the add-a-university wizard (throwaway)
await group("W", "Provider console: the add-a-university wizard on a throwaway university (SA-02 to SA-05b), deleted again", async () => {
  const wslug = `wizard${RUN}`;
  const WUNI = `https://${wslug}.${BASE}`;
  let wid = null;
  await step(c, "Console sign-in: Chuka Obi on the dev Google page, then his two-step code", async () => {
    await c.goto(CONSOLE); await c.waitForURL(/\/sign-in/);
    await google(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click();
    await c.getByText(/Wesley University/).first().waitFor();
  });
  await step(c, "Wizard universities left by an interrupted run are deleted first", async () => {
    const r = await apiGet(c, "/api/v1/platform/tenants");
    for (const t of (r.body?.items ?? []).filter((t) => /^wizard\d+$/.test(t.slug))) { await deleteUni(t.id); console.log(`      (deleted the leftover ${t.slug})`); }
  });
  try {
    await step(c, "Add a university: Next with nothing filled in shows what is missing (SA-02c)", async () => {
      await c.goto(`${CONSOLE}/universities/new`); await c.getByText("Add a university").first().waitFor();
      await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/Enter|Type/).first().waitFor();
    });
    await step(c, "Negative - a .test domain as its own web address, and the taken short address 'wesley' (SA-02b)", async () => {
      await c.getByLabel("Full name").fill(`Wizard Test University ${RUN}`); await c.getByLabel("Short name").fill("Wizard ODeL");
      await c.getByLabel("Own web address (optional)").fill("odl.wizard.test"); await c.getByLabel("Short address").fill("wesley");
      await c.getByLabel(/First admin’s name/).fill("Amaka Eze"); await c.getByLabel(/First admin’s email/).fill("amaka.eze@wizard.test");
      await c.getByLabel("Staff Google domain").fill("wizard.test");
      await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/test domains/).first().waitFor();
      await c.getByLabel("Own web address (optional)").fill("");
      await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByText(/already|taken/i).first().waitFor();
    });
    await step(c, "Negative - a pale main colour fails the readability check (SA-03b)", async () => {
      await c.getByLabel("Short address").fill(wslug);
      await c.getByRole("button", { name: "Next: branding" }).click(); await c.getByLabel("Main colour").first().waitFor();
      await c.getByLabel("Main colour").first().fill("#F5D76E"); await c.getByText(/hard to read/).first().waitFor();
    });
    await step(c, "Readable colours, defaults, review and create (SA-03 to SA-05b)", async () => {
      await c.getByLabel("Main colour").first().fill("#1F5F7A"); await c.getByLabel("Accent colour").first().fill("#D4A017"); await c.getByText(/reads well/).first().waitFor();
      await c.getByRole("button", { name: "Next: rules and payments" }).click();
      await c.getByRole("button", { name: "Next: review" }).click(); await c.getByRole("button", { name: "Create the university" }).click();
      await c.getByText(/is set up/).first().waitFor();
      wid = c.url().match(/universities\/([0-9a-f-]{36})/)?.[1] ?? null; if (!wid) throw new Error("no university id in the address");
      if (!(await c.locator("main").innerText()).includes(`Live at ${WUNI}`)) throw new Error(`expected "Live at ${WUNI}"`);
    });
    await step(c, "Its first admin's invitation is in the email log (a .test address: recorded, never sent)", async () => {
      const m = await waitEmail("amaka.eze@wizard.test", Date.now() - 120_000, (e) => /invited/i.test(e.subject));
      if (m.status !== "SKIPPED") throw new Error(`the invitation was ${m.status}`);
    });
  } finally {
    if (wid) await step(c, "The throwaway university is deleted (dev only) and leaves the console list", async () => {
      await deleteUni(wid); await c.goto(CONSOLE); await c.getByText(/Wesley University/).first().waitFor();
      if ((await c.locator("main").innerText()).includes(`Wizard Test University ${RUN}`)) throw new Error("it is still listed");
    });
  }
});

// ================================================================== A · Ngozi
await group("A", "Ngozi Adebayo (ODeL admin) signs in on Wesley; the checklist (W-10)", async () => {
  await step(a, "Wesley's staff sign-in page, in its colours", async () => {
    await leave(); await a.goto(`${UNI}/staff/sign-in`); await a.getByText("Wesley University").first().waitFor();
  });
  await step(a, "Negative - a Gmail address is not a Wesley staff account (W-02)", async () => {
    await google(a, "ngozi@gmail.com"); await a.waitForURL(/error=wrong_domain/);
  });
  await step(a, "Ngozi chosen, her two-step code, trusted computer: the setup checklist", async () => { await staffIn(ADMIN); await checklist(a); });
  await step(a, "Phone size: the checklist on a 390 px screen", async () => {
    await phone(); await a.reload(); await a.getByText(/of 9 steps complete/).waitFor(); await noSideways(a);
  });
  await desk();
});

// ================================================================== D · sessions
await group("D", "Sessions and semesters (W-11, W-11c)", async () => {
  await asAdmin();
  const sheet = a.getByRole("dialog", { name: "New session" });
  const first = sheet.getByRole("group", { name: "First semester" });
  const second = sheet.getByRole("group", { name: "Second semester" });
  async function dates(y, s2start = `${y + 1}-03-15`) {
    await first.getByLabel("Starts").fill(`${y}-10-05`); await first.getByLabel("Ends").fill(`${y + 1}-02-26`);
    await first.getByLabel("Registration opens").fill(`${y}-10-05`); await first.getByLabel("Registration closes", { exact: true }).fill(`${y}-10-23`);
    await second.getByLabel("Starts").fill(s2start); await second.getByLabel("Ends").fill(`${y + 1}-07-30`);
  }
  async function openNew() { await a.getByRole("button", { name: "New session" }).first().click(); await sheet.waitFor(); }
  let s2026 = null;
  await step(a, "Sessions page", async () => {
    await a.goto(`${UNI}/staff/academic-setup/sessions`); await a.getByRole("heading", { name: "Sessions & semesters" }).first().waitFor();
    s2026 = (await W("/academic/sessions")).body.items.find((x) => x.name === "2026/2027") ?? null;
  });
  await step(a, "Negative - '2026-27' is refused: write it as 2026/2027", async () => {
    await openNew(); await dialogOk(a, "New session");
    await sheet.getByLabel("Session name").fill("2026-27"); await dates(2040);
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText("Write the session as 2026/2027.").first().waitFor();
  });
  await step(a, "Negative - a second semester starting before the first ends is refused", async () => {
    await sheet.getByLabel("Session name").fill("2040/2041"); await second.getByLabel("Starts").fill("2041-02-01");
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/The second semester must start after the first one ends/).first().waitFor();
    await sheet.getByRole("button", { name: "Cancel" }).click();
  });
  if (!s2026) await step(a, "2026/2027 with two semesters and a registration window saved as a draft", async () => {
    await openNew(); await sheet.getByLabel("Session name").fill("2026/2027"); await dates(2026);
    await sheet.getByRole("button", { name: "Save draft" }).click(); await a.getByText("2026/2027 is saved as a draft.").waitFor();
    s2026 = (await W("/academic/sessions")).body.items.find((x) => x.name === "2026/2027");
  });
  await step(a, "Negative - the same name again is refused (nothing created)", async () => {
    await openNew(); await sheet.getByLabel("Session name").fill("2026/2027"); await dates(2040);
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/There is already a 2026\/2027 session/).first().waitFor();
  });
  await step(a, "Negative - dates that overlap 2026/2027 are refused (nothing created)", async () => {
    await sheet.getByLabel("Session name").fill("2039/2040"); await dates(2026);
    await sheet.getByRole("button", { name: "Save draft" }).click(); await sheet.getByText(/These dates overlap/).first().waitFor();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    const names = (await W("/academic/sessions")).body.items.map((x) => x.name);
    if (names.some((x) => ["2039/2040", "2040/2041"].includes(x))) throw new Error(`a refused session was saved: ${names.join(", ")}`);
  });
  await step(a, "2026/2027 is the active session", async () => {
    if (s2026.status !== "ACTIVE") {
      await a.getByRole("button", { name: "Make 2026/2027 active" }).click();
      await a.getByRole("dialog").getByRole("button", { name: "Make active" }).click(); await a.getByText("2026/2027 is now the active session.").waitFor();
    }
    await a.getByRole("table", { name: /Sessions/ }).getByRole("row").filter({ hasText: "2026/2027" }).getByText("Active").waitFor();
  });
  await step(a, "Checklist: step 1 done", async () => { await checklist(a); await expectDone(a, 1); });
});

// ================================================================== E · structure
await group("E", "Academic structure (W-12, W-12c)", async () => {
  await asAdmin();
  const go = (sel) => a.goto(`${UNI}/staff/academic-setup/structure${sel ? `?sel=${sel}` : ""}`, { waitUntil: "networkidle" });
  await step(a, "Faculty of Science → Computer Science → B.Sc. Computer Science (created only if missing)", async () => {
    await go(); let st = await programmeCodes(); let { f, d, pr } = findIn(st, { fac: SCI, dep: CSC, prog: BSC });
    if (!f) f = findIn(st, { fac: SCI }).f;
    if (!f) {
      await a.getByRole("button", { name: "Add faculty" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a faculty" }); await dialogOk(a, "Add a faculty");
      await dlg.getByLabel("Name").fill("Faculty of Science"); await dlg.getByLabel("Code").fill("SCI"); await dlg.getByRole("button", { name: "Add faculty" }).click();
      await a.getByRole("heading", { name: "Faculty of Science", level: 2 }).waitFor(); st = await programmeCodes(); f = findIn(st, { fac: SCI }).f;
    }
    if (!d) d = findIn(st, { fac: SCI, dep: CSC }).d;
    if (!d) {
      await go(`faculty:${f.id}`); await a.getByRole("button", { name: "Add department" }).click(); const dlg = a.getByRole("dialog", { name: "Add a department" }); await dialogOk(a, "Add a department");
      await dlg.getByLabel("Name").fill("Computer Science"); await dlg.getByLabel("Code").fill("CSC"); await dlg.getByRole("button", { name: "Add department" }).click();
      await a.getByRole("heading", { name: "Computer Science", level: 2 }).waitFor(); st = await programmeCodes(); d = findIn(st, { fac: SCI, dep: CSC }).d;
    }
    if (!pr) {
      await go(`department:${d.id}`); await a.getByRole("button", { name: "Add programme" }).click(); const dlg = a.getByRole("dialog", { name: "Add a programme" }); await dialogOk(a, "Add a programme");
      await dlg.getByLabel("Name").fill("B.Sc. Computer Science"); await dlg.getByLabel("Code").fill("BSC-CSC"); await dlg.getByRole("button", { name: "Add programme" }).click();
      st = await programmeCodes(); pr = findIn(st, { fac: SCI, dep: CSC, prog: BSC }).pr;
    }
    found.sci = f; await go(`programme:${pr.id}`);
    await a.getByRole("heading", { name: "B.Sc. Computer Science", level: 2 }).waitFor(); await a.getByText(/\d years · \d+ semesters/).first().waitFor();
  });
  await step(a, "Negative - a faculty code already in use is refused (nothing created)", async () => {
    await a.getByRole("button", { name: "Add faculty" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a faculty" });
    await dlg.getByLabel("Name").fill("Faculty of Sciences"); await dlg.getByLabel("Code").fill(found.sci.code);
    await dlg.getByRole("button", { name: "Add faculty" }).click(); await dlg.getByText(new RegExp(`${found.sci.code} is already used by`)).first().waitFor();
    await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  const imp = a.getByRole("dialog", { name: "Import faculties, departments and programmes" });
  let accNew = false;
  await step(a, "Structure CSV with a bad row (duration 9): the row is reported and nothing is saved yet", async () => {
    accNew = !found.acc;
    await a.getByRole("button", { name: "Import from CSV" }).click(); await dialogOk(a, "Import faculties, departments and programmes");
    await imp.getByLabel("Choose a CSV file").setInputFiles(csvFile(`wesley_structure_${RUN}.csv`, [
      "faculty_name,faculty_code,department_name,department_code,programme_name,programme_code,degree,duration_years,entry_levels",
      "Faculty of Management Sciences,MGT,Accounting,ACC,B.Sc. Accounting,BSC-ACC,B.Sc.,4,100;200",
      "Faculty of Management Sciences,MGT,Business Administration,BUS,B.Sc. Business Administration,BSC-BUS,B.Sc.,9,100",
    ]));
    await imp.getByText(accNew ? "1 row needs fixing" : "2 rows need fixing").waitFor(); await imp.getByText(/^Row 3: .*duration/i).waitFor();
    const st = await programmeCodes(); if (findIn(st, { fac: { codes: [], names: /./ }, dep: { codes: [], names: /./ }, prog: { codes: ["BSC-BUS"], names: /^B\.Sc\. Business Administration$/ } }).pr) throw new Error("the bad row was saved");
    if (accNew && found.acc) throw new Error("B.Sc. Accounting was saved before confirming");
  });
  await step(a, accNew ? "Import the rest: only the good row is added" : "Every good row is already there: cancel, nothing changes", async () => {
    if (accNew) {
      await imp.getByRole("button", { name: "Import the rest" }).click(); await imp.getByText("Added 1 faculty, 1 department and 1 programme.").waitFor();
      await imp.getByRole("button", { name: "Done" }).click(); await a.getByRole("tree").getByText("Faculty of Management Sciences").waitFor();
    } else await imp.getByRole("button", { name: "Cancel" }).click();
    await programmeCodes(); if (!found.acc) throw new Error("no B.Sc. Accounting programme");
  });
  await step(a, "Checklist: step 2 done", async () => { await checklist(a); await expectDone(a, 1, 2); });
});

// ================================================================== F · courses
await group("F", "Course catalogue (W-13, W-13b, W-13c)", async () => {
  await asAdmin();
  if (!found.csc) { await onWesley(); await programmeCodes(); }
  const addCourse = async (codeTyped, title) => {
    await a.getByRole("button", { name: "Add course" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a course" }); await dialogOk(a, "Add a course");
    await dlg.getByLabel("Code").fill(codeTyped); await dlg.getByLabel("Units").fill("3"); await dlg.getByLabel("Title").fill(title);
    await dlg.getByLabel("Level").selectOption("200"); await dlg.getByLabel("Semester").selectOption("1");
    await dlg.getByRole("button", { name: "Offered to" }).click(); await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
    await dlg.getByRole("button", { name: "Add course" }).click(); return dlg;
  };
  await step(a, "CSC 201 · Data Structures (3 units, 200L, first semester) is in the catalogue (added as csc201 if missing)", async () => {
    await a.goto(`${UNI}/staff/courses`); await a.getByRole("heading", { name: "Course catalogue" }).first().waitFor();
    if (!(await courseExists("CSC 201"))) { await addCourse("csc201", "Data Structures"); await a.getByText("Added CSC 201 · Data Structures.").waitFor(); }
    const c201 = await courseExists("CSC 201"); if (c201.units !== 3 || c201.level !== 200 || c201.semester !== 1) throw new Error(`CSC 201 is ${c201.units} units, ${c201.level}L, semester ${c201.semester}`);
  });
  await step(a, "Negative - CSC 201 a second time is refused (nothing created)", async () => {
    const dlg = await addCourse("CSC 201", "Data Structures again");
    await dlg.getByText(/CSC 201 is already in the catalogue/).first().waitFor(); await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  const imp = a.getByRole("dialog", { name: "Import the course catalogue" });
  let fresh = 0;
  await step(a, "Catalogue CSV with an unknown programme: the row is reported, nothing saved yet", async () => {
    const want = [["CSC 202", `CSC 202,Operating Systems,3,200,2,${found.csc},core`], ["ACC 201", `ACC 201,Financial Accounting,3,200,1,${found.acc},core`]];
    const missingNow = [];
    for (const [cc] of want) if (!(await courseExists(cc))) missingNow.push(cc);
    fresh = missingNow.length;
    await a.getByRole("button", { name: "Import CSV" }).click(); await dialogOk(a, "Import the course catalogue");
    await imp.getByLabel("Choose a CSV file").setInputFiles(csvFile(`wesley_catalogue_${RUN}.csv`, ["code,title,units,level,semester,programme_code,kind", ...want.map((w) => w[1]), "CSC 299,Special Topics,3,200,1,BSC-XYZ,core"]));
    const bad = 1 + (2 - fresh);
    await imp.getByText(bad === 1 ? "1 row needs fixing" : `${bad} rows need fixing`).waitFor(); await imp.getByText(/BSC-XYZ/).first().waitFor();
    for (const cc of missingNow) if (await courseExists(cc)) throw new Error(`${cc} was saved before confirming`);
  });
  await step(a, "Confirm the good rows (or cancel when they are already there); the bad one is never added", async () => {
    if (fresh) { await imp.getByRole("button", { name: "Import the rest" }).click(); await imp.getByText(`Added ${fresh} course${fresh === 1 ? "" : "s"} to the catalogue.`).waitFor(); await imp.getByRole("button", { name: "Done" }).click(); }
    else await imp.getByRole("button", { name: "Cancel" }).click();
    if (await courseExists("CSC 299")) throw new Error("the bad row was imported");
    if (!(await courseExists("ACC 201")) || !(await courseExists("CSC 202"))) throw new Error("CSC 202 or ACC 201 is missing");
  });
});

// ================================================================== G · centres
await group("G", "Study centres and rooms (W-14, W-14c, W-14d)", async () => {
  await asAdmin();
  let akr = null;
  const sheet = () => a.getByRole("dialog", { name: akr.name });
  await step(a, "Akure Study Centre (AKR, Ondo) is there (added if missing)", async () => {
    await a.goto(`${UNI}/staff/centres`); await a.getByRole("heading", { name: /centres/i }).first().waitFor();
    akr = (await W("/academic/centres")).body.items.find((x) => x.code === "AKR") ?? null;
    if (!akr) {
      await a.getByRole("button", { name: "Add centre" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a study centre" }); await dialogOk(a, "Add a study centre");
      await dlg.getByLabel("Centre name").fill("Akure Study Centre"); await dlg.getByLabel("Code").fill("AKR");
      await dlg.getByLabel("State").selectOption("Ondo"); await dlg.getByLabel(/Phone students can call/).fill("0803 555 0117");
      await dlg.getByRole("button", { name: "Add centre" }).click(); await a.keyboard.press("Escape");
      akr = (await W("/academic/centres")).body.items.find((x) => x.code === "AKR");
    }
    found.akr = akr;
  });
  await step(a, "Its profile has Room 1 (30 seats, 30 computers; added if missing)", async () => {
    await a.goto(`${UNI}/staff/centres?centre=${akr.id}`); await sheet().waitFor(); await dialogOk(a, akr.name);
    const det = (await W(`/academic/centres/${akr.id}`)).body;
    if (!(det.roomsList ?? []).some((r) => r.name === "Room 1")) {
      await sheet().getByRole("button", { name: "Add room" }).click(); const dlg = a.getByRole("dialog", { name: "Add a room" }); await dialogOk(a, "Add a room");
      await dlg.getByLabel("Room name").fill("Room 1"); await dlg.getByLabel("Seats").fill("30"); await dlg.getByLabel("Computers").fill("30");
      await dlg.getByRole("button", { name: "Add room" }).click();
    }
    await sheet().getByText(/30 seats · 30 computers/).first().waitFor();
  });
  await step(a, "Negative - a room with more computers than seats is refused (nothing created)", async () => {
    const before = (await W(`/academic/centres/${akr.id}`)).body.roomsList.length;
    await sheet().getByRole("button", { name: "Add room" }).click(); const dlg = a.getByRole("dialog", { name: "Add a room" });
    await dlg.getByLabel("Room name").fill("Room 2"); await dlg.getByLabel("Seats").fill("30"); await dlg.getByLabel("Computers").fill("40");
    await dlg.getByRole("button", { name: "Add room" }).click(); await dlg.getByText("A room cannot have more computers than seats.").waitFor();
    await dlg.getByRole("button", { name: "Cancel" }).click();
    if ((await W(`/academic/centres/${akr.id}`)).body.roomsList.length !== before) throw new Error("the refused room was saved");
    await a.keyboard.press("Escape");
  });
  await step(a, "Checklist: step 4 done, student import unlocked", async () => {
    await checklist(a); await expectDone(a, 4); if (/Locked/.test(await steps(a).nth(7).innerText())) throw new Error("step 8 is still locked");
  });
});

// ================================================================== H · people
await group("H", "People & roles (W-15, W-15b, W-15c); staff email is held by the dev allow-list", async () => {
  await asAdmin();
  const dlg = a.getByRole("dialog", { name: "Invite a staff member" });
  const person = async (email) => ((await W(`/people?search=${enc(email)}`)).body.items ?? []).find((x) => x.email.toLowerCase() === email) ?? null;
  async function invite(pp, role, scopeLabel, option) {
    await a.getByRole("button", { name: "Invite staff" }).first().click(); await dialogOk(a, "Invite a staff member");
    await dlg.getByLabel("Full name").fill(pp.name); await dlg.getByLabel("University email").fill(pp.email);
    await dlg.getByRole("button", { name: role, exact: true }).click(); await pick(dlg.getByLabel(scopeLabel, { exact: true }), option);
    await dlg.getByRole("button", { name: "Send invite" }).click();
  }
  await step(a, "Negative - a Gmail address is refused: staff use @wesleyuni.edu.ng (only the error shows, not the hint too)", async () => {
    await a.goto(`${UNI}/staff/people`); await a.getByRole("heading", { name: "People & roles" }).first().waitFor();
    await invite({ name: "Dr Funmi Bello", email: "f.bello@gmail.com" }, "Lecturer", "Department", /Computer Science/);
    await dlg.getByText(`Use an @${DOMAIN} address`).first().waitFor();
    if (await dlg.getByText(`Must end in @${DOMAIN}`).count()) throw new Error("the hint still shows under the error");
    await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  for (const [pp, role, scopeLabel, option] of [[BELLO, "Lecturer", "Department", /Computer Science/], [ADE, "Centre coordinator", "Study centre", /Akure/]]) {
    await step(a, `${pp.name} is on People & roles (invited if missing; the email is recorded, not sent)`, async () => {
      if (!(await person(pp.email))) {
        const t0 = Date.now(); await invite(pp, role, scopeLabel, option); await a.getByText(`Invited ${pp.name}.`).waitFor();
        const m = await waitEmail(pp.email, t0, (e) => /invited/i.test(e.subject));
        if (m.status !== "SKIPPED") throw new Error(`the invitation to ${pp.email} was ${m.status}: the dev allow-list should hold it`);
      }
      await a.goto(`${UNI}/staff/people?search=${enc(pp.email)}`); await a.getByRole("button", { name: pp.name }).first().waitFor();
    });
  }
  const bulk = a.getByRole("dialog", { name: "Invite staff from a CSV file" });
  let kemiNew = false;
  await step(a, "Bulk invite CSV: unknown role, an existing email and a Gmail address are reported, nothing sent yet", async () => {
    kemiNew = !(await person(KEMI.email));
    await a.getByRole("button", { name: "Bulk invite (CSV)" }).click(); await dialogOk(a, "Invite staff from a CSV file");
    await bulk.getByLabel("Choose a CSV file").setInputFiles(csvFile(`wesley_staff_${RUN}.csv`, [
      "full_name,email,role,scope_type,scope_code", `${KEMI.name},${KEMI.email},Lecturer,UNIVERSITY,`, `Mr Tunde Ojo,t.ojo@${DOMAIN},Wizard,UNIVERSITY,`,
      `${BELLO.name},${BELLO.email},Lecturer,UNIVERSITY,`, "Mrs Yemi Ade,yemi.ade@gmail.com,Facilitator,UNIVERSITY,",
    ]));
    await bulk.getByText(kemiNew ? "3 rows need fixing" : "4 rows need fixing").waitFor();
    if (kemiNew && (await person(KEMI.email))) throw new Error("Kemi Ola was invited before confirming");
    if (await person(`t.ojo@${DOMAIN}`)) throw new Error("the unknown-role row was saved");
  });
  await step(a, kemiNew ? "Confirm: the good row (Dr Kemi Ola) is invited" : "Dr Kemi Ola is already here: cancel, nothing sent", async () => {
    if (kemiNew) { await bulk.getByRole("button", { name: "Import the rest" }).click(); await bulk.getByText(/Invited 1 person/).waitFor(); await bulk.getByRole("button", { name: "Done" }).click(); }
    else await bulk.getByRole("button", { name: "Cancel" }).click();
    if (!(await person(KEMI.email))) throw new Error("Kemi Ola is missing");
  });
});

// ================================================================== I · staffing
await group("I", "Staffing (W-16, W-16b, W-16c)", async () => {
  await asAdmin();
  const need = async () => (await W("/academic/staffing")).body;
  async function assign(courseCode, whoRe) {
    const st = await need(); const row = st.courses.find((x) => x.course.code === courseCode);
    if (!row) throw new Error(`${courseCode} is not on Staffing`);
    await a.getByRole("button", { name: `${row.needsLecturer ? "Assign" : "Edit"} staff for ${courseCode}` }).click();
    const dlg = a.getByRole("dialog", { name: new RegExp(`Who teaches ${courseCode}`) }); await dialogOk(a, `Who teaches ${courseCode}`);
    if (row.lecturer && whoRe.test(row.lecturer.fullName)) { await dlg.getByRole("button", { name: "Cancel" }).click(); return false; }
    await pick(dlg.getByLabel("Lecturer"), whoRe); await dlg.getByRole("button", { name: "Save" }).click();
    await a.getByText(`Saved who teaches ${courseCode}.`).waitFor(); return true;
  }
  await step(a, "Staffing: the courses tab counts the courses that still need a lecturer, as the checklist does", async () => {
    await a.goto(`${UNI}/staff/academic-setup/staffing`); const st = await need();
    await a.getByRole("link", { name: new RegExp(`^Courses \\(${st.needLecturer} need`) }).waitFor();
    const t = await (async () => { await checklist(a); return steps(a).nth(5).innerText(); })();
    if (st.needLecturer && !new RegExp(`${st.needLecturer} courses? still needs? a lecturer`).test(t)) throw new Error(`checklist step 6 says: ${t.replace(/\s+/g, " ")}`);
    await a.goto(`${UNI}/staff/academic-setup/staffing`);
  });
  await step(a, "Dr Bello lectures CSC 201 (the count drops when he is assigned)", async () => {
    const before = (await need()).needLecturer; const changed = await assign("CSC 201", /Funmi Bello/);
    if (changed && (await need()).needLecturer !== before - 1) throw new Error("the count did not drop");
  });
  await step(a, "Dr Kemi Ola lectures CSC 202 and ACC 201", async () => { await assign("CSC 202", /Kemi Ola/); await assign("ACC 201", /Kemi Ola/); });
  await step(a, "Mrs Ade coordinates Akure", async () => {
    await a.getByRole("link", { name: /^Centres \(/ }).click(); const st = await need();
    const row = st.centres.find((x) => x.centre.code === "AKR");
    await a.getByRole("button", { name: `${row.needsCoordinator ? "Assign" : "Edit"} coordinator for ${row.centre.name}` }).click();
    const dlg = a.getByRole("dialog", { name: `Coordinator for ${row.centre.name}` }); await dialogOk(a, `Coordinator for ${row.centre.name}`);
    if (row.coordinator && /Bisi Ade/.test(row.coordinator.fullName)) await dlg.getByRole("button", { name: "Cancel" }).click();
    else { await pick(dlg.getByLabel("Coordinator"), /Bisi Ade/); await dlg.getByRole("button", { name: "Save" }).click(); await a.getByText(`Saved the coordinator for ${row.centre.name}.`).waitFor(); }
  });
});

// ================================================================== J · grading
await group("J", "Grading rules (W-17, W-17b, W-17c, W-17d)", async () => {
  await asAdmin();
  const saveBtn = () => a.getByRole("button", { name: /^(Confirm these rules|Save rules)$/ });
  await step(a, "Grading rules page", async () => { await a.goto(`${UNI}/staff/academic-setup/grading`); await a.getByLabel("Coursework (CA)").waitFor(); });
  await step(a, "Negative - CA 40 / exam 50 is refused (W-17c) and Save is disabled", async () => {
    await a.getByLabel("Coursework (CA)").fill("40"); await a.getByLabel("Exam").fill("50");
    await a.getByText("Must add up to 100").waitFor(); await a.getByText("Fix 1 problem: the weights add up to 90").waitFor();
    if (await saveBtn().isEnabled()) throw new Error("Save is enabled with 40/50");
  });
  await step(a, "Negative - overlapping bands C and D are refused; cancel", async () => {
    await a.getByRole("button", { name: "Edit bands" }).click();
    const cFrom = await a.getByRole("group", { name: "Band C" }).getByLabel("From").inputValue();
    await a.getByRole("group", { name: "Band D" }).getByLabel("To").fill(String(Number(cFrom) + 2)); await a.getByText(/bands C and D overlap/).waitFor();
    if (await a.getByRole("button", { name: "Save bands" }).isEnabled()) throw new Error("Save bands is enabled with overlapping bands");
    await a.getByRole("button", { name: "Cancel" }).first().click(); await a.reload(); await a.getByLabel("Coursework (CA)").waitFor();
  });
  await step(a, "The default rules are confirmed (saved once; 30/70)", async () => {
    const g = (await W("/academic/grading")).body;
    if (!g.saved) { await a.getByRole("button", { name: "Confirm these rules" }).click(); await a.getByText(/Saved\. Version \d+ applies from/).waitFor(); }
    const g2 = (await W("/academic/grading")).body; if (!g2.saved || g2.caWeight + g2.examWeight !== 100) throw new Error("the default rules are not saved");
  });
  await step(a, "B.Sc. Computer Science gets its own rules (40/60)…", async () => {
    await pick(a.getByLabel("Rules for"), /^B\.Sc\. Computer Science$/); await a.getByText(/B\.Sc\. Computer Science (follows the default rules|has its own rules)/).waitFor();
    if (await a.getByText("B.Sc. Computer Science has its own rules").count()) return;
    await a.getByLabel("Coursework (CA)").fill("40"); await a.getByLabel("Exam").fill("60");
    await a.getByRole("button", { name: "Save rules" }).click(); await a.getByText("B.Sc. Computer Science has its own rules").waitFor();
  });
  await step(a, "…and follows the default again", async () => {
    await a.getByRole("button", { name: "Use the default again" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "Use the default" }).click(); await a.getByText("B.Sc. Computer Science follows the default rules").waitFor();
  });
  await step(a, "Checklist: steps 1, 2, 4, 5 and 7 done", async () => { await checklist(a); await expectDone(a, 1, 2, 4, 5, 7); });
});

// ================================================================== K · staff accounts
await group("K", "Staff accounts: suspend, restore and reset two-step (W-21)", async () => {
  await asAdmin();
  const sheet = a.getByRole("dialog", { name: BELLO.name });
  async function openBello() { await a.goto(`${UNI}/staff/people?search=${enc(BELLO.email)}`); await a.getByRole("button", { name: BELLO.name }).first().click(); await sheet.getByText(/Active|Invited|Suspended/).first().waitFor(); await dialogOk(a, BELLO.name); }
  async function belloSetsUp() {
    await leave(); await b.goto(`${UNI}/staff/sign-in`); await google(b, BELLO.email); await b.getByText("1. Scan with your authenticator app").waitFor();
    belloSecret = (await b.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
    await typeCode(b, await code(belloSecret)); await b.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await b.getByRole("button", { name: /saved them/ }).click(); await b.waitForURL(/\/staff/); who = "bello";
  }
  const bello = async () => (await W(`/people?search=${enc(BELLO.email)}`)).body.items[0];
  if (!(await (async () => { await onWesley(); return (await bello()).twoStepSetUp; })())) {
    await step(b, "Ngozi signs out; Dr Bello signs in for the first time and sets up two-step", belloSetsUp);
    await asAdmin();
  }
  await step(a, "Suspend asks for a reason and names the course he lectures", async () => {
    await openBello(); await sheet.getByRole("button", { name: `Suspend ${BELLO.name}` }).click();
    const dlg = a.getByRole("dialog", { name: `Suspend ${BELLO.name}?` }); await dlg.getByText(/CSC 201/).first().waitFor(); await dialogOk(a, `Suspend ${BELLO.name}?`);
    await dlg.getByRole("button", { name: "Suspend" }).click(); await dlg.getByText("Write why. It is kept in the audit log.").waitFor();
    await dlg.getByLabel("Reason (kept in the audit log)").fill("On leave from 1 Dec"); await dlg.getByRole("button", { name: "Suspend" }).click();
    await a.getByText(`${BELLO.name} is suspended and was signed out everywhere.`).waitFor();
  });
  await step(b, "Negative - suspended: Dr Bello's sign-in is refused", async () => {
    await leave(); await b.goto(`${UNI}/staff/sign-in`); await google(b, BELLO.email); await b.waitForURL(/error=suspended/); await b.getByText(/suspended/i).first().waitFor();
  });
  await asAdmin();
  await step(a, "Ngozi restores his access", async () => {
    await openBello(); await sheet.getByRole("button", { name: "Restore access" }).click(); await a.getByText(`${BELLO.name} can sign in again.`).first().waitFor();
  });
  let t0 = 0;
  await step(a, "Reset his two-step sign-in (reason required)", async () => {
    await sheet.getByRole("button", { name: "Reset two-step sign-in" }).click();
    const dlg = a.getByRole("dialog", { name: /Reset Dr Funmi Bello’s two-step sign-in/ }); await dialogOk(a, "Reset two-step sign-in");
    await dlg.getByRole("button", { name: "Reset two-step sign-in" }).click(); await dlg.getByText(/Write why/).waitFor();
    t0 = Date.now(); await dlg.getByLabel("Reason (kept in the audit log)").fill("Lost phone"); await dlg.getByRole("button", { name: "Reset two-step sign-in" }).click();
    await a.getByText(/Reset Dr Funmi Bello’s two-step sign-in/).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(b, "His next sign-in asks him to set up two-step again (W-04); his email is recorded, not sent", async () => {
    const m = await waitEmail(BELLO.email, t0 - 20_000, (e) => /two-step/i.test(e.subject + e.body));
    if (m.status !== "SKIPPED") throw new Error(`the reset email was ${m.status}`);
    await belloSetsUp();
  });
});

// ================================================================== L · import
const FIRST = ["Chidi", "Amaka", "Tunde", "Ngozi", "Emeka", "Halima", "Kunle", "Zainab", "Femi", "Chioma", "Ibrahim", "Yetunde", "Obinna", "Aisha", "Segun"];
const LAST = ["Okeke", "Adeyemi", "Balogun", "Eze", "Lawal", "Nwosu", "Okonkwo", "Bakare", "Danjuma", "Afolabi", "Uche", "Ogunleye"];
function portalRows() {
  const rows = ["matric_number,surname,first_name,other_names,programme_code,level,study_centre,email,phone"];
  for (let i = 1; i <= 300; i++) {
    const m = `WU/ODL/24/${String(i).padStart(4, "0")}`;
    if (m === ADEOLA.matric) { rows.push(`${m},Okafor,Adeola,,${found.csc},200,AKR,${ADEOLA.email},0803 412 4417`); continue; }
    if (m === NO_EMAIL) { rows.push(`${m},Musa,Ibrahim,,${found.csc},200,Akure,,0803 412 0201`); continue; }
    const f = FIRST[i % FIRST.length], l = LAST[(i * 7) % LAST.length];
    rows.push(`${m},${l},${f},,${i % 2 ? found.csc : found.acc},${i % 3 ? 100 : 200},${i % 4 ? "AKR" : "Akure Study Centre"},${f.toLowerCase()}.${l.toLowerCase()}${i}@wesley.test,0803 412 ${String(i).padStart(4, "0")}`);
  }
  rows.push(`${P.matric},${P.surname},${P.first},,${found.csc},200,AKR,${P.email},0803 999 ${RUN.padStart(4, "0")}`);
  rows.push(`WU/ODL/24/0299,Okeke,Chidi,,${found.csc},100,AKR,chidi.copy@wesley.test,`);
  rows.push(`WU/ODL/24/0301,Bello,Sade,,${found.csc},100,Ikeja,sade.bello@wesley.test,`);
  rows.push(`WU/ODL/24/0302,Ojo,Kayode,,BSC-XYZ,100,AKR,kayode.ojo@wesley.test,`);
  return rows;
}
async function studentByMatric(m) { return ((await W(`/students?q=${enc(m)}&size=5`)).body.items ?? []).find((x) => x.matricNumber === m) ?? null; }
await group("L", "Import students (W-18, W-19, W-18b): 304 rows, 4 bad; re-importing never duplicates", async () => {
  await asAdmin();
  await onWesley(); if (!found.csc || !found.acc) await programmeCodes();
  const rows = portalRows();
  await step(a, "Import page; the CSV template downloads", async () => {
    await a.goto(`${UNI}/staff/students/import`, { waitUntil: "networkidle" }); await a.getByRole("heading", { name: "Import admitted students" }).waitFor();
    const [dl] = await Promise.all([a.waitForEvent("download"), a.getByText("Download template").first().click()]);
    const text = readFileSync(await dl.path()).toString(); if (!/matric_number/.test(text.split("\n")[0])) throw new Error(`the template header is ${text.split("\n")[0]}`);
  });
  await step(a, "Negative - an Excel file is refused: save it as CSV", async () => {
    await a.getByLabel("Choose the portal CSV file").setInputFiles({ name: "portal.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK") });
    await a.getByText(/Save it as CSV/).first().waitFor();
  });
  await step(a, `W-19: ${rows.length - 1} rows checked: 300 ready, 4 errors (duplicate matric, unknown centre, unknown programme), the no-email warning`, async () => {
    await a.getByLabel("Choose the portal CSV file").setInputFiles(csvFile(PORTAL_NAME, rows));
    await a.getByRole("heading", { name: "Check before importing" }).waitFor({ timeout: 60_000 }); await a.getByRole("button", { name: "Import 300 valid rows" }).waitFor();
    const main = await a.locator("main").innerText();
    for (const re of [/Study centre "Ikeja" not found/, /appears twice in this file/, /Programme code "BSC-XYZ" unknown/, /No email: this student cannot get the welcome/]) if (!re.test(main)) throw new Error(`the report does not show ${re}`);
  });
  await step(a, `Nothing is saved before confirming (this run's student ${P.matric} is not there yet)`, async () => { if (await studentByMatric(P.matric)) throw new Error(`${P.matric} already exists`); });
  await step(a, "Confirm: imported, the bad rows skipped", async () => {
    await a.getByRole("button", { name: "Import 300 valid rows" }).click();
    await a.getByRole("heading", { name: "Students imported" }).waitFor({ timeout: 60_000 }); await a.getByText(/4 rows skipped/).first().waitFor();
    if (!(await studentByMatric(P.matric))) throw new Error(`${P.matric} was not created`);
  });
  await step(a, "The same file again: every row is unchanged, nothing duplicated (not confirmed)", async () => {
    await a.goto(`${UNI}/staff/students/import`, { waitUntil: "networkidle" });
    await a.getByLabel("Choose the portal CSV file").setInputFiles(csvFile(PORTAL_NAME, rows));
    await a.getByRole("heading", { name: "Check before importing" }).waitFor({ timeout: 60_000 }); await a.getByText(/0 new · 0 updated · 300 unchanged/).first().waitFor();
  });
  await step(a, "Import history lists this run's file", async () => {
    await a.goto(`${UNI}/staff/students/import`); await a.getByRole("button", { name: "Import history" }).click(); await dialogOk(a, "Import history");
    await a.getByRole("dialog", { name: "Import history" }).getByText(PORTAL_NAME).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(a, "Adeola Okafor's record keeps a .test address (codes for her are never really emailed)", async () => {
    const r = await studentByMatric(ADEOLA.matric); if (!r?.email?.endsWith(".test")) throw new Error(`Adeola's email is ${r?.email}`);
  });
  await step(a, "Checklist: step 8 done, step 9 open", async () => { await checklist(a); await expectDone(a, 8); if (/Locked/.test(await steps(a).nth(8).innerText())) throw new Error("step 9 is still locked"); });
});

// ================================================================== M · add one student
await group("M", "Add one student (W-22c)", async () => {
  await asAdmin();
  const dlg = a.getByRole("dialog", { name: "Add a student" });
  async function fill(matric) {
    await a.getByRole("button", { name: "Add a student" }).click(); await dialogOk(a, "Add a student");
    await dlg.getByLabel("First name").fill(GRACE.first); await dlg.getByLabel("Surname").fill(GRACE.surname); await dlg.getByLabel("Matric number").fill(matric);
    await pick(dlg.getByLabel("Programme and level"), /B\.Sc\. Computer Science · 100L/); await pick(dlg.getByLabel("Study centre"), /Akure/);
    await dlg.getByLabel("Email (for the welcome email)").fill("grace.nwosu@wesley.test");
    const cb = dlg.getByLabel("Send the welcome email now"); if (await cb.isChecked()) await cb.uncheck();
  }
  await step(a, "Negative - a matric number already on the platform is refused (nothing created)", async () => {
    await a.goto(`${UNI}/staff/students`); await fill(ADEOLA.matric); await dlg.getByRole("button", { name: "Add student" }).click();
    await dlg.getByText(/already/i).first().waitFor(); await dlg.getByRole("button", { name: "Cancel" }).click();
  });
  await step(a, `Grace Nwosu (${GRACE.matric}), a late admission, is on the list (added if missing)`, async () => {
    if (!(await studentByMatric(GRACE.matric))) { await fill(GRACE.matric); await dlg.getByRole("button", { name: "Add student" }).click(); await a.getByText("Added Grace Nwosu.").waitFor(); }
    await a.goto(`${UNI}/staff/students?q=${enc(GRACE.matric)}`); await a.getByRole("button", { name: "Grace Nwosu" }).first().waitFor();
  });
});

// ================================================================== N · welcome emails
async function realAddressesNotActivated() {
  const out = []; let page = 0;
  for (;;) {
    const r = (await W(`/students?status=NOT_ACTIVATED&size=200&page=${page}`)).body;
    for (const x of r.items) if (isAllowedReal(x.email)) out.push(`${x.matricNumber} ${x.email}`);
    page += 1; if (page * r.size >= r.total || !r.items.length) break;
  }
  return out;
}
async function sendToAll() {
  const real = await realAddressesNotActivated();
  if (real.length) throw new Error(`not sending: these not-activated students have addresses that really get email: ${real.slice(0, 5).join("; ")}`);
  await a.getByRole("button", { name: /^Send to [\d,]+ students?$/ }).click(); await dialogOk(a, "Send to students?");
  await a.getByRole("button", { name: "Send now" }).click();
  const report = a.getByRole("dialog", { name: "Welcome messages sent" }); await report.waitFor({ timeout: 300_000 }); await dialogOk(a, "Welcome messages sent");
  return report;
}
await group("N", "Welcome emails (W-20, W-20d, W-20c)", async () => {
  await asAdmin();
  const ed = a.getByRole("dialog", { name: "Edit the welcome email" });
  const MARK = "The Wesley ODeL office is open 8am to 4pm.";
  let base = "";
  await step(a, "Negative - the wording without {activation_link} is refused", async () => {
    await a.goto(`${UNI}/staff/students/welcome`, { waitUntil: "networkidle" }); await a.getByRole("heading", { name: "Send welcome messages" }).waitFor();
    await a.getByRole("button", { name: "Edit the wording" }).click(); await dialogOk(a, "Edit the welcome email");
    base = (await ed.getByLabel("Welcome email").inputValue()).replace(`\n${MARK}`, "");
    await ed.getByLabel("Welcome email").fill(base.replaceAll("{activation_link}", "")); await ed.getByRole("button", { name: "Save template" }).click();
    await ed.getByText(/activation_link/).first().waitFor();
  });
  await step(a, "Negative - an unknown field {foo} is refused", async () => {
    await ed.getByLabel("Welcome email").fill(`${base}\n{foo}`); await ed.getByRole("button", { name: "Save template" }).click(); await ed.getByText(/Unknown field \{foo\}/).first().waitFor();
  });
  await step(a, "The edited wording is saved", async () => {
    await ed.getByLabel("Welcome email").fill(`${base}\n${MARK}`); await ed.getByRole("button", { name: "Save template" }).click(); await a.getByText(/Saved the welcome email/).waitFor();
  });
  await step(a, "Send a test to me: in the log for Ngozi with the new wording, held by the dev allow-list", async () => {
    const t0 = Date.now(); await a.getByRole("button", { name: "Send a test to me" }).click(); await a.getByText(`Sent a test to ${NGOZI.email}.`, { exact: false }).waitFor();
    const m = await waitEmail(NGOZI.email, t0, (e) => e.body.includes("8am to 4pm"));
    if (m.status !== "SKIPPED") throw new Error(`the test email was ${m.status}`); if (!/activate/.test(m.body)) throw new Error("no activation link in it");
  });
  await step(a, "Send to everyone with an email (after checking none is a real address): progress, then the delivery report (W-20c)", async () => {
    const report = await sendToAll();
    await report.getByText(/emails delivered/).waitFor(); await report.getByText(/did not get the welcome/).waitFor();
    await report.getByRole("table", { name: /did not get the welcome/ }).getByText(/Ibrahim Musa|Musa Ibrahim/).first().waitFor();
  });
  await step(a, `This run's student's welcome is in the log with the activation link`, async () => {
    const m = await waitEmail(P.email, Date.now() - 600_000, (e) => /activate\?matric=/.test(e.body));
    if (!m.body.includes(`${UNI}/activate?matric=${enc(P.matric)}`)) throw new Error(`unexpected link: ${m.body.slice(0, 300)}`);
  });
  await step(a, "Checklist: step 9 done", async () => { await checklist(a); await expectDone(a, 9); });
});

// ================================================================== O · activation
const pw = (label) => s.getByLabel(label, { exact: true });
async function studentSignIn(matric, password) {
  await s.getByLabel("Matric number or email").fill(matric); await pw("Password").fill(password); await s.getByRole("button", { name: "Sign in" }).click();
}
const home = () => s.getByRole("heading", { name: "Your courses appear after registration" });
await group("O", `Activation on a phone (M-01 … M-06, E-01 … E-03), 390 px: this run's student ${P.matric}`, async () => {
  await step(s, "Ngozi signs out; the student portal's welcome page (M-01) fits a 390 px phone", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/`); await s.getByRole("link", { name: "Activate my account" }).waitFor(); await noSideways(s);
  });
  await step(s, "Negative - an unknown matric number (E-01)", async () => {
    await s.getByRole("link", { name: "Activate my account" }).click();
    await s.getByLabel("Matric number").fill("WU/ODL/24/8888"); await s.getByRole("button", { name: "Send my code" }).click();
    await s.getByText(/We could not find this number/).waitFor(); await noSideways(s);
  });
  await step(s, "Negative - a student with no email (E-03) is told to contact the Akure centre", async () => {
    await s.getByLabel("Matric number").fill(NO_EMAIL); await s.getByRole("button", { name: /Send my code|Try again/ }).click();
    await s.getByText("We have no email address for you", { exact: true }).waitFor(); await s.getByText(/Akure/).first().waitFor();
  });
  let t0 = 0;
  await step(s, "The link in the welcome email opens with the matric number filled in; the code is sent (M-03)", async () => {
    await s.goto(`${UNI}/activate?matric=${enc(P.matric)}`);
    if ((await s.getByLabel("Matric number").inputValue()) !== P.matric) throw new Error("the matric number is not filled in");
    t0 = Date.now(); await s.getByRole("button", { name: "Send my code" }).click();
    await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor(); await s.getByText(/t•+@wesley\.test/).waitFor(); await noSideways(s);
  });
  let first = "";
  await step(s, "The code is in the email log within 60 seconds", async () => {
    first = codeIn(await waitEmail(P.email, t0, (e) => !!codeIn(e) && !/activate\?matric/.test(e.body))); if (!first) throw new Error("no code in the email");
  });
  await step(s, "Negative - a wrong code: 2 tries left", async () => {
    await typeCode(s, first === "000000" ? "111111" : "000000"); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByText("That code is not right. 2 tries left before we send a new one.").waitFor();
  });
  await step(s, "I can't access this email: the Akure centre to call", async () => {
    await s.getByRole("button", { name: "I can’t access this email" }).click();
    const d = s.getByRole("dialog", { name: "Can’t access this email?" }); await d.getByText(/Akure/).first().waitFor(); await dialogOk(s, "Can't access this email?");
    await d.getByRole("button", { name: "Cancel" }).click();
  });
  let second = "";
  await step(s, "Resend after the 60-second wait sends a new code", async () => {
    const btn = s.getByRole("button", { name: "Send a new code" }); await btn.waitFor({ timeout: 75_000 });
    const t1 = Date.now(); await btn.click(); await s.getByText(/We sent a new code to/).waitFor();
    second = codeIn(await waitEmail(P.email, t1, (e) => !!codeIn(e)));
  });
  await step(s, "Right code: create a password; the rules tick as you type (M-04)", async () => {
    await typeCode(s, second); await s.getByRole("button", { name: "Verify" }).click(); await s.getByRole("heading", { name: "Create a password" }).waitFor();
    await pw("New password").fill("short"); await s.getByRole("list", { name: "Password rules" }).getByText(/\(not yet\)/).first().waitFor(); await noSideways(s);
  });
  await step(s, "Negative - passwords that do not match", async () => {
    await pw("New password").fill("Tobi2026x"); await pw("Confirm password").fill("Tobi2025x");
    await s.getByRole("button", { name: "Continue" }).click(); await s.getByText("The two passwords do not match.").first().waitFor();
  });
  await step(s, "Privacy notice: accepting without the tick is refused, then accepted (M-05)", async () => {
    await pw("Confirm password").fill("Tobi2026x"); await s.getByRole("button", { name: "Continue" }).click();
    await s.getByRole("heading", { name: "How we use your information" }).waitFor();
    await s.getByRole("button", { name: "Accept and continue" }).click(); await s.getByText("Tick the box to accept the privacy notice.").waitFor();
    await s.getByLabel("I have read and accept the privacy notice").check(); await s.getByRole("button", { name: "Accept and continue" }).click();
  });
  await step(s, "Check your details (M-06), then Home with programme and centre", async () => {
    await s.getByRole("heading", { name: "Check your details" }).waitFor(); await s.getByText(new RegExp(`${P.matric.replaceAll("/", "\\/")} · B\\.Sc\\. Computer Science · 200L`)).waitFor();
    await s.getByRole("button", { name: "Save and go to my dashboard" }).click(); await home().waitFor(); await s.getByText(/Akure/).first().waitFor();
    who = "student"; await noSideways(s);
  });
  await step(s, "Negative - activating again: this account is already active (E-02)", async () => {
    await leave(); await s.goto(`${UNI}/activate?matric=${enc(P.matric)}`); await s.getByRole("button", { name: "Send my code" }).click(); await s.getByText("This account is already active").waitFor();
  });
  await step(s, "Adeola Okafor (WU/ODL/24/0153) is active and signs in with her password (activated or reset by code if needed)", async () => {
    await s.goto(`${UNI}/sign-in`); await studentSignIn(ADEOLA.matric, ADEOLA.password);
    const settle = (loc, v) => loc.waitFor().then(() => v, () => new Promise(() => {})); // the losers never settle, so nothing is left unhandled
    const outcome = await Promise.race([settle(home(), "home"), settle(s.getByText(/not activated/i).first(), "inactive"), settle(s.getByText(/Wrong password|Too many attempts/).first(), "password")]);
    if (outcome === "inactive") {
      await s.goto(`${UNI}/activate?matric=${enc(ADEOLA.matric)}`); const t = Date.now(); await s.getByRole("button", { name: "Send my code" }).click();
      await s.getByText(/a•+@wesley\.test/).waitFor(); await typeCode(s, codeIn(await waitEmail(ADEOLA.email, t, (e) => !!codeIn(e) && !/activate\?matric/.test(e.body))));
      await s.getByRole("button", { name: "Verify" }).click(); await pw("New password").fill(ADEOLA.password); await pw("Confirm password").fill(ADEOLA.password);
      await s.getByRole("button", { name: "Continue" }).click(); await s.getByLabel("I have read and accept the privacy notice").check(); await s.getByRole("button", { name: "Accept and continue" }).click();
      await s.getByRole("button", { name: "Save and go to my dashboard" }).click(); await home().waitFor();
    } else if (outcome === "password") {
      await s.goto(`${UNI}/reset-password?login=${enc(ADEOLA.matric)}`); const t = Date.now(); await s.getByRole("button", { name: "Continue" }).click();
      await s.getByText(/a•+@wesley\.test/).waitFor(); await typeCode(s, codeIn(await waitEmail(ADEOLA.email, t, (e) => !!codeIn(e)))); await s.getByRole("button", { name: "Verify" }).click();
      await pw("New password").fill(ADEOLA.password); await pw("Confirm password").fill(ADEOLA.password); await s.getByRole("button", { name: "Save and sign in" }).click(); await home().waitFor();
    }
    who = "student";
  });
});

// ================================================================== P · second send
await group("P", "A second welcome send skips students who are already active", async () => {
  await asAdmin();
  await step(a, "The page counts the already-active students; the new send's report says they were skipped", async () => {
    await a.goto(`${UNI}/staff/students/welcome`, { waitUntil: "networkidle" }); await a.getByText(/The [1-9][\d,]* already active get nothing/).waitFor();
    const report = await sendToAll(); await report.getByText(/already active were skipped/).waitFor();
  });
});

// ================================================================== Q · sign-in, lockout, reset
await group("Q", `Student sign-in, lockout and reset by code (M-08, E-04, E-05, M-09 … M-11), 390 px: ${P.matric}`, async () => {
  await step(s, "Sign in with matric number and password: Home", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`); await noSideways(s); await studentSignIn(P.matric, "Tobi2026x"); await home().waitFor(); who = "student";
  });
  await step(s, "Negative - a wrong password: 4 tries left (E-04)", async () => {
    await leave(); await s.goto(`${UNI}/sign-in`); await studentSignIn(P.matric, "Wrong-pass1"); await s.getByText(/Wrong password\. 4 tries left/).waitFor();
  });
  await step(s, "Negative - five wrong passwords lock sign-in with the time (E-05)", async () => {
    // Wait for each answer before the next try: the page clears the password field when the answer arrives.
    for (let i = 2; i <= 5; i++) {
      await pw("Password").fill(`Wrong-pass${i}`); await s.getByRole("button", { name: "Sign in" }).click();
      await (i < 5 ? s.getByText(new RegExp(`Wrong password\\. ${5 - i} tr(y|ies) left`)) : s.getByText("Too many attempts")).waitFor();
    }
    await s.getByText(/until \d{1,2}:\d{2}\s?[ap]m/).first().waitFor();
    if (await s.getByRole("button", { name: "Sign in" }).isEnabled()) throw new Error("Sign in is still enabled while locked"); await noSideways(s);
  });
  await step(s, "Reset by emailed code from the lockout banner: new password, signed in", async () => {
    await s.getByRole("link", { name: "Reset password" }).click(); await s.waitForURL(/reset-password/);
    const t0 = Date.now(); await s.getByRole("button", { name: "Continue" }).click(); await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor();
    await typeCode(s, codeIn(await waitEmail(P.email, t0, (e) => !!codeIn(e)))); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByRole("heading", { name: "Choose a new password" }).waitFor();
    await pw("New password").fill("Tobi2027x"); await pw("Confirm password").fill("Tobi2027x"); await s.getByRole("button", { name: "Save and sign in" }).click(); await home().waitFor(); who = "student";
  });
});

// ================================================================== R · office side
await group("R", "The office side: students list and record (W-22, W-22b)", async () => {
  const rec = a.getByRole("dialog", { name: P.name });
  async function openP() { await a.goto(`${UNI}/staff/students?q=${enc(P.matric)}`); await a.getByRole("button", { name: P.name }).first().click(); await rec.getByText("Activation message").waitFor(); await dialogOk(a, P.name); }
  await asAdmin();
  await step(a, "Search by name, matric number and email", async () => {
    await a.goto(`${UNI}/staff/students`); await a.getByLabel("Search students").fill(P.surname); await a.getByRole("button", { name: "Find" }).click(); await a.getByRole("button", { name: P.name }).first().waitFor();
    await a.getByLabel("Search students").fill(P.matric); await a.getByRole("button", { name: "Find" }).click(); await a.getByText("1 student match.").waitFor();
    await a.getByLabel("Search students").fill(P.email); await a.getByRole("button", { name: "Find" }).click(); await a.getByText("1 student match.").waitFor();
  });
  await step(a, "Filters: Akure, 200L, Active include this run's student and Adeola", async () => {
    await a.goto(`${UNI}/staff/students`);
    await a.locator('select[name="centre"]').selectOption("AKR"); await a.locator('select[name="level"]').selectOption("200"); await a.locator('select[name="status"]').selectOption("ACTIVE");
    await a.getByRole("button", { name: "Find" }).click(); await a.waitForURL(/status=ACTIVE/);
    const r = (await W("/students?centre=AKR&level=200&status=ACTIVE&size=200")).body;
    for (const m of [P.matric, ADEOLA.matric]) if (!r.items.some((x) => x.matricNumber === m)) throw new Error(`${m} is not in the filtered list`);
    if (r.items.some((x) => x.status !== "ACTIVE" || x.level !== 200 || x.centre.code !== "AKR")) throw new Error("the filter let other students through");
  });
  await step(a, "The record (W-22b) shows the student active with the consent date", async () => {
    await openP(); await rec.getByText("Active").first().waitFor(); await rec.getByText(/Accepted the privacy notice \(version .+\) on/).waitFor(); await rec.getByText(/activated/).first().waitFor();
  });
  let t0 = 0;
  await step(a, "Send a reset code from the record", async () => {
    t0 = Date.now(); await rec.getByRole("button", { name: "Send code" }).click(); await rec.getByText(`Emailed a password reset code to ${P.email}.`).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(s, "The office's email link opens the reset screen without a second code; a new password", async () => {
    const m = await waitEmail(P.email, t0, (e) => !!codeIn(e) && /reset-password/.test(e.body));
    const link = (m.body.match(/https:\/\/\S+reset-password\S*/) ?? [])[0]; if (!link) throw new Error("no reset link in the email");
    await leave(); await phone(); await s.goto(link); await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor();
    await typeCode(s, codeIn(m)); await s.getByRole("button", { name: "Verify" }).click();
    await pw("New password").fill("Tobi2028x"); await pw("Confirm password").fill("Tobi2028x"); await s.getByRole("button", { name: "Save and sign in" }).click(); await home().waitFor(); who = "student";
    if (emails(P.email).some((e) => Date.parse(e.created_at) > Date.parse(m.created_at))) throw new Error("a second code was emailed");
  });
  await asAdmin();
  await step(a, "Resend the welcome from a not-activated student's record", async () => {
    await a.goto(`${UNI}/staff/students?q=${enc("WU/ODL/24/0001")}`); await a.locator("main table").getByRole("button").first().click();
    const sheet = a.getByRole("dialog").filter({ hasText: "Activation message" }); await dialogOk(a, "Student record");
    await sheet.getByRole("button", { name: /^(Resend|Send)$/ }).click(); await sheet.getByText(/Sent the welcome email to/).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(a, "Suspend the student (reason required)", async () => {
    await openP(); await rec.getByRole("button", { name: "Suspend this student" }).click();
    const d = a.getByRole("dialog", { name: `Suspend ${P.name}?` }); await dialogOk(a, `Suspend ${P.name}?`);
    await d.getByRole("button", { name: "Suspend" }).click(); await d.getByText(/Write why/).waitFor();
    await d.getByLabel("Reason").fill("Fees query"); await d.getByRole("button", { name: "Suspend" }).click(); await a.getByText(`${P.name} is suspended and was signed out.`).first().waitFor();
  });
  await step(s, "Negative - suspended: sign-in is refused (E-06)", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`); await studentSignIn(P.matric, "Tobi2028x"); await s.getByText("Your account is suspended").waitFor();
  });
  await asAdmin();
  await step(a, "Ngozi restores access", async () => {
    await openP(); await rec.getByRole("button", { name: "Restore access" }).click(); await a.getByText(`${P.name} can sign in again.`).first().waitFor(); await a.keyboard.press("Escape");
  });
  await step(s, "The student signs in again", async () => {
    await leave(); await phone(); await s.goto(`${UNI}/sign-in`); await studentSignIn(P.matric, "Tobi2028x"); await home().waitFor(); who = "student";
  });
});

// ================================================================== S · audit log
await group("S", "The university's audit log", async () => {
  await asAdmin();
  async function has(type, re) {
    await a.goto(`${UNI}/staff/reports/audit${type ? `?type=${type}` : ""}`); await a.getByRole("table", { name: /Audit log/ }).waitFor();
    if (!re.test(await a.locator("main").innerText())) throw new Error(`the ${type ?? "full"} audit log does not show ${re}`);
  }
  const m = P.matric.replaceAll("/", "\\/");
  await step(a, "This run's import", async () => { await has("STUDENTS", new RegExp(`Imported ${PORTAL_NAME.replaceAll(".", "\\.")}: `)); });
  await step(a, "The welcome sends", async () => { await has("STUDENTS", /sent the welcome email to [\d,]+ students not yet active \([1-9][\d,]* already active skipped\)/); });
  await step(a, "The student's activation", async () => { await has("SIGN_IN", new RegExp(`${P.name} \\(${m}\\) activated the account`)); });
  await step(a, "The student's suspension and password resets", async () => {
    await has("STUDENTS", new RegExp(`suspended ${P.name} \\(${m}\\)`)); await has("STUDENTS", new RegExp(`${P.name} chose a new password with an emailed code`));
  });
  await step(a, "Dr Bello's suspension and two-step reset", async () => { await has("ROLES", /Suspended Dr Funmi Bello: On leave from 1 Dec/); await has("SIGN_IN", /Reset Dr Funmi Bello's two-step sign-in: Lost phone/); });
  await step(a, "Entries carry the person's own IP address, not the server's", async () => {
    await a.goto(`${UNI}/staff/reports/audit`); const ips = [...new Set((await W("/audit?size=50")).body.items.map((x) => x.ip))];
    if (ips.some((ip) => /^(127\.|::1$|0:0:0:0:0:0:0:1$)/.test(ip ?? ""))) throw new Error(`audit IPs: ${ips.join(", ")}`);
  });
});

// ================================================================== T · isolation
await group("T", "Universities are kept apart: Crestfield cannot see Wesley", async () => {
  await asAdmin();
  const CREST = `https://crestfield.${BASE}`;
  await step(a, "Ngozi opening Crestfield's staff pages is sent to Crestfield's sign-in", async () => { await a.goto(`${CREST}/staff/students`); await a.waitForURL(/\/staff\/sign-in/); }, { allow: [401, 403] });
  await step(a, "Crestfield's API refuses Wesley's session", async () => {
    for (const path of ["/api/v1/students?q=Okafor", "/api/v1/setup/checklist"]) { const r = await apiGet(a, path); if (r.status !== 401 && r.status !== 403) throw new Error(`${path} answered ${r.status}`); }
  }, { allow: [401, 403] });
  await step(a, "Negative - Ngozi cannot sign in on Crestfield", async () => { await google(a, NGOZI.email); await a.waitForURL(/error=wrong_domain/); });
  await step(s, "Negative - a Wesley matric number is unknown on Crestfield's student portal", async () => {
    await s.goto(`${CREST}/sign-in`); await studentSignIn(P.matric, "Tobi2028x"); await s.getByText(/could not find that matric number/).waitFor();
  });
  await step(a, "Wesley's own pages still work for Ngozi", async () => { await checklist(a); });
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\nRun ${RUN} (student ${P.matric}). ${passed} of ${results.length} steps passed.`);
process.exit(passed === results.length ? 0 : 1);
