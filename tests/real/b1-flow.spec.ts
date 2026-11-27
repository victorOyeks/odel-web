import { expect, test, type Page } from "@playwright/test";

// B1 end to end through the web app against the real API (odel-backend develop, dev profile, gateway :9300)
// and the web app on :3000 (`bun run dev`, or `next start -p 3000` without ODEL_MOCK_API).
// The provider must not have two-step yet (clear it in the local DB), or set ODEL_TOTP_CHUKA_OBI.
const API = process.env.ODEL_API_URL ?? "http://localhost:9300";
const stamp = Date.now().toString(36).slice(-5);
const SLUG = `wweb-${stamp}`;
const DOMAIN = `wweb${stamp}.edu.ng`;
const ADMIN = `ngozi.adebayo@${DOMAIN}`;
const WEB = (path = "/") => `http://${SLUG}.localhost:3000${path}`;
const CONSOLE = (path = "/") => `http://console.localhost:3000${path}`;
const STUDENT_EMAIL = `adeola.${stamp}@example.com`;
const MATRIC = `WU/ODL/24/${String(1000 + Math.floor(Math.random() * 8999))}`;

const secrets: Record<string, string> = {};
const lastCode: Record<string, string> = {};

async function totp(secret: string) {
  const text = await (await fetch(`${API}/api/v1/dev/totp?secret=${encodeURIComponent(secret)}`)).text();
  return text.match(/\d{6}/)![0];
}
async function freshCode(email: string, secret: string) {
  if (!(email in lastCode)) lastCode[email] = await totp(secret);
  for (let i = 0; i < 40; i++) {
    const c = await totp(secret);
    if (c !== lastCode[email]) return (lastCode[email] = c);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no fresh code");
}
async function code(page: Page, value: string) {
  await page.getByLabel("Digit 1 of 6").first().click();
  await page.keyboard.type(value);
}
async function devGoogle(page: Page, url: string, email: string) {
  await page.goto(url);
  await page.getByRole("link", { name: "Continue with university Google account" }).click();
  await page.waitForURL(/\/api\/v1\/auth\/dev\/google/);
  await page.getByRole("textbox").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/api/"));
}
async function twoStep(page: Page, email: string) {
  if (/\/set-up/.test(page.url())) {
    const key = (await page.locator("p.font-mono").first().textContent())!.replace(/\s+/g, "");
    secrets[email] = key;
    await code(page, await freshCode(email, key));
    await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await page.getByRole("button", { name: /I’ve saved them/ }).click();
  } else if (/\/two-step/.test(page.url())) {
    const key = secrets[email] ?? process.env[`ODEL_TOTP_${email.split("@")[0].replace(/\W/g, "_").toUpperCase()}`];
    test.skip(!key, `${email} already has two-step sign-in; clear it or set its secret`);
    await code(page, await freshCode(email, key!));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL((u) => !/\/(set-up|two-step)/.test(u.pathname));
  if (/\/role/.test(page.url())) await page.getByRole("button", { name: /Continue as/ }).click();
}
/** The newest 6-digit code emailed to an address (dev profile logs emails). */
async function emailedCode(to: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const list = (await (await fetch(`${API}/api/v1/dev/emails?to=${encodeURIComponent(to)}`)).json()) as { created_at: string; body: string; subject: string }[];
    const m = list.find((e) => Date.parse(e.created_at) >= after - 2000 && /\b\d{6}\b/.test(e.body));
    if (m) return m.body.match(/\b(\d{6})\b/)![1];
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no code emailed to ${to} within 60 seconds`);
}
const csvFile = (name: string, rows: string[]) => ({ name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\n") + "\n") });

test("B1 end to end through the web app against the real API", async ({ page }) => {
  test.setTimeout(600_000);

  await test.step("provider creates the university", async () => {
    await devGoogle(page, CONSOLE("/sign-in"), "chuka.obi@odel.dev");
    await twoStep(page, "chuka.obi@odel.dev");
    await page.goto(CONSOLE("/universities/new"));
    await page.getByLabel("Full name").fill(`Wesley Web ${stamp}`);
    await page.getByLabel("Short name").fill("Wesley ODeL");
    await page.getByLabel("Web address").fill(`odel.${DOMAIN}`);
    await page.getByLabel("Short address").fill(SLUG);
    await page.getByLabel(/First admin’s name/).fill("Ngozi Adebayo");
    await page.getByLabel(/First admin’s email/).fill(ADMIN);
    await page.getByLabel("Staff Google domain").fill(DOMAIN);
    await page.getByRole("button", { name: "Next: branding" }).click();
    await page.locator("#f-primary").fill("#1A2368");
    await page.locator("#f-accent").fill("#C27808");
    await page.getByRole("button", { name: "Next: rules and payments" }).click();
    await page.getByRole("button", { name: "Next: review" }).click();
    await page.getByRole("button", { name: "Create the university" }).click();
    await expect(page.getByRole("heading", { name: /is set up$/ })).toBeVisible();
  });

  await test.step("ODeL admin signs in: day-one W-10", async () => {
    await page.context().clearCookies();
    await devGoogle(page, WEB("/staff/sign-in"), ADMIN);
    await twoStep(page, ADMIN);
    await expect(page).toHaveURL(/\/staff\/setup$/);
    await expect(page.getByText("0 of 9 steps complete")).toBeVisible();
  });

  await test.step("W-11c session 2026/2027", async () => {
    await page.goto(WEB("/staff/academic-setup/sessions"));
    await page.getByRole("button", { name: "New session" }).first().click();
    const sheet = page.getByRole("dialog", { name: "New session" });
    await sheet.getByLabel("Session name").fill("2026/2027");
    const first = sheet.getByRole("group", { name: "First semester" });
    await first.getByLabel("Starts").fill("2026-10-05");
    await first.getByLabel("Ends").fill("2027-02-26");
    await first.getByLabel("Registration opens").fill("2027-02-02");
    await first.getByLabel("Registration closes", { exact: true }).fill("2027-02-16");
    const second = sheet.getByRole("group", { name: "Second semester" });
    await second.getByLabel("Starts").fill("2027-03-15");
    await second.getByLabel("Ends").fill("2027-07-30");
    await sheet.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("2026/2027 is saved as a draft.")).toBeVisible();
  });

  await test.step("W-12 structure and W-12c import with a bad row", async () => {
    await page.goto(WEB("/staff/academic-setup/structure"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add faculty" }).first().click();
    let dlg = page.getByRole("dialog", { name: "Add a faculty" });
    await dlg.getByLabel("Name").fill("Faculty of Science");
    await dlg.getByLabel("Code").fill("SCI");
    await dlg.getByRole("button", { name: "Add faculty" }).click();
    await page.getByRole("button", { name: "Add department" }).click();
    dlg = page.getByRole("dialog", { name: "Add a department" });
    await dlg.getByLabel("Name").fill("Computer Science");
    await dlg.getByLabel("Code").fill("CSC");
    await dlg.getByRole("button", { name: "Add department" }).click();
    await page.getByRole("button", { name: "Add programme" }).click();
    dlg = page.getByRole("dialog", { name: "Add a programme" });
    await dlg.getByLabel("Name").fill("B.Sc. Computer Science");
    await dlg.getByLabel("Code").fill("BSC-CSC");
    await dlg.getByRole("button", { name: "Add programme" }).click();
    await expect(page.getByRole("heading", { name: "B.Sc. Computer Science", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Import from CSV" }).click();
    dlg = page.getByRole("dialog", { name: "Import faculties, departments and programmes" });
    await dlg.getByLabel("Choose a CSV file").setInputFiles(
      csvFile("structure.csv", [
        "faculty_name,faculty_code,department_name,department_code,programme_name,programme_code,degree,duration_years,entry_levels",
        "Faculty of Management Sciences,MGT,Accounting,ACC,B.Sc. Accounting,BSC-ACC,B.Sc.,4,100;200",
        "Faculty of Management Sciences,MGT,Business,BUS,B.Sc. Business,BSC-BUS,B.Sc.,9,100",
      ]),
    );
    await expect(dlg.getByText(/^Row 3:/)).toBeVisible();
    await dlg.getByRole("button", { name: "Import the rest" }).click();
    await expect(dlg.getByText(/Added 1 faculty/)).toBeVisible();
    await dlg.getByRole("button", { name: "Done" }).click();
  });

  await test.step("W-13b course, W-14 centre and room", async () => {
    await page.goto(WEB("/staff/courses"));
    await page.getByRole("button", { name: "Add course" }).first().click();
    let dlg = page.getByRole("dialog", { name: "Add a course" });
    await dlg.getByLabel("Code").fill("csc201");
    await dlg.getByLabel("Units").fill("3");
    await dlg.getByLabel("Title").fill("Data Structures");
    await dlg.getByLabel("Level").selectOption("200");
    await dlg.getByLabel("Semester").selectOption("1");
    await dlg.getByRole("button", { name: "Offered to" }).click();
    await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
    await dlg.getByRole("button", { name: "Add course" }).click();
    await expect(page.getByText("Added CSC 201 · Data Structures.")).toBeVisible();

    await page.goto(WEB("/staff/centres"));
    await page.getByRole("button", { name: "Add centre" }).first().click();
    dlg = page.getByRole("dialog", { name: "Add a study centre" });
    await dlg.getByLabel("Centre name").fill("Akure Study Centre");
    await dlg.getByLabel("Code").fill("AKR");
    await dlg.getByLabel("State").selectOption("Ondo");
    await dlg.getByLabel(/Phone students can call/).fill("0803 555 0117");
    await dlg.getByRole("button", { name: "Add centre" }).click();
    const profile = page.getByRole("dialog", { name: "Akure Study Centre" });
    await profile.getByRole("button", { name: "Add room" }).click();
    dlg = page.getByRole("dialog", { name: "Add a room" });
    await dlg.getByLabel("Room name").fill("Room 1");
    await dlg.getByLabel("Seats").fill("30");
    await dlg.getByLabel("Computers").fill("30");
    await dlg.getByRole("button", { name: "Add room" }).click();
    await expect(profile.getByText("30 seats · 30 computers · exam use")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await test.step("W-15b invites, W-16b staffing, W-17 grading (40/50 refused)", async () => {
    await page.goto(WEB("/staff/people"));
    for (const [name, email, role, scopeLabel, option] of [
      ["Dr Funmi Bello", `f.bello@${DOMAIN}`, "Lecturer", "Department", "Computer Science · Faculty of Science"],
      ["Mrs Bisi Ade", `b.ade@${DOMAIN}`, "Centre coordinator", "Study centre", "Akure Study Centre"],
    ]) {
      await page.getByRole("button", { name: "Invite staff" }).first().click();
      const dlg = page.getByRole("dialog", { name: "Invite a staff member" });
      await dlg.getByLabel("Full name").fill(name);
      await dlg.getByLabel("University email").fill(email);
      await dlg.getByRole("button", { name: role, exact: true }).click();
      await dlg.getByLabel(scopeLabel, { exact: true }).selectOption({ label: option });
      await dlg.getByRole("button", { name: "Send invite" }).click();
      await expect(page.getByText(`Invited ${name}.`)).toBeVisible();
    }
    await page.goto(WEB("/staff/academic-setup/staffing"));
    await page.getByRole("button", { name: "Assign staff for CSC 201" }).click();
    const dlg = page.getByRole("dialog", { name: /Who teaches CSC 201/ });
    await dlg.getByLabel("Lecturer").selectOption({ index: 1 });
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved who teaches CSC 201.")).toBeVisible();

    await page.goto(WEB("/staff/academic-setup/grading"));
    await page.getByLabel("Coursework (CA)").fill("40");
    await page.getByLabel("Exam").fill("50");
    await expect(page.getByText("Fix 1 problem: the weights add up to 90")).toBeVisible();
    await page.getByLabel("Exam").fill("70");
    await page.getByLabel("Coursework (CA)").fill("30");
    await page.getByRole("button", { name: "Confirm these rules" }).click();
    await expect(page.getByText(/Saved\. Version \d+ applies from/)).toBeVisible();
  });

  await test.step("W-10 ticks; W-18 → W-19 → import", async () => {
    await page.goto(WEB("/staff/setup"));
    const steps = page.getByRole("region", { name: "Setup steps" }).getByRole("listitem");
    for (const i of [0, 3, 6]) await expect(steps.nth(i)).toContainText("Done");
    await page.goto(WEB("/staff/students/import"), { waitUntil: "networkidle" });
    await page.getByLabel("Choose the portal CSV file").setInputFiles(
      csvFile("portal_export.csv", [
        "matric_number,surname,first_name,other_names,programme_code,level,study_centre,email,phone",
        `${MATRIC},Okafor,Adeola,,BSC-CSC,200,AKR,${STUDENT_EMAIL},0803 412 4417`,
        `WU/ODL/24/9998,Musa,Ibrahim,,BSC-CSC,200,Ikeja,ibrahim.${stamp}@example.com,`,
      ]),
    );
    await expect(page.getByRole("heading", { name: "Check before importing" })).toBeVisible();
    await expect(page.getByText(/Study centre "Ikeja" not found/).first()).toBeVisible();
    await page.getByRole("button", { name: "Import 1 valid row" }).click();
    await expect(page.getByRole("heading", { name: "Students imported" })).toBeVisible();
  });

  await test.step("W-20 test send, send to all, W-20c report", async () => {
    await page.goto(WEB("/staff/students/welcome"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send a test to me" }).click();
    await expect(page.getByText(`Sent a test to ${ADMIN}.`, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /^Send to \d+ students?$/ }).click();
    await page.getByRole("button", { name: "Send now" }).click();
    await expect(page.getByRole("dialog", { name: "Welcome messages sent" })).toBeVisible({ timeout: 120_000 });
  });

  await test.step("student activates with the emailed code (M-02 … M-06) and lands on Home", async () => {
    await page.context().clearCookies();
    await page.goto(WEB(`/activate?matric=${encodeURIComponent(MATRIC)}`));
    const t0 = Date.now();
    await page.getByRole("button", { name: "Send my code" }).click();
    await expect(page.getByRole("heading", { name: "Enter the 6-digit code" })).toBeVisible();
    await code(page, await emailedCode(STUDENT_EMAIL, t0));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByLabel("New password", { exact: true }).fill("Adeola2026");
    await page.getByLabel("Confirm password", { exact: true }).fill("Adeola2026");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("I have read and accept the privacy notice").check();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
    await page.getByRole("button", { name: "Save and go to my dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Your courses appear after registration" })).toBeVisible();
  });

  await test.step("student resets the password by emailed code (M-09 … M-11)", async () => {
    await page.context().clearCookies();
    await page.goto(WEB(`/reset-password?login=${encodeURIComponent(MATRIC)}`));
    const t0 = Date.now();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Enter the 6-digit code" })).toBeVisible();
    await code(page, await emailedCode(STUDENT_EMAIL, t0));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByLabel("New password", { exact: true }).fill("Adeola2027");
    await page.getByLabel("Confirm password", { exact: true }).fill("Adeola2027");
    await page.getByRole("button", { name: "Save and sign in" }).click();
    await expect(page.getByRole("heading", { name: "Your courses appear after registration" })).toBeVisible();
  });

  await test.step("W-22b shows her active with consent; the audit log has the import, send and activation", async () => {
    await page.context().clearCookies();
    await devGoogle(page, WEB("/staff/sign-in"), ADMIN);
    await twoStep(page, ADMIN);
    await expect(page).toHaveURL(/\/staff\/setup$/);
    await expect(page.getByText(/of 9 steps complete/)).toBeVisible();
    await page.goto(WEB(`/staff/students?q=${encodeURIComponent(MATRIC)}`));
    await page.getByRole("button", { name: "Adeola Okafor" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Adeola Okafor" });
    await expect(sheet.getByText("Active").first()).toBeVisible();
    await expect(sheet.getByText(/Accepted the privacy notice/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(WEB("/staff/reports/audit?type=STUDENTS"));
    await expect(page.getByText(/portal_export\.csv/).first()).toBeVisible();
    await page.goto(WEB("/staff/reports/audit"));
    await expect(page.getByRole("table", { name: /Audit log/ })).toBeVisible();
  });
});
