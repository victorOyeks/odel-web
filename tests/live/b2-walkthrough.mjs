// B2 (Pay and register) end-to-end walkthrough on Wesley University on the hosted dev site, in one visible browser window.
// Run (secrets only from the environment, never in this file):
//   ODEL_E2E_PROVIDER_TOTP=… ODEL_E2E_ADMIN_TOTP=… ODEL_E2E_STUDENT_PASSWORD=… bun tests/live/b2-walkthrough.mjs
//   ONLY=P,R   run just those groups (sign-in happens as needed); RUN=123 names this run (the fresh student's matric number);
//   FRESH=1    the story student is a new student added and activated in this run (WU/ODL/24/8NNN) instead of Adeola Okafor,
//              so a regression can pay and register again (Adeola's 1st-semester fee is paid once, for real, in Paystack test mode);
//   SLOW=ms between actions (default 600); PAY=closed,transfer,ussd,declined,success picks the parts of group P (default all).
// Cloudflare's bot check in front of Paystack's hosted checkout lets an automated browser through its first checkout visit only;
// a full regression therefore runs P's card parts in separate launches, e.g. FRESH=1 RUN=501:
//   ONLY=S,F,A,P PAY=closed,transfer,ussd · then ONLY=P PAY=declined · then ONLY=P,R,C,V,M PAY=success.
// Two-step secrets of staff who set up during the run (Mrs Ade) stay in memory only; her setup screens are never screenshotted.
// Groups: S set-up (courses, Lagos centre, the window) · A before paying (P-01, R-01, R-08) · P pay (P-02 … P-11, Paystack test
// checkout: Declined, closed, transfer, USSD, Success) · R register (R-02 … R-05, /verify) · C course change (R-09, A-03c) ·
// V staff and provider views (A-01, A-07, A-07b, A-05, A-06, console Payments card and Settlement) · M phone size (390 × 844).
// Re-runnable: each group finds the state it needs (paid, registered, a change approved) and only does what is still to do.
// Paid twice (E-07) and reversed (E-08) cannot be produced in Paystack test mode: PaymentsJourneyTest covers them.
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

const IP = "62.169.21.189";
const CONSOLE = "https://odel-console-dev.oyeksglobal.com";
const WESLEY = "https://wesley.odel-dev.oyeksglobal.com";
const BASE = "odel-dev.oyeksglobal.com";
// The provider admin's authenticator secret is never in the repo: pass it in ODEL_E2E_PROVIDER_TOTP.
const CHUKA = { email: "chuka.obi@oyeksglobal.com", secret: process.env.ODEL_E2E_PROVIDER_TOTP ?? "" };
if (!CHUKA.secret) { console.error("Set ODEL_E2E_PROVIDER_TOTP to the provider admin's authenticator secret."); process.exit(2); }
const NGOZI_SECRET = process.env.ODEL_E2E_ADMIN_TOTP ?? "";
if (!NGOZI_SECRET) { console.error("Set ODEL_E2E_ADMIN_TOTP to Ngozi Adebayo's authenticator secret."); process.exit(2); }
const ADEOLA_PASSWORD = process.env.ODEL_E2E_STUDENT_PASSWORD ?? "";
if (!ADEOLA_PASSWORD) { console.error("Set ODEL_E2E_STUDENT_PASSWORD to Adeola Okafor's portal password."); process.exit(2); }
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

// ---- the dev email log (read with curl: this Mac's DNS cannot resolve the dev hosts). Only a signed-in platform admin may read it,
// so the script keeps its own console session for Chuka in a cookie jar (dev Google stand-in, then his two-step code). ----
const MAIL_JAR = `${tmpdir()}/odel-walkthrough-mail-${process.pid}.jar`;
let mailSignedIn = false;
function curl(args) {
  return execFileSync("curl", ["-s", "--resolve", `odel-console-dev.oyeksglobal.com:443:${IP}`, "-b", MAIL_JAR, "-c", MAIL_JAR, ...args]).toString();
}
async function mailSignIn() {
  const start = curl(["-o", "/dev/null", "-w", "%{redirect_url}", `${CONSOLE}/api/v1/auth/google/start?returnTo=%2F`]);
  const state = start.slice(start.indexOf("state=") + 6);
  const handoff = curl(["-o", "/dev/null", "-w", "%{redirect_url}", "--data-urlencode", `state=${state}`, "--data-urlencode", `email=${CHUKA.email}`, `${CONSOLE}/api/v1/auth/dev/google`]);
  curl(["-o", "/dev/null", handoff]);
  curl(["-o", "/dev/null", `${CONSOLE}/api/v1/public/context`]);
  const xsrf = (readFileSync(MAIL_JAR, "utf8").split("\n").find((l) => l.includes("\tXSRF-TOKEN\t")) ?? "").split("\t").pop();
  const ok = curl(["-o", "/dev/null", "-w", "%{http_code}", "-H", "Content-Type: application/json", "-H", `X-XSRF-TOKEN: ${xsrf}`,
    "-d", JSON.stringify({ code: await code(CHUKA.secret), trust: false }), `${CONSOLE}/api/v1/auth/mfa/verify`]);
  if (ok !== "200") throw new Error(`the dev email log sign-in failed (${ok})`);
  mailSignedIn = true;
}
async function emails(to) {
  if (!mailSignedIn) await mailSignIn();
  let out = curl(["-w", "\n%{http_code}", `${CONSOLE}/api/v1/dev/emails?to=${encodeURIComponent(to)}`]);
  if (out.endsWith("\n401") || out.endsWith("\n403")) { mailSignedIn = false; await mailSignIn(); out = curl(["-w", "\n%{http_code}", `${CONSOLE}/api/v1/dev/emails?to=${encodeURIComponent(to)}`]); }
  const body = out.slice(0, out.lastIndexOf("\n"));
  return JSON.parse(body).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
}
const seenMail = new Set();
/** The newest email to `to` sent after `after` (ms) that matches `test` and was not used before; waits up to 60 seconds. */
async function waitEmail(to, after, test = () => true, { timeout = 60_000, settled = false } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    // settled: wait until the email job has decided (SENT / SKIPPED / FAILED), not while it is still QUEUED.
    const m = (await emails(to)).find((e) => Date.parse(e.created_at) >= after - 5000 && !seenMail.has(to + e.created_at) && test(e) && (!settled || e.status !== "QUEUED"));
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
  ["GET", /\/api\/v1\/payments\/fees\/current$/, ["id", "semesterId", "label", "amount", "amountLabel", "status", "statusLabel", "message", "locked", "methods", "ussdBanks", "actions", "charge.fee", "charge.charge", "charge.total", "charge.totalLabel"]],
  ["POST", /\/api\/v1\/payments$/, ["id", "reference", "method", "amount", "amountLabel", "status", "statusLabel", "startedAt", "charge.totalLabel"]],
  ["GET", /\/api\/v1\/payments\/mine$/, ["items", "items.0.id", "items.0.reference", "items.0.status", "items.0.statusLabel", "items.0.methodLabel"]],
  ["GET", /\/api\/v1\/payments\/return\?/, ["id", "reference", "status", "statusLabel", "label"]],
  ["POST", /\/api\/v1\/payments\/[0-9a-f-]{36}\/(check|sent|cancel)$/, ["id", "reference", "status", "statusLabel"]],
  ["GET", /\/api\/v1\/registration\/me$/, ["student.matricNumber", "semester.label", "window.state", "fee.status", "canRegister", "limits.minUnits", "limits.maxUnits", "limits.maxElectives"]],
  ["GET", /\/api\/v1\/registration\/me\/courses(\?|$)/, ["semester", "limits", "compulsory", "carryOvers", "electives", "lockedUnits", "lockedCourses", "subtitle"]],
  ["POST", /\/api\/v1\/registration\/me\/check$/, ["totalUnits", "courseCount", "electiveCount", "ok", "problems", "counter"]],
  ["POST", /\/api\/v1\/registration\/me\/submit$/, ["id", "slipNumber", "slipVersion", "verificationCode", "courses", "courseCount", "totalUnits"]],
  ["GET", /\/api\/v1\/registration\/requests(\?|$)/, ["items", "total", "counts.late", "counts.change"]],
  ["GET", /\/api\/v1\/registration\/report(\?|$)/, ["semester", "window", "subtitle", "cards.registered", "items", "total", "feeStatusKnown"]],
  ["GET", /\/api\/v1\/fees\/payments\/summary/, ["semester.label", "amount", "paid.count", "confirming.count", "notPaid.count", "refunds.count", "reversed.count", "students"]],
  ["GET", /\/api\/v1\/fees\/payments(\?|$)/, ["items", "total", "items.0.fullName", "items.0.matricNumber", "items.0.status", "items.0.statusLabel"]],
  ["GET", /\/api\/v1\/platform\/payments\/settlement/, ["from", "to", "totals.payments", "totals.gross", "totals.provider", "totals.centre", "totals.gatewayFees", "totals.providerNet", "universities", "items"]],
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
    if (!u.hostname.endsWith("oyeksglobal.com") || !u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/v1/dev/")) return;
    // (The sign-in handoff's one-time code, exchanged at once on a redirect like OAuth's, is the one allowed code in a URL.)
    if (u.pathname !== "/api/v1/auth/handoff" && /(^|[?&])(code|password|token|activationToken|resetToken)=/i.test(u.search)) calls.push({ who, problem: `a secret in the URL: ${u.pathname}${u.search}` });
    if (req.method() !== "GET" && ["fetch", "xhr"].includes(req.resourceType()) && !req.headers()["x-xsrf-token"]) calls.push({ who, problem: `${req.method()} ${u.pathname} has no CSRF header` });
  });
  ctx.on("response", (res) => {
    const req = res.request(); const u = new URL(res.url());
    if (!u.hostname.endsWith("oyeksglobal.com") || !u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/v1/dev/")) return;
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
    const allowed = allow.includes(c.status) || allow.some((x) => x instanceof RegExp && x.test(`${c.status} ${c.method} ${c.path}`));
    if (c.status >= 500 && !allowed) { out.push(`${c.method} ${c.path} answered ${c.status}`); continue; }
    if (neg || allow.includes(c.status) || allow.some((x) => x instanceof RegExp && x.test(`${c.status} ${c.method} ${c.path}`))) continue;
    out.push(`${c.method} ${c.path} answered ${c.status}`);
  }
  const writes = calls.filter((c) => c.status && c.method !== "GET").map((c) => `${c.method} ${c.path}`);
  const dup = [...new Set(writes.filter((w, i) => writes.indexOf(w) !== i))];
  return { out: [...new Set(out)], dup };
}

// ---- checkpoint screenshots (viewport only), numbered in run order, in a fresh folder for this run ----
const SHOTS = `${homedir()}/Desktop/ODeL test screenshots/B2 end to end (${new Date().toISOString().slice(0, 10)})${ONLY.length ? ` - only ${ONLY.join(",")}` : ""}`;
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
  } else if (who === "student") { // on a phone the student's Sign out is under More
    await p.goto(`${UNI}/more`); await p.getByRole("button", { name: "Sign out" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Sign out" }).click(); await p.waitForURL(/sign-in/);
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

// ---- Wesley and the people of the story ----
const UNI = WESLEY;
const DOMAIN = "wesleyuni.edu.ng";
const NGOZI = { name: "Ngozi Adebayo", email: `ngozi.adebayo@${DOMAIN}` };
const ADMIN = { key: "admin", pick: NGOZI.email, secret: () => NGOZI_SECRET, trust: true };
const ADE = { key: "ade", name: "Mrs Bisi Ade", email: `b.ade@${DOMAIN}`, pick: `b.ade@${DOMAIN}`, secret: () => adeSecret, trust: false };
let adeSecret = null; // read from her two-step setup screen at run time, kept in memory only
const RUN = process.env.RUN ?? String(100 + (Math.floor(Date.now() / 60000) % 900));
const FRESH = process.env.FRESH === "1";
const FRESH_NAMES = [["Kelechi", "Ibekwe"], ["Folake", "Adeyemi"], ["Musa", "Danladi"], ["Ifeoma", "Chukwu"], ["Tolu", "Bankole"], ["Halima", "Sani"], ["Chinedu", "Okoro"]];
const [fFirst, fSur] = FRESH_NAMES[Number(RUN) % FRESH_NAMES.length];
// The story student: Adeola Okafor, or (FRESH=1) a new student of this run at Akure, B.Sc. Computer Science 200L.
const STU = FRESH
  ? { matric: `WU/ODL/24/8${RUN}`, first: fFirst, surname: fSur, name: `${fFirst} ${fSur}`, email: `${fFirst.toLowerCase()}.${fSur.toLowerCase()}${RUN}@wesley.test`, password: `Wesley${RUN}pay` }
  : { matric: "WU/ODL/24/0153", first: "Adeola", surname: "Okafor", name: "Adeola Okafor", email: "adeola.okafor@wesley.test", password: ADEOLA_PASSWORD };
const SEM1 = "2026/2027 · 1st semester";
const found = {};
const enc = encodeURIComponent;
const lagosDay = (offset = 0) => new Date(Date.now() + 3600_000 + offset * 86400_000).toISOString().slice(0, 10); // Africa/Lagos is UTC+1

async function consoleIn() {
  await desk(); await c.goto(CONSOLE);
  if (/sign-in/.test(c.url())) { // the console session may have ended after 30 idle minutes
    await google(c, "Chuka Obi"); await c.getByText("Enter your 6-digit code").waitFor();
    await typeCode(c, await code(CHUKA.secret)); await c.getByRole("button", { name: "Verify" }).click(); await c.getByText(/Wesley University/).first().waitFor();
  }
}
async function asAdmin() {
  if (who === "admin") return;
  await step(a, "Ngozi Adebayo (ODeL admin) signs in: Google, then her two-step code", () => staffIn(ADMIN));
}
const W = (path) => apiGet(a, `/api/v1${path}`);
async function onWesley() { if (!p.url().startsWith(UNI) || /sign-in/.test(p.url())) await p.goto(`${UNI}/staff`); }
async function dialogOk(page, name) {
  await page.waitForTimeout(400);
  let lay = await layoutProblems(page).catch(() => []);
  for (let t = 0; t < 5 && lay.some((x) => x.startsWith("LOADING")); t++) { await page.waitForTimeout(1000); lay = await layoutProblems(page).catch(() => []); }
  lay = lay.map((x) => (x.startsWith("LOADING") ? `"Loading…" still shows after 5 seconds ${x.slice(8)}` : x));
  if (lay.length) throw new Error(`Layout: ${lay.join(" | ")}`);
  await shot(page, `Dialog - ${name}`);
}
/** Text of the main area, whitespace folded. */
const mainText = async (page = p) => (await page.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ");
async function expectText(re, where = "main") {
  const t = where === "main" ? await mainText() : (await p.locator("body").innerText()).replace(/\s+/g, " ");
  if (!re.test(t)) throw new Error(`the page does not say ${re}: "${t.slice(0, 400)}"`);
}
async function noText(re) { const t = await mainText(); if (re.test(t)) throw new Error(`the page should not say ${re}: "${t.match(re)[0]}"`); }

// ---- the student ----
const pw = (label) => s.getByLabel(label, { exact: true });
async function studentSignIn(matric, password) {
  await s.getByLabel("Matric number or email").fill(matric); await pw("Password").fill(password); await s.getByRole("button", { name: "Sign in" }).click();
}
async function studentIn() {
  if (who === "student") return;
  await leave(); await s.goto(`${UNI}/sign-in`); await studentSignIn(STU.matric, STU.password);
  await s.waitForURL((u) => !u.pathname.startsWith("/sign-in")); await s.getByRole("heading", { name: /Your semester|Your courses appear/ }).first().waitFor();
  who = "student";
}
async function asStudent(title = `${STU.name} (${STU.matric}) signs in with matric number and password`) {
  if (who === "student") return;
  await step(s, title, async () => { await desk(); await studentIn(); });
}
const studentApi = (path) => apiGet(s, `/api/v1${path}`);
async function feeNow() { return (await studentApi("/payments/fees/current")).body; }
async function regNow() { return (await studentApi("/registration/me")).body; }

// ---- Mrs Ade (Akure coordinator): her first sign-in sets up two-step; the secret lives only in this run's memory ----
async function adeSetsUp() {
  await leave(); await desk(); await b.goto(`${UNI}/staff/sign-in`); await google(b, ADE.email); await b.getByText("1. Scan with your authenticator app").waitFor();
  adeSecret = (await b.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  await typeCode(b, await code(adeSecret)); await b.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await b.getByRole("button", { name: /saved them/ }).click(); await b.waitForURL(/\/staff/); who = "ade";
}
async function asAde() {
  if (who === "ade") return;
  if (adeSecret) { await step(b, "Mrs Bisi Ade (Akure coordinator) signs in with her two-step code", () => staffIn(ADE)); return; }
  await asAdmin();
  await onWesley();
  const ade = (await W(`/people?search=${enc(ADE.email)}`)).body.items[0];
  if (!ade) throw new Error("Mrs Bisi Ade is not in People & roles");
  if (ade.twoStepSetUp) {
    // She set it up in an earlier run and that secret is never stored: Ngozi resets it, as she would for a lost phone.
    await step(a, "Ngozi resets Mrs Ade's two-step sign-in (set up in an earlier run; its secret is never stored)", async () => {
      await a.goto(`${UNI}/staff/people?search=${enc(ADE.email)}`); await a.getByRole("button", { name: ADE.name }).first().click();
      const sheet = a.getByRole("dialog", { name: ADE.name }); await sheet.getByRole("button", { name: "Reset two-step sign-in" }).click();
      const dlg = a.getByRole("dialog", { name: /Reset Mrs Bisi Ade’s two-step sign-in/ });
      await dlg.getByLabel("Reason (kept in the audit log)").fill("New phone"); await dlg.getByRole("button", { name: "Reset two-step sign-in" }).click();
      await a.getByText(/Reset Mrs Bisi Ade’s two-step sign-in/).first().waitFor(); await a.keyboard.press("Escape");
    });
  }
  await step(b, "Ngozi signs out; Mrs Bisi Ade signs in for the first time and sets up two-step sign-in", adeSetsUp);
}

/** A download from a link or button: its file name, size, and the first bytes. */
async function download(page, locator) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), locator.click()]);
  const path = await d.path(); const buf = readFileSync(path);
  return { name: d.suggestedFilename(), size: buf.length, head: buf.subarray(0, 5).toString(), buf };
}
/** The text drawn in a PDF: every content stream inflated, the strings of its Tj / TJ operators joined. */
function pdfText(buf) {
  const raw = buf.toString("latin1"); const out = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length; const end = raw.indexOf("endstream", start); if (end < 0) continue;
    let body = buf.subarray(start, end);
    try { body = inflateSync(body); } catch { /* not compressed */ }
    const t = body.toString("latin1");
    for (const x of t.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
      const src = x[1] !== undefined ? [...x[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((y) => y[1]).join("") : x[2];
      out.push(src.replace(/\\([()\\])/g, "$1"));
    }
  }
  return out.join(" ").replace(/\s+/g, " ");
}

// ================================================================== S · set-up Wesley needs (as Mrs Adebayo, staff web)
// B.Sc. Computer Science 200L, 1st semester: 5 compulsory courses (13 units) and 3 electives; CSC 209 + MTH 211 make 7 courses,
// 18 units; MTH 211 ↔ STA 201 is the course change; all three electives make 21 (over 20); none makes 13 (under 15).
const COURSES = [
  ["CSC 201", "Data Structures", 3, "compulsory"],
  ["CSC 203", "Discrete Structures", 3, "compulsory"],
  ["CSC 205", "Computer Architecture and Organisation", 3, "compulsory"],
  ["MTH 201", "Mathematical Methods I", 2, "compulsory"],
  ["GST 201", "Nigerian Peoples and Culture", 2, "compulsory"],
  ["CSC 209", "Web Technologies", 2, "elective"],
  ["MTH 211", "Linear Algebra I", 3, "elective"],
  ["STA 201", "Probability I", 3, "elective"],
];
async function courseExists(codeStr) {
  const r = await W(`/academic/courses?search=${enc(codeStr)}&size=50`);
  return (r.body?.items ?? []).find((x) => x.code === codeStr) ?? null;
}
async function cscCode() {
  if (found.csc) return found.csc;
  const st = (await W("/academic/structure")).body;
  for (const f of st.faculties ?? []) for (const d of f.departments ?? []) for (const pr of d.programmes ?? []) if (/^B\.Sc\. Computer Science$/.test(pr.name)) { found.csc = pr.code; found.cscId = pr.id; }
  if (!found.csc) throw new Error("no B.Sc. Computer Science programme");
  return found.csc;
}
await group("S", "Set-up: the 200L first-semester courses of B.Sc. Computer Science and a Lagos centre (Mrs Adebayo, staff web)", async () => {
  await asAdmin();
  let missing = [];
  await step(a, "Course catalogue: which 200L first-semester courses B.Sc. Computer Science still needs", async () => {
    await a.goto(`${UNI}/staff/courses?programmeId=&level=200&semester=1`); await a.getByRole("heading", { name: "Course catalogue" }).first().waitFor();
    await cscCode();
    for (const [cc] of COURSES) if (!(await courseExists(cc))) missing.push(cc);
    console.log(`      missing: ${missing.join(", ") || "none"}`);
  });
  const viaCsv = missing.filter((cc) => cc !== "STA 201");
  if (viaCsv.length) {
    const imp = a.getByRole("dialog", { name: "Import the course catalogue" });
    await step(a, `Import the missing courses from a CSV (${viaCsv.join(", ")})`, async () => {
      await a.getByRole("button", { name: "Import CSV" }).click(); await dialogOk(a, "Import the course catalogue");
      const rows = COURSES.filter(([cc]) => viaCsv.includes(cc)).map(([cc, t, u, k]) => `${cc},${t},${u},200,1,${found.csc},${k}`);
      await imp.getByLabel("Choose a CSV file").setInputFiles(csvFile(`wesley_200L_first_semester.csv`, ["code,title,units,level,semester,programme_code,kind", ...rows]));
      await imp.getByText("Every row is ready").waitFor(); await imp.getByText(new RegExp(`${viaCsv.length} ready`)).waitFor();
      await shot(a, "Catalogue CSV checked - every row ready");
      await imp.getByRole("button", { name: "Import", exact: true }).click(); await imp.getByText(/Added \d+ courses? to the catalogue/).waitFor();
      await imp.getByRole("button", { name: "Done" }).click();
    });
  }
  if (missing.includes("STA 201")) await step(a, "Add STA 201 · Probability I by hand: 3 units, 200L, first semester, an elective in B.Sc. Computer Science", async () => {
    await a.getByRole("button", { name: "Add course" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a course" }); await dialogOk(a, "Add a course");
    await dlg.getByLabel("Code").fill("STA 201"); await dlg.getByLabel("Units").fill("3"); await dlg.getByLabel("Title").fill("Probability I");
    await dlg.getByLabel("Level").selectOption("200"); await dlg.getByLabel("Semester").selectOption("1");
    await dlg.getByRole("button", { name: "Offered to" }).click(); await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
    await dlg.getByLabel("Core or elective in B.Sc. Computer Science").selectOption("ELECTIVE");
    await dialogOk(a, "Add a course - STA 201 as an elective");
    await dlg.getByRole("button", { name: "Add course" }).click(); await a.getByText("Added STA 201 · Probability I.").waitFor();
  });
  await step(a, "Every course is in the catalogue, offered to B.Sc. Computer Science as core or elective", async () => {
    await a.goto(`${UNI}/staff/courses?level=200&semester=1`); await a.getByRole("heading", { name: "Course catalogue" }).first().waitFor();
    for (const [cc, , units, kind] of COURSES) {
      const x = await courseExists(cc); if (!x) throw new Error(`${cc} is missing`);
      const o = x.offeredTo.find((y) => y.programmeCode === found.csc || /Computer Science/.test(y.programmeName));
      if (!o) throw new Error(`${cc} is not offered to B.Sc. Computer Science`);
      if (x.units !== units || x.level !== 200 || x.semester !== 1) throw new Error(`${cc} is ${x.units} units, ${x.level}L, semester ${x.semester}`);
      if ((o.kind === "ELECTIVE") !== (kind === "elective")) throw new Error(`${cc} is ${o.kind}, expected ${kind}`);
    }
  });
  let lag = null;
  await step(a, "Centres: Lagos (Ikeja) Study Centre, LAG, with Room 1 (added if missing)", async () => {
    await a.goto(`${UNI}/staff/centres`); await a.getByRole("heading", { name: /centres/i }).first().waitFor();
    lag = (await W("/academic/centres")).body.items.find((x) => x.code === "LAG") ?? null;
    if (!lag) {
      await a.getByRole("button", { name: "Add centre" }).first().click(); const dlg = a.getByRole("dialog", { name: "Add a study centre" }); await dialogOk(a, "Add a study centre");
      await dlg.getByLabel("Centre name").fill("Lagos (Ikeja) Study Centre"); await dlg.getByLabel("Code").fill("LAG");
      await dlg.getByLabel("State").selectOption("Lagos"); await dlg.getByLabel(/Phone students can call/).fill("0809 555 0144");
      await dlg.getByRole("button", { name: "Add centre" }).click(); await a.keyboard.press("Escape");
      lag = (await W("/academic/centres")).body.items.find((x) => x.code === "LAG");
    }
    const det = (await W(`/academic/centres/${lag.id}`)).body;
    if (!(det.roomsList ?? []).some((r) => r.name === "Room 1")) {
      await a.goto(`${UNI}/staff/centres?centre=${lag.id}`); const sheet = a.getByRole("dialog", { name: lag.name }); await sheet.waitFor();
      await sheet.getByRole("button", { name: "Add room" }).click(); const dlg = a.getByRole("dialog", { name: "Add a room" });
      await dlg.getByLabel("Room name").fill("Room 1"); await dlg.getByLabel("Seats").fill("40"); await dlg.getByLabel("Computers").fill("25");
      await dlg.getByRole("button", { name: "Add room" }).click(); await sheet.getByText(/40 seats · 25 computers/).first().waitFor(); await a.keyboard.press("Escape");
    }
    found.lag = lag;
  });
  await step(a, "Staffing: Mrs Ade coordinates Akure this session; Lagos has no coordinator (the ODeL office covers it)", async () => {
    await a.goto(`${UNI}/staff/academic-setup/staffing?tab=centres`); await a.getByRole("heading", { name: "Staffing" }).first().waitFor();
    const rows = a.getByRole("row");
    const akr = (await rows.filter({ hasText: "Akure" }).first().innerText()).replace(/\s+/g, " ");
    if (!/Bisi Ade/.test(akr)) throw new Error(`Akure's coordinator row: ${akr}`);
    const lagRow = (await rows.filter({ hasText: "Lagos" }).first().innerText()).replace(/\s+/g, " ");
    if (!/Needs a coordinator/.test(lagRow)) throw new Error(`Lagos's row: ${lagRow}`);
  });
});

// ================================================================== F · (FRESH=1) this run's new student: added, then activated
if (FRESH) await group("F", `This run's new student ${STU.name} (${STU.matric}): added by Mrs Adebayo, then activated`, async () => {
  await asAdmin();
  await step(a, `Add ${STU.name}: B.Sc. Computer Science 200L, Akure Study Centre`, async () => {
    await a.goto(`${UNI}/staff/students`); await a.getByRole("button", { name: "Add a student" }).click();
    const dlg = a.getByRole("dialog", { name: "Add a student" }); await dialogOk(a, "Add a student");
    await dlg.getByLabel("First name").fill(STU.first); await dlg.getByLabel("Surname").fill(STU.surname); await dlg.getByLabel("Matric number").fill(STU.matric);
    await pick(dlg.getByLabel("Programme and level"), /B\.Sc\. Computer Science · 200L/); await pick(dlg.getByLabel("Study centre"), /Akure/);
    await dlg.getByLabel("Email (for the welcome email)").fill(STU.email);
    const cb = dlg.getByLabel("Send the welcome email now"); if (await cb.isChecked()) await cb.uncheck();
    await dlg.getByRole("button", { name: "Add student" }).click(); await a.getByText(`Added ${STU.name}.`).waitFor();
  });
  let t0 = 0;
  await step(s, `${STU.first} activates the account: the code from the email log`, async () => {
    await leave(); await s.goto(`${UNI}/activate?matric=${enc(STU.matric)}`);
    t0 = Date.now(); await s.getByRole("button", { name: "Send my code" }).click(); await s.getByRole("heading", { name: "Enter the 6-digit code" }).waitFor();
    const c1 = codeIn(await waitEmail(STU.email, t0, (e) => !!codeIn(e))); await typeCode(s, c1); await s.getByRole("button", { name: "Verify" }).click();
    await s.getByRole("heading", { name: "Create a password" }).waitFor();
    await pw("New password").fill(STU.password); await pw("Confirm password").fill(STU.password); await s.getByRole("button", { name: "Continue" }).click();
    await s.getByLabel("I have read and accept the privacy notice").check(); await s.getByRole("button", { name: "Accept and continue" }).click();
    await s.getByRole("heading", { name: "Check your details" }).waitFor(); await s.getByRole("button", { name: "Save and go to my dashboard" }).click();
    await s.waitForURL((u) => u.pathname === "/"); who = "student";
  });
});

// ================================================================== A · before paying: P-01, R-01 (not open), R-08 (pay first)
async function setWindow(opens, closes, late, why) {
  await step(a, `Academic setup: 2026/2027 1st-semester registration ${why} (opens ${opens}, closes ${closes}, late registration until ${late})`, async () => {
    await a.goto(`${UNI}/staff/academic-setup/sessions`); await a.getByRole("heading", { name: "Sessions & semesters" }).first().waitFor();
    await a.getByRole("button", { name: "Edit 2026/2027" }).click();
    const sheet = a.getByRole("dialog", { name: "Edit session 2026/2027" }); await sheet.waitFor();
    const first = sheet.getByRole("group", { name: "First semester" });
    await first.getByLabel("Registration opens").fill(opens); await first.getByLabel("Registration closes", { exact: true }).fill(closes);
    await first.getByLabel("Late registration closes (optional)").fill(late);
    await dialogOk(a, "Edit session 2026-2027 - registration dates");
    await sheet.getByRole("button", { name: "Save changes" }).click(); await a.getByText(/2026\/2027 is saved/).first().waitFor();
  });
}
const OPEN = { opens: lagosDay(0), closes: lagosDay(14), late: lagosDay(21) };
await group("A", `${STU.name} before paying: Home fee card (P-01), registration not open (R-01), then pay first (R-08)`, async () => {
  await asStudent();
  const fee = await feeNow();
  if (fee.status !== "NOT_PAID") {
    await step(s, `${STU.first}'s ${SEM1} fee is already ${fee.statusLabel}: the before-paying screens were walked in an earlier run`, async () => { await s.goto(`${UNI}/`); });
    return;
  }
  await asAdmin();
  await setWindow(lagosDay(5), lagosDay(19), lagosDay(26), "not open yet");
  await asStudent();
  await step(s, `Home (P-01): Platform fee · ${SEM1} · ₦15,000 · Not paid, with Paystack's charge; registration and exams locked`, async () => {
    await s.goto(`${UNI}/`); const card = s.getByRole("region", { name: `Platform fee · ${SEM1}` }); await card.waitFor();
    const t = (await card.innerText()).replace(/\s+/g, " ");
    for (const re of [/₦15,000/, /Not paid/, /₦15,000 \+ about ₦329\.95 Paystack charge · you pay about ₦15,329\.95/, /Pay your platform fee to register your courses and sit exams\./]) if (!re.test(t)) throw new Error(`the fee card does not say ${re}: ${t}`);
    await card.getByRole("link", { name: "Pay ₦15,000", exact: true }).waitFor();
    const sem = (await s.getByRole("region", { name: /Your semester/ }).or(s.locator("section", { has: s.getByRole("heading", { name: /Your semester/ }) })).first().innerText()).replace(/\s+/g, " ");
    for (const re of [/Course registration Opens \w{3} \d+ \w{3} · locked until you pay/, /Courses and materials Available after you register/, /Exams You need to pay to take exams/]) if (!re.test(sem)) throw new Error(`Your semester does not say ${re}: ${sem}`);
  });
  await step(s, "Registration (R-01): not open yet, with the date and the advice to pay before then", async () => {
    await s.getByRole("link", { name: "Registration" }).first().click(); await s.waitForURL(/\/registration/);
    await s.getByRole("heading", { name: /Registration opens|Pay the platform fee first/ }).first().waitFor();
    await expectText(/Registration opens \w{3} \d+ \w{3} \d{4} Pay your platform fee before then so you can register on the first day\. We email you when it opens\./);
    if ((await mainText()).match(/Registration opens/g).length > 1) throw new Error("the date is said twice");
    await s.getByRole("link", { name: "Pay the platform fee" }).waitFor();
  });
  await asAdmin();
  await setWindow(OPEN.opens, OPEN.closes, OPEN.late, "open from today");
  await asStudent();
  await step(s, "Registration (R-08): pay the ₦15,000 platform fee first, with the fee card and its Pay button", async () => {
    await s.goto(`${UNI}/registration`); await s.getByRole("heading", { name: `Course registration · ${SEM1}` }).waitFor();
    await expectText(/Pay the platform fee first/); await expectText(/Pay the ₦15,000 platform fee for 2026\/2027 · 1st semester first\. Registration opens as soon as it is confirmed\./);
    await s.getByRole("region", { name: `Platform fee · ${SEM1}` }).getByRole("link", { name: "Pay ₦15,000" }).waitFor();
  });
});


// ================================================================== P · pay (P-02 … P-11) in Paystack test mode
// Paystack's hosted test checkout offers Success, Bank Authentication and Declined; it is a page of its own (full page), and the
// student comes back to /payments/return?trxref=…&reference=…. Only the verified webhook marks the fee paid.
const frames = () => [p.mainFrame(), ...p.frames()];
async function inCheckout(sel) { for (const f of frames()) { const l = f.locator(sel).first(); if (await l.count().catch(() => 0)) return l; } return null; }
const checkoutText = async () => (await Promise.all(frames().map((f) => f.locator("body").innerText().catch(() => "")))).join(" ").replace(/\s+/g, " ");
let checkoutVisits = 0;
async function onCheckout() {
  await p.waitForURL(/checkout\.paystack\.com/, { timeout: 30_000 });
  checkoutVisits += 1;
  for (let i = 0; i < 60 && !(await inCheckout('text="Success"')); i++) {
    const retry = await inCheckout('button:has-text("Retry with test details")'); if (retry) await retry.click(); // a transaction declined before
    // Cloudflare's "Performing security verification" sometimes stands in front of Paystack: wait for it to clear by itself.
    if (i === 4 && /security verification/i.test(await checkoutText())) await shot(p, "Cloudflare checks the browser in front of Paystack");
    await p.waitForTimeout(1000);
  }
  const t = await checkoutText();
  if (/security verification/i.test(t) && !/15,329\.95/.test(t)) throw new Error(`Cloudflare's bot check is still in front of Paystack's page after 60 seconds (visit ${checkoutVisits} in this browser)`);
  if (!/15,329\.95/.test(t)) throw new Error(`Paystack's page does not ask for NGN 15,329.95: ${t.slice(0, 300)}`);
}
/** Pick a test option (Success / Declined) and press Pay, as a person would; answers PIN or OTP if asked; waits to be sent back. */
async function payOnCheckout(option) {
  const o = await inCheckout(`text="${option}"`); if (!o) throw new Error(`no "${option}" option on Paystack's page`);
  await o.click(); await p.waitForTimeout(800); await shot(p, `Paystack test checkout - ${option} chosen`);
  const pay = await inCheckout('button:has-text("Pay NGN")'); if (!pay) throw new Error("no Pay button on Paystack's page"); await pay.click();
  for (let i = 0; i < 45; i++) {
    await p.waitForTimeout(2000);
    if (!/paystack\.com/.test(p.url())) return;
    const t = await checkoutText();
    const pin = await inCheckout('input[name="pin"]'); if (pin && /pin/i.test(t)) { await pin.pressSequentially("0000", { delay: 80 }); continue; }
    const otp = await inCheckout('input[name="otp"]'); if (otp && /otp/i.test(t)) { await otp.pressSequentially("123456", { delay: 80 }); continue; }
    if (option === "Declined" && /declined|not successful|failed|try again/i.test(t)) {
      if (i === 0 || i === 1) console.log(`      Paystack says: ${t.slice(0, 300)}`);
      await shot(p, "Paystack - the card was declined");
      return "declined";
    }
  }
  throw new Error(`still on Paystack's page: ${(await checkoutText()).slice(0, 300)}`);
}
/** Leave Paystack's page without paying: its close (×) button, then any confirmation. */
async function closeCheckout() {
  const x = await inCheckout('button[aria-label="Close"]');
  if (!x) throw new Error("no close (×) button on Paystack's page");
  await x.click(); await p.waitForTimeout(1500);
  if (!/paystack\.com/.test(p.url())) return; // straight back to us (after a decline)
  const cancel = await inCheckout('button:has-text("Cancel Payment")');
  if (!cancel) throw new Error(`Paystack did not offer Cancel Payment: ${(await checkoutText()).slice(0, 200)}`);
  await shot(p, "Paystack - close: Change Payment Method or Cancel Payment"); await cancel.click();
  for (let i = 0; i < 10 && /paystack\.com/.test(p.url()); i++) {
    await p.waitForTimeout(1500);
    const y = await inCheckout('button:has-text("Yes")'); if (y) { console.log(`      Paystack asks: ${(await checkoutText()).slice(0, 200)}`); await y.click(); }
  }
}
async function payPage() {
  await s.goto(`${UNI}/payments/pay`); await s.getByRole("heading", { name: /Pay your platform fee · ₦15,000/ }).waitFor();
}
/** Before a second visit to Paystack's page in one run, pause as a person reading our page would (GAP seconds, default 120). */
async function beforeCheckout() { if (checkoutVisits) await s.waitForTimeout(Number(process.env.GAP ?? 120) * 1000); }
async function chooseMethod(label) { await s.getByRole("radio", { name: new RegExp(label) }).check(); }
let paidRef = null;
await group("P", `${STU.name} pays: declined, closed, transfer and USSD shown, then a successful card payment (P-02 … P-11)`, async () => {
  await asStudent();
  const fee = await feeNow();
  if (fee.status === "NOT_PAID" && fee.openPayment?.status === "PENDING") {
    await step(s, `A payment started earlier (${fee.openPayment.reference}) is still open: Pay another way cancels it, nothing charged`, async () => {
      await s.goto(`${UNI}/payments/pay`); await s.getByText("You already started a payment").waitFor(); await shot(s, "Pay - you already started a payment");
      await s.goto(`${UNI}/payments/${fee.openPayment.id}`); await s.getByRole("button", { name: "Pay another way" }).click(); await s.waitForURL(/\/payments\/pay/);
    });
  }
  if (fee.status === "NOT_PAID") {
    await step(s, "Pay (P-02): three ways to pay; the summary shows the fee, Paystack's charge (about ₦329.95) and about ₦15,329.95", async () => {
      await s.goto(`${UNI}/`); await s.getByRole("region", { name: `Platform fee · ${SEM1}` }).getByRole("link", { name: "Pay ₦15,000" }).click();
      await s.getByRole("heading", { name: "Pay your platform fee · ₦15,000" }).waitFor();
      const sum = (await s.getByRole("complementary", { name: "Summary" }).innerText()).replace(/\s+/g, " ");
      for (const re of [/Platform fee 2026\/2027 · 1st semester/, /Fee ₦15,000/, /Paystack charge \(about\) ₦329\.95/, /You pay about ₦15,329\.95/]) if (!re.test(sum)) throw new Error(`the summary does not say ${re}: ${sum}`);
      for (const m of ["Debit card", "Bank transfer", "USSD"]) await s.getByRole("radio", { name: new RegExp(m) }).waitFor();
    });
    // Each part can be run on its own (PAY=closed,transfer,ussd,declined,success): Cloudflare's bot check in front of Paystack
    // lets an automated browser through its first visit only, so the parts may need a browser each (see the report).
    const PAY = (process.env.PAY ?? "closed,transfer,ussd,declined,success").split(",");
    const startCard = async () => {
      if (!/\/payments\/pay/.test(s.url())) await payPage();
      await chooseMethod("Debit card"); await beforeCheckout(); await s.getByRole("button", { name: "Pay ₦15,000 by card" }).click(); await onCheckout();
    };
    const backToChoice = async () => {
      if (await s.getByRole("button", { name: "Pay another way" }).count()) { await s.getByRole("button", { name: "Pay another way" }).click(); await s.waitForURL(/\/payments\/pay/); }
      else await payPage();
      await s.getByRole("heading", { name: /Pay your platform fee/ }).waitFor();
    };
    if (PAY.includes("closed")) {
      await step(s, "Debit card → Paystack's test checkout opens (full page) and asks for NGN 15,329.95", startCard);
      await step(s, "Close Paystack's page without paying (× → Cancel Payment): P-08 'You closed the payment page', nothing charged", async () => {
        await closeCheckout();
        await s.waitForURL(/\/payments\/return/, { timeout: 60_000 });
        await s.getByRole("heading", { name: "You closed the payment page" }).waitFor(); await expectText(/Nothing was charged/);
        await s.getByRole("link", { name: "Go back to the payment page" }).waitFor(); await s.getByRole("button", { name: "Pay another way" }).waitFor();
        if ((await feeNow()).status !== "NOT_PAID") throw new Error("the fee changed after closing the checkout");
      });
    }
    if (PAY.includes("transfer")) {
      await step(s, "Pay another way → Bank transfer (P-04): the one-time account asks for ₦15,329.95, with the 30-minute timer", async () => {
        await backToChoice();
        await chooseMethod("Bank transfer"); await s.getByRole("button", { name: "Get account details" }).click();
        await s.getByRole("heading", { name: "Transfer ₦15,329.95 to this account" }).waitFor({ timeout: 30_000 });
        const t = await mainText(); console.log(`      transfer: ${t.slice(0, 400)}`);
        if (!/Account number \d{10}/.test(t)) throw new Error("no 10-digit account number");
        if (!/(2[5-9]|30):\d\d|(29|30) min/.test(t)) throw new Error(`no 30-minute timer: ${t}`);
        if (/Amount ₦15,000(\.00)?\b(?!,)/.test(t)) throw new Error("the amount row says ₦15,000 alone");
      });
      await step(s, "Pay another way: the transfer is cancelled and the choice opens again", backToChoice);
    }
    if (PAY.includes("ussd")) {
      await step(s, "USSD (P-04b): only GTBank, UBA, Sterling and Zenith; another bank is pointed to card or transfer", async () => {
        if (!/\/payments\/pay/.test(s.url())) await payPage();
        await chooseMethod("USSD"); const sel = s.getByLabel("Your bank (USSD)"); await sel.waitFor();
        const opts = await sel.locator("option").allInnerTexts(); if (opts.length !== 4 || !/GTBank/.test(opts[0])) throw new Error(`banks: ${opts.join(", ")}`);
        await expectText(/Another bank\? Pay by card or transfer\./);
      });
      await step(s, "GTBank → Get my USSD code: the code to dial, reference and ₦15,329.95, with the timer", async () => {
        await pick(s.getByLabel("Your bank (USSD)"), /GTBank/); await s.getByRole("button", { name: "Get my USSD code" }).click();
        await s.getByRole("heading", { name: "Dial the code from the phone number linked to your GTBank account" }).or(s.getByText("Payment not started")).first().waitFor({ timeout: 30_000 });
        if (await s.getByText("Payment not started").count()) {
          // Paystack's test mode may refuse the USSD charge itself ("Denied by fraud system"): then the student must be told so plainly.
          const t = await mainText(); const m = t.match(/Paystack could not start this USSD payment[^.]*\. Nothing was charged\. Pay by card or bank transfer instead, or try again later\./);
          if (!m) throw new Error(`USSD was not started and the message is not the plain one: ${t.slice(0, 300)}`);
          console.log(`      NOTE: Paystack refused the USSD charge in test mode; the student is told: "${m[0]}"`);
          return;
        }
        const t = await mainText(); console.log(`      ussd: ${t.slice(0, 300)}`);
        if (!/Code to dial \*737\*[\d*]+#/.test(t)) throw new Error("no *737*…# code"); if (!/₦15,329\.95/.test(t)) throw new Error("the amount is not ₦15,329.95");
      }, { allow: [/^502 POST \/api\/v1\/payments$/] });
      if (await s.getByRole("button", { name: "Pay another way" }).count()) await step(s, "Pay another way: the USSD payment is cancelled; back to the choice", backToChoice);
    }
    if (PAY.includes("declined")) {
      await step(s, "Debit card again → Paystack: Declined, then back to our page: P-07 'Your payment did not go through', Try again", async () => {
        await startCard();
        const r = await payOnCheckout("Declined");
        if (r === "declined") await closeCheckout();
        await s.waitForURL(/\/payments\/return/, { timeout: 60_000 });
        await s.getByRole("heading", { name: "Your payment did not go through" }).waitFor({ timeout: 30_000 });
        await expectText(/Your bank declined the card\. Try another card or pay by transfer\./);
        await s.getByRole("link", { name: "Try again" }).waitFor();
        if ((await feeNow()).status !== "NOT_PAID") throw new Error("the fee changed after a declined card");
      });
    }
    if (PAY.includes("success")) {
      await step(s, "Try again → Debit card → Paystack: Success → back on our page: confirming, then Payment received (P-05, P-06)", async () => {
        if (await s.getByRole("link", { name: "Try again" }).count()) { await s.getByRole("link", { name: "Try again" }).click(); await s.waitForURL(/\/payments\/pay/); }
        await startCard();
        await payOnCheckout("Success");
        await s.waitForURL(/\/payments\/return/, { timeout: 60_000 });
        await shot(s, "Back from Paystack");
        await s.getByRole("heading", { name: "Payment received" }).waitFor({ timeout: 120_000 });
        const t = await mainText();
        for (const re of [/Amount ₦15,329\.95 \(₦15,000 fee \+ ₦329\.95 Paystack charge\)/, /For Platform fee · 2026\/2027 · 1st semester/, /Paid with /, /Reference WU-PF-\d+/]) if (!re.test(t)) throw new Error(`Payment received does not say ${re}: ${t.slice(0, 500)}`);
        paidRef = t.match(/WU-PF-\d+/)[0];
      });
    }
    if ((await feeNow()).status !== "PAID") { console.log("      (not paid yet: the paid views run once the fee is paid)"); return; }
  } else {
    await step(s, `${STU.first}'s fee is already ${fee.statusLabel} (paid in an earlier run): the paid views`, async () => { await s.goto(`${UNI}/payments`); });
    paidRef = fee.paidPayment?.reference ?? null;
  }
  await step(s, "The webhook marked the fee paid: Home says Paid with the method and reference, Register now and Receipt (P-01b)", async () => {
    await s.goto(`${UNI}/`); const card = s.getByRole("region", { name: `Platform fee · ${SEM1}` });
    await card.getByText("Paid", { exact: true }).waitFor(); const t = (await card.innerText()).replace(/\s+/g, " ");
    if (!/Paid on \w{3} \d+ \w{3} \d{4}/.test(t)) throw new Error(`no paid date: ${t}`);
    if (paidRef && !t.includes(paidRef)) throw new Error(`the card does not show ${paidRef}: ${t}`);
    const fee = await feeNow(); paidRef = fee.paidPayment.reference;
    const reg = await regNow();
    if (!reg.registration) await card.getByRole("link", { name: "Register now" }).waitFor();
    await card.getByRole("link", { name: "Receipt" }).waitFor();
  });
  await step(s, "Receipt (P-10): the crest, the student, Platform fee ₦15,000 / Paystack charge / Total paid", async () => {
    await s.getByRole("region", { name: `Platform fee · ${SEM1}` }).getByRole("link", { name: "Receipt" }).click();
    await s.getByRole("heading", { name: /Platform fee receipt · ₦15,329\.95 paid/ }).waitFor();
    const r = (await s.getByRole("article", { name: "Receipt" }).innerText()).replace(/\s+/g, " "); console.log(`      receipt: ${r.slice(0, 600)}`);
    for (const re of [/Wesley University/, /Paid on \w{3} \d+ \w{3} \d{4}, \d/, new RegExp(STU.name), new RegExp(STU.matric.replaceAll("/", "\\/")), /B\.Sc\. Computer Science/, /2026\/2027/, /1st semester/, /₦15,000/, /₦329\.95/, /₦15,329\.95/, new RegExp(paidRef)]) if (!re.test(r)) throw new Error(`the receipt does not say ${re}`);
    if (!(await s.getByRole("article", { name: "Receipt" }).locator("img").first().evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false))) throw new Error("the crest is not shown on the receipt");
  });
  await step(s, `Download PDF gives receipt-${paidRef ?? "WU-PF-…"}.pdf with the fee, the charge and the total`, async () => {
    const d = await download(s, s.getByRole("link", { name: "Download PDF" }).or(s.getByRole("button", { name: "Download PDF" })).first());
    if (d.name !== `receipt-${paidRef}.pdf` || d.head !== "%PDF-") throw new Error(`downloaded ${d.name} (${d.head})`);
    const t = pdfText(d.buf); console.log(`      PDF: ${d.size} bytes; text: ${t.slice(0, 500)}`);
    for (const re of [/Platform fee receipt · NGN 15,329\.95 paid/, /15,000\.00/, /329\.95/, /15,329\.95/, new RegExp(paidRef)]) if (t.length > 50 && !re.test(t)) throw new Error(`the PDF does not say ${re}`);
  });
  await step(s, "Payments (P-11): every attempt, newest first; the paid one shows the total paid", async () => {
    await s.goto(`${UNI}/payments`); await s.getByRole("heading", { name: "Payments", exact: true }).waitFor();
    const mine = (await studentApi("/payments/mine")).body.items;
    console.log(`      attempts: ${mine.map((x) => `${x.reference} ${x.method} ${x.status}`).join(" · ")}`);
    const t = await mainText();
    if (!t.includes(paidRef)) throw new Error("the paid payment is not listed");
    if (!/₦15,329\.95 · 2026\/2027 · 1st semester/.test(t)) throw new Error("the paid row does not show the total paid");
  });
  await step(s, "Negative - typing /payments/pay again goes to Payments: a paid fee is never offered a second payment", async () => {
    await s.goto(`${UNI}/payments/pay`); await s.waitForURL(/\/payments$/);
  });
  await step(s, "The receipt email went out with the PDF attached (dev email log)", async () => {
    const m = (await emails(STU.email)).find((e) => /receipt/i.test(e.subject + e.body) && (e.body + e.subject).includes(paidRef));
    if (!m) throw new Error("no receipt email for this payment");
    console.log(`      email: "${m.subject}" · ${m.status} · attachments: ${String(m.attachments).slice(0, 120)}`);
    if (!/receipt-WU-PF-\d+\.pdf|\.pdf/.test(String(m.attachments))) throw new Error("the receipt email has no PDF attached");
  });
});


// ================================================================== R · register (R-02 … R-05, /verify)
const box = (cc) => s.getByRole("checkbox", { name: new RegExp(cc) });
const counter = () => s.getByRole("complementary", { name: "Your registration" });
async function counterSays(re) {
  await s.waitForTimeout(800);
  for (let i = 0; i < 20; i++) { const t = (await counter().innerText()).replace(/\s+/g, " "); if (re.test(t)) return t; await s.waitForTimeout(500); }
  throw new Error(`the counter does not say ${re}: ${(await counter().innerText()).replace(/\s+/g, " ")}`);
}
let slip = null;
await group("R", `${STU.name} registers 7 courses, 18 units (R-02 … R-05); the slip and /verify`, async () => {
  await asStudent();
  let reg = await regNow();
  if (!reg.registration) {
    if (!reg.canRegister) throw new Error(`registration is blocked: ${reg.blocked?.code} ${reg.blocked?.message}`);
    await step(s, "Register (R-02): Step 1 of 2; the five compulsory courses ticked and locked; electives to choose (up to 3)", async () => {
      await s.goto(`${UNI}/registration`); await s.getByRole("heading", { name: "Register first semester courses" }).waitFor();
      await expectText(/Step 1 of 2 · B\.Sc\. Computer Science · 200L · closes \w{3} \d+ \w{3}/);
      const locked = (await s.getByRole("region", { name: "Already included · cannot be removed" }).innerText()).replace(/\s+/g, " ");
      for (const cc of ["CSC 201", "CSC 203", "CSC 205", "MTH 201", "GST 201"]) if (!locked.includes(cc)) throw new Error(`${cc} is not among the locked courses: ${locked}`);
      await s.getByRole("heading", { name: "Electives · choose up to 3" }).waitFor();
      for (const cc of ["CSC 209", "MTH 211", "STA 201"]) await box(cc).waitFor();
      await counterSays(/13 · min 15 · max 20/);
    });
    await step(s, "Tick CSC 209 and MTH 211: the live counter reads 18 · min 15 · max 20, 7 courses", async () => {
      await box("CSC 209").check(); await box("MTH 211").check();
      const t = await counterSays(/18 · min 15 · max 20/); if (!/Courses 7/.test(t)) throw new Error(`not 7 courses: ${t}`);
      if (await s.getByRole("button", { name: "Review registration" }).isDisabled()) throw new Error("Review registration is off at 18 units");
    });
    await step(s, "Negative - a third elective (STA 201) makes 21: over the maximum, in red, and Review is off (R-03)", async () => {
      await box("STA 201").check(); await counterSays(/That is 21 units\. The most you can take is 20: remove an elective\./);
      if (!(await s.getByRole("button", { name: "Review registration" }).isDisabled())) throw new Error("Review registration is still on at 21 units");
    });
    await step(s, "Negative - no electives at all: 13 units, under the minimum of 15 (R-03b)", async () => {
      for (const cc of ["STA 201", "MTH 211", "CSC 209"]) await box(cc).uncheck();
      await counterSays(/That is 13 units, 2 (units )?under the minimum of 15\. Add an elective\./);
      if (!(await s.getByRole("button", { name: "Review registration" }).isDisabled())) throw new Error("Review registration is on at 13 units");
    });
    await step(s, "CSC 209 and MTH 211 again → Review registration (R-04): every course, Core or Elective, 7 courses · 18 units", async () => {
      await box("CSC 209").check(); await box("MTH 211").check(); await counterSays(/18 · min 15 · max 20/);
      await s.getByRole("button", { name: "Review registration" }).click(); await s.getByRole("heading", { name: "Review your registration" }).waitFor();
      await expectText(/Step 2 of 2/); await expectText(/Total 7 courses · 18 units/);
      for (const cc of ["CSC 201", "CSC 203", "CSC 205", "MTH 201", "GST 201", "CSC 209", "MTH 211"]) await expectText(new RegExp(cc));
    });
    await step(s, "Negative - Submit without the tick: 'Tick the box to confirm these are your courses.'", async () => {
      await s.getByRole("button", { name: "Submit registration" }).click(); await s.getByText("Tick the box to confirm these are your courses.").waitFor();
    });
    await step(s, "Tick 'These are my courses for 2026/2027 · 1st semester.' and submit: You are registered (R-05b)", async () => {
      await s.getByLabel(`These are my courses for ${SEM1}.`).check(); await s.getByRole("button", { name: "Submit registration" }).click();
      await s.getByText("You are registered").first().waitFor({ timeout: 30_000 });
      await s.getByRole("heading", { name: "Registered · 7 courses · 18 units" }).waitFor();
    });
  }
  reg = await regNow();
  await step(s, "Registered: slip number, verification code, Download slip (PDF), Request a course change and its deadline", async () => {
    await s.goto(`${UNI}/registration`); await s.getByRole("heading", { name: /^Registered · \d+ courses · \d+ units$/ }).waitFor();
    const full = (await studentApi(`/registration/me/registrations/${reg.registration.id}`)).body; slip = full;
    console.log(`      slip ${full.slipNumber} v${full.slipVersion} · code ${full.verificationCode} · ${full.courseCount} courses · ${full.totalUnits} units · ${full.courses.map((x) => x.code).join(", ")}`);
    if (!/^REG-26-1-0153(-\d+)?$/.test(full.slipNumber) && !FRESH) throw new Error(`slip number ${full.slipNumber}`);
    await expectText(new RegExp(`Slip ${full.slipNumber}`)); await expectText(new RegExp(`Verification code ${full.verificationCode}`));
    await s.getByRole("link", { name: "Download slip (PDF)" }).waitFor();
    if (full.slipVersion === 1) await noText(/ · updated /);
    if (full.canRequestChange) await expectText(/Course changes are open until \w{3} \d+ \w{3} \d{4}/);
  });
  await step(s, `Download slip (PDF) (R-05): ${STU.first}'s slip with the courses, the total and the verification line`, async () => {
    const d = await download(s, s.getByRole("link", { name: "Download slip (PDF)" }));
    if (d.name !== `${slip.slipNumber}.pdf` || d.head !== "%PDF-") throw new Error(`downloaded ${d.name} (${d.head})`);
    const t = pdfText(d.buf); console.log(`      PDF: ${d.size} bytes; text: ${t.slice(0, 400)}`);
    for (const re of [new RegExp(slip.slipNumber), /Course registration slip/i, new RegExp(slip.verificationCode), /CSC 201/]) if (t.length > 50 && !re.test(t)) throw new Error(`the slip PDF does not say ${re}`);
  });
  await step(s, "/verify (public) with the slip's code: Valid slip with the student, programme, semester and units", async () => {
    await s.getByRole("link", { name: "/verify" }).click(); await s.waitForURL(/\/verify/);
    await s.getByText(`Valid slip · ${slip.slipNumber}`).waitFor();
    const t = (await s.locator("body").innerText()).replace(/\s+/g, " ");
    for (const re of [new RegExp(STU.name), /B\.Sc\. Computer Science · 200L/, /2026\/2027 · 1st semester/, new RegExp(`${slip.totalUnits}`)]) if (!re.test(t)) throw new Error(`/verify does not say ${re}`);
  });
  await step(s, "Negative - /verify with a wrong code: 'We could not find a slip with this code. Check the code on the slip.'", async () => {
    await s.getByLabel("Verification code").fill("ZZZZ-0000"); await s.getByRole("button", { name: /Check/ }).click();
    await s.getByText("We could not find a slip with this code. Check the code on the slip.").waitFor();
  }, { allow: [404] });
  await step(s, "Negative - submitting again (another tab): 'You have already registered for this semester. Ask for a course change instead.'", async () => {
    await s.goto(`${UNI}/registration`);
    const r = await s.evaluate(async (sem) => {
      const x = decodeURIComponent((document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/) ?? [])[1] ?? "");
      const res = await fetch("/api/v1/registration/me/submit", { method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": x }, body: JSON.stringify({ semesterId: sem, electiveIds: [], confirm: true }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, slip.semester.id);
    if (r.status !== 409 || r.body?.message !== "You have already registered for this semester. Ask for a course change instead.") throw new Error(`answered ${r.status} ${JSON.stringify(r.body)}`);
  });
  await step(s, "The confirmation email went out with the slip link (dev email log)", async () => {
    const m = (await emails(STU.email)).find((e) => (e.subject + e.body).includes(slip.slipNumber));
    if (!m) throw new Error("no registration email with the slip number");
    console.log(`      email: "${m.subject}" · ${m.status}`);
  });
});


// ================================================================== C · course change (R-09 … R-09d) and the coordinator's approval (A-03, A-03c)
await group("C", `${STU.name} asks to swap an elective (R-09); the centre's coordinator approves it (A-03c); a new slip (R-09d)`, async () => {
  await asStudent();
  const me = await regNow();
  if (!me.registration) throw new Error("not registered yet (group R first)");
  const regFull = (await studentApi(`/registration/me/registrations/${me.registration.id}`)).body;
  const courses = (await studentApi(`/registration/me/courses?semesterId=${me.semester.id}`)).body;
  const mine = regFull.courses.filter((x) => x.kind === "ELECTIVE").map((x) => x.code);
  const drop = mine.find((cc) => cc !== "CSC 209" && courses.electives.find((e) => e.code === cc)?.units === 3);
  const add = courses.electives.find((e) => !mine.includes(e.code) && e.units === 3)?.code;
  if (!drop || !add) throw new Error(`no 3-unit swap possible: registered electives ${mine.join(", ")}`);
  const before = regFull.slipVersion;
  let pending = me.changeRequest?.status === "PENDING" ? me.changeRequest : null;
  if (!pending) {
    await step(s, `Request a course change (R-09): compulsory courses stay; untick ${drop}, tick ${add}: Drop ${drop}, add ${add} · 18 · min 15 · max 20`, async () => {
      await s.goto(`${UNI}/registration`); await s.getByRole("link", { name: "Request a course change" }).click();
      await s.getByRole("heading", { name: "Ask to change your courses" }).waitFor();
      const stay = (await s.getByRole("region", { name: "Staying · cannot be dropped" }).innerText()).replace(/\s+/g, " ");
      for (const cc of ["CSC 201", "CSC 203", "CSC 205", "MTH 201", "GST 201"]) if (!stay.includes(cc)) throw new Error(`${cc} is not listed as staying`);
      await box(drop).uncheck(); await box(add).check();
      const aside = s.getByRole("complementary", { name: "After the change" });
      await aside.getByText(`Drop ${drop}, add ${add}`).waitFor();
      for (let i = 0; i < 20 && !/18 · min 15 · max 20/.test(await aside.innerText()); i++) await s.waitForTimeout(500);
      if (!/18 · min 15 · max 20/.test(await aside.innerText())) throw new Error(`the counter: ${(await aside.innerText()).replace(/\s+/g, " ")}`);
    });
    await step(s, "Negative - a reason under 10 characters keeps Send for approval off", async () => {
      await s.getByLabel("Why do you want this change?").fill("Clash");
      if (!(await s.getByRole("button", { name: "Send for approval" }).isDisabled())) throw new Error("Send for approval is on with a 5-character reason");
    });
    await step(s, `Negative - keeping ${drop} as well makes 21 units: over the maximum, cannot be sent`, async () => {
      await box(drop).check(); await s.getByRole("complementary", { name: "After the change" }).getByText(/That is 21 units\. The most you can take is 20/).waitFor();
      if (!(await s.getByRole("button", { name: "Send for approval" }).isDisabled())) throw new Error("Send for approval is on at 21 units");
      await box(drop).uncheck(); await s.getByRole("complementary", { name: "After the change" }).getByText(/18 · min 15 · max 20/).waitFor();
    });
    await step(s, "Send for approval: 'Your course change request is sent'; My requests shows it waiting, Units 18 → 18 of 20", async () => {
      await s.getByLabel("Why do you want this change?").fill(`${drop} clashes with my work shifts at the bank; ${add} has Saturday tutorials at the centre.`);
      await s.getByRole("button", { name: "Send for approval" }).click(); await s.getByText(/Your course change request is sent/).waitFor();
      const card = s.getByRole("region", { name: "Course change request" }).first(); await card.waitFor();
      const t = (await card.innerText()).replace(/\s+/g, " ");
      for (const re of [new RegExp(`Course change · Drop ${drop}, add ${add}`), /Waiting for a decision/, /Units 18 → 18 of 20/]) if (!re.test(t)) throw new Error(`the request card does not say ${re}: ${t}`);
    });
    pending = (await regNow()).changeRequest;
  }
  await step(s, "While it waits, Request a course change is gone: 'You have a course change waiting for a decision.'", async () => {
    await s.goto(`${UNI}/registration`); await s.getByRole("heading", { name: /^Registered ·/ }).waitFor();
    if (await s.getByRole("link", { name: "Request a course change" }).count()) throw new Error("Request a course change still shows while one is waiting");
    await expectText(/You have a course change waiting for a decision\./);
  });
  const atAkure = (await regNow()).student.centre.code === "AKR";
  const approver = atAkure ? "Mrs Bisi Ade" : "Ngozi Adebayo";
  if (atAkure) await asAde(); else await asAdmin();
  await step(p, `${approver}'s Approvals (A-03): ${STU.first}'s course change is waiting, with the kind chips`, async () => {
    await p.goto(`${UNI}/staff/registration/requests`); await p.getByRole("heading", { name: "Approvals" }).first().waitFor();
    await p.getByRole("link", { name: /Course changes \(\d+\)/ }).waitFor();
    await p.getByRole("list", { name: "Requests" }).getByRole("button", { name: new RegExp(STU.name) }).first().waitFor();
  });
  await step(p, `Open it (A-03c): the reason and 'If you approve, ${drop} … is dropped and ${add} … is added: 18 → 18 of 20 units'`, async () => {
    await p.getByRole("list", { name: "Requests" }).getByRole("button", { name: new RegExp(STU.name) }).first().click();
    await p.getByRole("heading", { name: `Course change · ${STU.name}` }).waitFor();
    const t = await mainText(p); console.log(`      detail: ${t.slice(t.indexOf("Course change ·"), t.indexOf("Course change ·") + 500)}`);
    if (!new RegExp(`If you approve, ${drop} .+ \\(3 units\\) is dropped and ${add} .+ \\(3 units\\) is added: 18 → 18 of 20 units\\. ${STU.first} gets an email and a new slip\\.`).test(t)) throw new Error("the 'If you approve' line is not as expected");
  });
  await step(p, `Approve: 'Approved ${STU.name}'s course change. ${STU.first} gets an email and a new slip.'`, async () => {
    await p.getByRole("button", { name: "Approve" }).click();
    await p.getByText(`Approved ${STU.name}'s course change. ${STU.first} gets an email and a new slip.`).waitFor();
  });
  if (atAkure) await step(p, "Negative - the coordinator has no Rules or Carry-overs: opening Rules is refused", async () => {
    await p.goto(`${UNI}/staff/registration/rules`); await p.waitForLoadState("load");
    const t = await mainText(p); if (/Save rules/.test(t)) throw new Error("the coordinator can edit the rules");
  }, { allow: [403, 404] });
  await asStudent();
  await step(s, `${STU.first} sees 'Approved by ${approver}'; the slip is version ${before + 1} with ${add} (R-09d)`, async () => {
    await s.goto(`${UNI}/registration`);
    await s.getByRole("region", { name: "Course change request" }).first().getByText(`Approved by ${approver}`).waitFor();
    await expectText(new RegExp(`\\(version ${before + 1}\\)`)); await expectText(new RegExp(add));
    const r = (await studentApi(`/registration/me/registrations/${me.registration.id}`)).body;
    if (r.slipVersion !== before + 1 || !r.courses.some((x) => x.code === add) || r.courses.some((x) => x.code === drop)) throw new Error(`slip v${r.slipVersion}: ${r.courses.map((x) => x.code).join(", ")}`);
    if (r.totalUnits !== 18 || r.courseCount !== 7) throw new Error(`${r.courseCount} courses, ${r.totalUnits} units`);
  });
  await step(s, "History lists the registration and the approved change", async () => {
    await s.getByText("History").click(); await expectText(new RegExp(`Drop(ped)? ${drop}, add(ed)? ${add}`));
  });
  await step(s, "The change-approved email went out (dev email log)", async () => {
    const m = (await emails(STU.email)).find((e) => /approved/i.test(e.subject + e.body) && (e.subject + e.body).includes(add));
    if (!m) throw new Error("no change-approved email"); console.log(`      email: "${m.subject}" · ${m.status}`);
  });
});



/** The summary cards (StatGrid) fill their row at this width: one row, the last card ending at the grid's right edge. */
async function cardsFillRow(page, firstLabel) {
  const r = await page.evaluate((label) => {
    const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT); let el = null;
    for (let t = w.nextNode(); t; t = w.nextNode()) if (t.textContent.trim() === label) { el = t.parentElement; break; }
    let grid = el; while (grid && !(getComputedStyle(grid).display === "grid" && grid.children.length > 1)) grid = grid.parentElement;
    if (!grid) return { error: `no card grid around "${label}"` };
    const g = grid.getBoundingClientRect(); const cards = [...grid.children].map((c) => c.getBoundingClientRect());
    return { n: cards.length, rows: new Set(cards.map((c) => Math.round(c.top))).size, gap: Math.round(g.right - Math.max(...cards.map((c) => c.right))) };
  }, firstLabel);
  if (r.error) throw new Error(r.error);
  if (r.rows !== 1 || r.gap > 4) throw new Error(`the ${r.n} summary cards take ${r.rows} row(s) and leave ${r.gap}px empty on the right`);
}

// ================================================================== V · staff and provider views (A-01, A-02, A-07, A-07b, A-05, A-06; console)
await group("V", `Mrs Adebayo's payments and registrations, the rules, moving ${STU.first} to Lagos; Chuka's Payments card and Settlement`, async () => {
  await asStudent();
  const fee = await feeNow(); const ref = fee.paidPayment?.reference; if (!ref) throw new Error(`${STU.first} has not paid yet (group P first)`);
  const me = await regNow();
  await asAdmin();
  await step(a, `Payments (A-01): the cards, ${STU.name} Paid with ${ref}, and never the provider's split`, async () => {
    await a.goto(`${UNI}/staff/payments`); await a.getByRole("heading", { name: "Platform fee payments" }).waitFor();
    const t = await mainText(a);
    for (const re of [/Paid \d+ ₦[\d,]+ collected/, /Confirming \d+/, /Not paid \d+/, /Refunds \d+/, /Reversed \d+/, /Students \d+/, /Fee and settlement account/, /••••\d{4}/]) if (!re.test(t)) throw new Error(`Payments does not show ${re}`);
    if (/₦12,000|₦3,000|provider share|split/i.test(t)) throw new Error("the provider's split shows on the university's Payments page");
    await cardsFillRow(a, "Paid");
  });
  await step(a, `Live search: typing '${STU.surname.slice(0, 4)}' finds ${STU.name} at once (no Find button)`, async () => {
    if (await a.getByRole("button", { name: /^(Find|Search)$/ }).count()) throw new Error("a Find/Search button is shown");
    await a.getByLabel("Search payments").fill(STU.surname.slice(0, 4)); await a.waitForURL(/q=/);
    const row = a.getByRole("row").filter({ hasText: STU.matric }); await row.waitFor();
    const t = (await row.innerText()).replace(/\s+/g, " "); if (!t.includes(ref) || !/Paid/.test(t)) throw new Error(`the row: ${t}`);
  });
  await step(a, `Search by the reference ${ref}, then filters Status Paid and Method Card apply at once`, async () => {
    await a.getByLabel("Search payments").fill(ref); await a.waitForURL(new RegExp(`q=${ref}`)); await a.getByRole("row").filter({ hasText: STU.matric }).waitFor();
    await a.getByLabel("Status").selectOption("PAID"); await a.waitForURL(/status=PAID/);
    await a.getByLabel("Method").selectOption("CARD"); await a.waitForURL(/method=CARD/); await a.getByRole("row").filter({ hasText: STU.matric }).waitFor();
  });
  await step(a, "Export downloads a CSV of the filtered rows", async () => {
    const d = await download(a, a.getByRole("link", { name: "Export" }));
    const lines = d.buf.toString("utf8").trim().split(/\r?\n/); console.log(`      ${d.name}: ${lines.length - 1} row(s) · ${lines[0]}`);
    if (!/^student,matric_number,centre,programme,level,status,method,reference,date$/.test(lines[0]) || !lines.some((l) => l.includes(ref))) throw new Error("the CSV is not the filtered export");
  });
  await step(a, `${STU.name}'s payment record (A-02): fee status in words and every attempt with its reference and status`, async () => {
    await a.getByRole("link", { name: STU.name }).first().click(); await a.getByRole("heading", { name: STU.name }).first().waitFor();
    const t = await mainText(a); console.log(`      A-02: ${t.slice(0, 300)}`);
    if (!t.includes(ref) || !/Paid/.test(t)) throw new Error("the record does not show the paid payment");
  });
  await step(a, `Registrations (A-07): ${STU.name} Registered with 7 courses and 18 units; the cards`, async () => {
    await a.goto(`${UNI}/staff/registration`); await a.getByRole("heading", { name: "Registrations" }).first().waitFor();
    const t = await mainText(a); console.log(`      A-07: ${t.slice(0, 260)}`);
    if (!/2026\/2027 · 1st semester/.test(t)) throw new Error("no semester subtitle");
    await cardsFillRow(a, "Registered");
    await a.getByLabel("Search registrations").fill(STU.matric); await a.waitForURL(/q=/);
    const row = (await a.getByRole("row").filter({ hasText: STU.matric }).first().innerText()).replace(/\s+/g, " ");
    if (!/\b7\b.*\b18\b/.test(row) || !/Registered/.test(row)) throw new Error(`the row: ${row}`);
  });
  await step(a, `${STU.name}'s registration record (A-07b): the courses as on the slip, slip number, version, history, Download slip`, async () => {
    await a.getByRole("link", { name: STU.name }).first().click(); await a.getByRole("heading", { name: STU.name }).first().waitFor();
    const t = await mainText(a); console.log(`      A-07b: ${t.slice(0, 300)}`);
    if (!/7 courses · 18 units/.test(t) || !/REG-26-1-/.test(t)) throw new Error("the record does not show the registration");
  });
  await step(a, "Rules (A-05): window dates read-only from Academic setup, course-change date, fee switches, unit limits", async () => {
    await a.goto(`${UNI}/staff/registration/rules`); await a.getByRole("heading", { name: "Registration rules" }).first().waitFor();
    const t = await mainText(a); console.log(`      A-05: ${t.slice(0, 300)}`);
    if (!/These dates come from Academic setup/.test(t)) throw new Error("no 'These dates come from Academic setup'");
    const vals = await a.locator("main input").evaluateAll((els) => els.map((e) => e.value));
    if (!vals.includes("15") || !vals.includes("20")) throw new Error(`no 15 / 20 unit limits among the inputs: ${vals.join(", ")}`);
    await a.getByText("Unit limits per level").scrollIntoViewIfNeeded();
  });
  // A-06: move the student to the other centre (Akure ↔ Lagos), from the student's record.
  const from = me.student.centre.code; const toName = from === "LAG" ? "Akure" : "Lagos";
  const sheet = a.getByRole("dialog", { name: STU.name });
  const moveDlg = a.getByRole("dialog", { name: `Move ${STU.first} to another centre` });
  if (!FRESH && from === "LAG") {
    await step(a, `${STU.name} was moved to Lagos in an earlier run: the record lists it under Centre moves`, async () => {
      await a.goto(`${UNI}/staff/students?q=${enc(STU.matric)}`); await a.getByRole("button", { name: STU.name }).first().click(); await sheet.waitFor();
      await sheet.getByText("Centre moves").first().waitFor();
    });
  } else {
    await step(a, `Students → ${STU.name} → Move to another centre: From (read-only), To, From when, What happens, Reason`, async () => {
      await a.goto(`${UNI}/staff/students?q=${enc(STU.matric)}`); await a.getByRole("button", { name: STU.name }).first().click(); await sheet.waitFor();
      await sheet.getByRole("button", { name: "Move to another centre" }).click(); await moveDlg.waitFor(); await dialogOk(a, "Move to another centre");
      if (!(await moveDlg.getByLabel("From", { exact: true }).isDisabled())) throw new Error("From is editable");
    });
    await step(a, "Negative - without a reason: 'Say why the student is moving (3 to 500 characters).'", async () => {
      await pick(moveDlg.getByLabel("To"), new RegExp(toName)); await moveDlg.getByRole("button", { name: "Move student" }).click();
      await moveDlg.getByText("Say why the student is moving (3 to 500 characters).").waitFor();
    });
    await step(a, `Move to ${toName} today: told / not told by email`, async () => {
      await moveDlg.getByLabel("Reason (kept in the audit log)").fill(toName === "Lagos" ? "Transferred to Lagos by her employer" : "Back in Akure after her posting");
      await moveDlg.getByRole("button", { name: "Move student" }).click();
      const done = a.getByRole("dialog", { name: new RegExp(`${STU.first} is now at`) }); await done.waitFor(); await dialogOk(a, "Moved - told by email");
      const t = (await done.innerText()).replace(/\s+/g, " "); console.log(`      move: ${t.slice(0, 400)}`);
      if (!/Told by email/.test(t) || !t.includes(STU.name)) throw new Error("the told-by-email list is missing the student");
      if (toName === "Lagos" && !/Not told .*Lagos .*no coordinator/i.test(t)) throw new Error("Lagos has no coordinator: the Not told line is missing");
      await done.getByRole("button", { name: "Done" }).click();
    });
    await step(a, "The record lists the move under Centre moves", async () => {
      await sheet.getByText("Centre moves").first().waitFor(); const t = (await sheet.innerText()).replace(/\s+/g, " ");
      if (!new RegExp(toName).test(t)) throw new Error("the move is not in the record");
    });
    await asStudent();
    await step(s, `${STU.first}'s Home shows the new centre (${toName})`, async () => {
      await s.goto(`${UNI}/`); await s.getByRole("region", { name: "Your details" }).getByText(new RegExp(toName)).waitFor();
    });
  }
  // ---- the provider console (Chuka) ----
  await step(c, "Console: Chuka Obi signs in (Google, then his two-step code)", consoleIn);
  await step(c, "Wesley University → Payments card: ₦15,000, ₦12,000 provider · ₦3,000 ODeL centre, masked account, Students can pay", async () => {
    await c.goto(`${CONSOLE}/`); await c.getByRole("link", { name: /Wesley University/ }).first().click();
    const card = c.getByRole("region", { name: "Payments" }); await card.waitFor(); const t = (await card.innerText()).replace(/\s+/g, " ");
    for (const re of [/₦15,000 per student per semester/, /₦12,000 provider · ₦3,000 ODeL centre/, /••••\d{4}/, /Students can pay/, /Paystack subaccount ACCT_/]) if (!re.test(t)) throw new Error(`the card does not show ${re}: ${t}`);
  });
  await step(c, `Settlement: this month; ${ref} with ₦15,000, provider ₦12,000, centre ₦3,000, Paystack's fee, the charge the student paid and net ₦12,000`, async () => {
    await c.goto(`${CONSOLE}/settlement`); await c.getByRole("heading", { name: "Settlement" }).first().waitFor();
    const row = (await c.getByRole("row").filter({ hasText: ref }).first().innerText()).replace(/\s+/g, " "); console.log(`      row: ${row}`);
    for (const re of [/Wesley University/, /₦15,000/, /₦12,000/, /₦3,000/, /₦329\.95|₦329/]) if (!re.test(row)) throw new Error(`the settlement row does not show ${re}`);
    if (!/₦12,000\s+Paid$|₦12,000 Paid/.test(row)) throw new Error(`the provider net is not ₦12,000: ${row}`);
    const cards = await mainText(c); console.log(`      cards: ${cards.slice(0, 300)}`);
    await cardsFillRow(c, "Payments");
    const odd = cards.match(/₦\d[\d,]*\.\d(?!\d)/); if (odd) throw new Error(`an amount with one decimal: ${odd[0]}`);
    if (/\d{4}-\d{2}-\d{2}/.test(cards.slice(0, 120))) throw new Error("the period is shown as ISO dates");
  });
  await step(c, "Settlement: choosing the university updates the report at once", async () => {
    await pick(c.getByLabel("University"), /Wesley University/); await c.waitForURL(/tenantId=/); await c.getByRole("row").filter({ hasText: ref }).first().waitFor();
  });
});

// ================================================================== M · phone size (390 × 844), same window
await group("M", `${STU.first}'s key screens on a 390 px phone: Home fee card, payments, registration, receipt, slip check`, async () => {
  await asStudent(); await phone();
  const fee = await feeNow(); const reg = await regNow();
  await step(s, "Phone: Home with the fee card", async () => {
    await s.goto(`${UNI}/`); await s.getByRole("region", { name: `Platform fee · ${SEM1}` }).waitFor(); await noSideways(s);
    if (reg.registration) await expectText(/Exams You can sit this semester's exams\. /);
    const ref = s.getByRole("region", { name: `Platform fee · ${SEM1}` }).locator(".font-mono").first();
    if (await ref.count() && (await ref.evaluate((el) => el.getClientRects().length)) > 1) throw new Error("the reference breaks over two lines");
  });
  await step(s, "Phone: Payments (the fee and the history)", async () => { await s.goto(`${UNI}/payments`); await s.getByRole("heading", { name: "Payments", exact: true }).waitFor(); await noSideways(s); });
  if (fee.paidPayment) await step(s, "Phone: the receipt", async () => { await s.goto(`${UNI}/payments/${fee.paidPayment.id}/receipt`); await s.getByRole("article", { name: "Receipt" }).waitFor(); await noSideways(s); });
  await step(s, "Phone: Registration (registered, slip and actions)", async () => { await s.goto(`${UNI}/registration`); await s.getByRole("heading", { name: /Course registration|Register/ }).first().waitFor(); await noSideways(s); });
  if (reg.registration?.id) {
    const r = (await studentApi(`/registration/me/registrations/${reg.registration.id}`)).body;
    await step(s, "Phone: /verify with the slip code", async () => { await s.goto(`${UNI}/verify?code=${enc(r.verificationCode)}`); await s.getByText(/Valid slip/).waitFor(); await noSideways(s); });
  }
  await step(s, "Phone: the More menu", async () => { await s.goto(`${UNI}/more`); await s.waitForLoadState("load"); await noSideways(s); });
  await desk();
});

// ================================================================== end of groups

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\nRun ${RUN} (${STU.name}, ${STU.matric}). ${passed} of ${results.length} steps passed.`);
process.exit(passed === results.length ? 0 : 1);
