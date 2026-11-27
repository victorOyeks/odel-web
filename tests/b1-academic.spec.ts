import { expect, test, type Page } from "@playwright/test";
import { crestfield, csv, signInAdmin, wesley } from "./helpers";

// Crestfield starts on day one in mock mode, so this walks W-10's academic steps from nothing.
const Y = 2040 + Math.floor(Math.random() * 40);
const SESSION = `${Y}/${Y + 1}`;

async function xsrfPut(page: Page, url: string, data: unknown) {
  const token = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
  return page.request.put(url, { data, headers: { "x-xsrf-token": token } });
}

test("academic setup on day one: session, structure with a CSV import, course, centre, people, staffing, grading, suspend", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAdmin(page, crestfield);
  await expect(page.getByText("0 of 9 steps complete")).toBeVisible();
  await expect(page.getByRole("region", { name: "Setup steps" }).getByRole("listitem").nth(7)).toContainText("Finish steps 1, 2 and 4 first");

  // ---- W-11c new session, with a mistake first
  await page.getByRole("link", { name: "Start: Session and semesters" }).click();
  await expect(page.getByRole("heading", { name: "No session yet" })).toBeVisible();
  await page.getByRole("button", { name: "New session" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New session" });
  await sheet.getByLabel("Session name").fill(SESSION);
  const first = sheet.getByRole("group", { name: "First semester" });
  await first.getByLabel("Starts").fill(`${Y}-10-05`);
  await first.getByLabel("Ends").fill(`${Y + 1}-02-26`);
  await first.getByLabel("Registration opens").fill(`${Y}-10-05`);
  await first.getByLabel("Registration closes", { exact: true }).fill(`${Y}-10-20`);
  const second = sheet.getByRole("group", { name: "Second semester" });
  await second.getByLabel("Starts").fill(`${Y + 1}-02-01`);
  await second.getByLabel("Ends").fill(`${Y + 1}-07-30`);
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await expect(sheet.getByText("The second semester must start after the first one ends.").first()).toBeVisible();
  await second.getByLabel("Starts").fill(`${Y + 1}-03-15`);
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(`${SESSION} is saved as a draft.`)).toBeVisible();
  await expect(page.getByRole("table", { name: /Sessions/ })).toContainText("Draft");

  // ---- W-12 structure: faculty → department → programme
  await page.getByRole("link", { name: "Academic structure" }).click();
  await page.getByRole("button", { name: "Add faculty" }).first().click();
  let dlg = page.getByRole("dialog", { name: "Add a faculty" });
  await dlg.getByLabel("Name").fill("Faculty of Science");
  await dlg.getByLabel("Code").fill("SCI");
  await dlg.getByRole("button", { name: "Add faculty" }).click();
  await expect(page.getByRole("heading", { name: "Faculty of Science", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Add department" }).click();
  dlg = page.getByRole("dialog", { name: "Add a department" });
  await dlg.getByLabel("Name").fill("Computer Science");
  await dlg.getByLabel("Code").fill("CSC");
  await dlg.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByRole("heading", { name: "Computer Science", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Add programme" }).click();
  dlg = page.getByRole("dialog", { name: "Add a programme" });
  await dlg.getByLabel("Name").fill("B.Sc. Computer Science");
  await dlg.getByLabel("Code").fill("BSC-CSC");
  await dlg.getByRole("button", { name: "Add programme" }).click();
  await expect(page.getByRole("heading", { name: "B.Sc. Computer Science", level: 2 })).toBeVisible();
  await expect(page.getByText("4 years · 8 semesters")).toBeVisible();

  // ---- W-12c CSV import: one good row, one bad row; nothing saved until "Import the rest"
  await page.getByRole("button", { name: "Import from CSV" }).click();
  dlg = page.getByRole("dialog", { name: "Import faculties, departments and programmes" });
  await dlg.getByLabel("Choose a CSV file").setInputFiles(
    csv("structure_2026.csv", [
      "faculty_name,faculty_code,department_name,department_code,programme_name,programme_code,degree,duration_years,entry_levels",
      "Faculty of Management Sciences,MGT,Accounting,ACC,B.Sc. Accounting,BSC-ACC,B.Sc.,4,100;200",
      "Faculty of Management Sciences,MGT,Business Administration,BUS,B.Sc. Business Administration,BSC-BUS,B.Sc.,9,100",
    ]),
  );
  await expect(dlg.getByText("1 row needs fixing")).toBeVisible();
  await expect(dlg.getByText('Row 3: Duration "9" must be 1 to 7 years')).toBeVisible();
  await dlg.getByRole("button", { name: "Import the rest" }).click();
  await expect(dlg.getByText("Added 1 faculty, 1 department and 1 programme.")).toBeVisible();
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("tree")).toContainText("Faculty of Management Sciences");

  // ---- W-13b add a course (code normalised), W-13d choose programmes
  await page.getByRole("link", { name: "Courses" }).click();
  await page.getByRole("button", { name: "Add course" }).first().click();
  dlg = page.getByRole("dialog", { name: "Add a course" });
  await dlg.getByLabel("Code").fill("csc201");
  await dlg.getByLabel("Units").fill("3");
  await dlg.getByLabel("Title").fill("Data Structures");
  await dlg.getByLabel("Level").selectOption("200");
  await dlg.getByLabel("Semester").selectOption("1");
  await dlg.getByRole("button", { name: "Offered to" }).click();
  await dlg.getByLabel(/^B\.Sc\. Computer Science/).check();
  await dlg.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByText("Added CSC 201 · Data Structures.")).toBeVisible();

  // ---- W-14c add a centre, W-14d add a room (more computers than seats is refused)
  await page.getByRole("link", { name: "Centres" }).click();
  await page.getByRole("button", { name: "Add centre" }).first().click();
  dlg = page.getByRole("dialog", { name: "Add a study centre" });
  await dlg.getByLabel("Centre name").fill("Akure Study Centre");
  await dlg.getByLabel("Code").fill("AKR");
  await dlg.getByLabel("State").selectOption("Ondo");
  await dlg.getByRole("button", { name: "Add centre" }).click();
  const profile = page.getByRole("dialog", { name: "Akure Study Centre" });
  await expect(profile.getByText("No rooms yet")).toBeVisible();
  await profile.getByRole("button", { name: "Add room" }).click();
  dlg = page.getByRole("dialog", { name: "Add a room" });
  await dlg.getByLabel("Room name").fill("Room 1");
  await dlg.getByLabel("Seats").fill("30");
  await dlg.getByLabel("Computers").fill("40");
  await dlg.getByRole("button", { name: "Add room" }).click();
  await expect(dlg.getByText("A room cannot have more computers than seats.")).toBeVisible();
  await dlg.getByLabel("Computers").fill("30");
  await dlg.getByRole("button", { name: "Add room" }).click();
  await expect(profile.getByText("30 seats · 30 computers · exam use")).toBeVisible();
  await profile.getByRole("button", { name: "Cancel" }).click();

  // ---- W-15b invite (wrong domain refused), with a scoped role
  await page.getByRole("link", { name: "People & roles" }).click();
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  dlg = page.getByRole("dialog", { name: "Invite a staff member" });
  await dlg.getByLabel("Full name").fill("Dr Funmi Bello");
  await dlg.getByLabel("University email").fill("f.bello@gmail.com");
  await dlg.getByRole("button", { name: "Lecturer" }).click();
  await dlg.getByLabel("Department", { exact: true }).selectOption({ label: "Computer Science · Faculty of Science" });
  await dlg.getByRole("button", { name: "Send invite" }).click();
  await expect(dlg.getByText("Use an @crestfield.edu.ng address")).toBeVisible();
  await dlg.getByLabel("University email").fill("f.bello@crestfield.edu.ng");
  await dlg.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invited Dr Funmi Bello.")).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  dlg = page.getByRole("dialog", { name: "Invite a staff member" });
  await dlg.getByLabel("Full name").fill("Mrs Bisi Ade");
  await dlg.getByLabel("University email").fill("b.ade@crestfield.edu.ng");
  await dlg.getByRole("button", { name: "Centre coordinator" }).click();
  await dlg.getByLabel("Study centre").selectOption({ label: "Akure Study Centre" });
  await dlg.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invited Mrs Bisi Ade.")).toBeVisible();

  // ---- W-16b who teaches CSC 201, W-16c centre coordinator, W-16e before import
  await page.getByRole("link", { name: "Academic setup" }).click();
  await page.getByRole("link", { name: "Staffing" }).click();
  await expect(page.getByText(/No students imported yet for/)).toBeVisible();
  await page.getByRole("button", { name: "Assign staff for CSC 201" }).click();
  dlg = page.getByRole("dialog", { name: /Who teaches CSC 201/ });
  await dlg.getByLabel("Lecturer").selectOption({ label: "Dr Funmi Bello (invited) · Computer Science" });
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved who teaches CSC 201.")).toBeVisible();
  await page.getByRole("link", { name: /^Centres \(/ }).click();
  await page.getByRole("button", { name: "Assign coordinator for Akure Study Centre" }).click();
  dlg = page.getByRole("dialog", { name: "Coordinator for Akure Study Centre" });
  await dlg.getByLabel("Coordinator").selectOption({ label: "Mrs Bisi Ade (invited) · Akure Study Centre" });
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved the coordinator for Akure Study Centre.")).toBeVisible();

  // ---- W-17c weights 40/50 are refused (on screen and by the API), then the default is confirmed
  await page.getByRole("link", { name: "Grading rules" }).click();
  await page.getByLabel("Coursework (CA)").fill("40");
  await page.getByLabel("Exam").fill("50");
  await expect(page.getByText("Must add up to 100")).toBeVisible();
  await expect(page.getByText("Fix 1 problem: the weights add up to 90")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save rules" })).toBeDisabled();
  const refused = await xsrfPut(page, crestfield("/api/v1/academic/grading"), {
    caWeight: 40, examWeight: 50, passMark: 40, scale: 5, roundTotals: true,
    bands: [{ grade: "A", from: 0, to: 100, point: 5, remark: "" }],
    standing: { probationBelow: 1, withdrawAfterProbationSemesters: 2, carryOverBeforeGraduating: true, classes: [] },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).fields.caWeight).toContain("add up to 90%");
  await page.getByLabel("Coursework (CA)").fill("30");
  await page.getByLabel("Exam").fill("70");
  await expect(page.getByText("Check: CA 24 + exam 51 = 75 → A (5 points)")).toBeVisible();
  await page.getByRole("button", { name: "Confirm these rules" }).click();
  await expect(page.getByText(/Saved\. Version 1 applies from/)).toBeVisible();

  // ---- W-10 ticks: steps 1, 2, 4, 6, 7 done; import unlocked
  await page.getByRole("link", { name: "Setup checklist" }).click();
  const steps = page.getByRole("region", { name: "Setup steps" }).getByRole("listitem");
  for (const i of [0, 1, 3, 4, 5, 6]) await expect(steps.nth(i)).toContainText("Done");
  await expect(steps.nth(7)).not.toContainText("Locked");
  await expect(page.getByRole("heading", { level: 1, name: `Set up ${SESSION}` })).toBeVisible();

  // ---- W-21 suspend: the warning names the course, the reason is required, then the audit log shows it
  await page.getByRole("link", { name: "People & roles" }).click();
  await page.getByRole("button", { name: "Dr Funmi Bello" }).first().click();
  await page.getByRole("button", { name: "Suspend Dr Funmi Bello" }).click();
  dlg = page.getByRole("dialog", { name: "Suspend Dr Funmi Bello?" });
  await expect(dlg.getByText(/They lecture 1 course \(CSC 201/)).toBeVisible();
  await dlg.getByRole("button", { name: "Suspend" }).click();
  await expect(dlg.getByText("Write why. It is kept in the audit log.")).toBeVisible();
  await dlg.getByLabel("Reason (kept in the audit log)").fill("Left the university on 30 Nov");
  await dlg.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Dr Funmi Bello is suspended and was signed out everywhere.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByRole("link", { name: /Audit log/ }).click();
  await expect(page.getByText("Suspended Dr Funmi Bello: Left the university on 30 Nov").first()).toBeVisible();
});

test("people & roles: you cannot remove your own admin role", async ({ page }) => {
  await signInAdmin(page, wesley);
  await page.goto(wesley("/staff/people?search=Adebayo"));
  await page.getByRole("button", { name: "Ngozi Adebayo" }).click();
  await expect(page.getByText("This is you.")).toBeVisible();
  await page.getByRole("button", { name: "Edit roles" }).click();
  const dlg = page.getByRole("dialog", { name: /Roles for/ });
  await dlg.getByRole("button", { name: "ODeL admin" }).click();
  await dlg.getByRole("button", { name: "ODeL director" }).click();
  await dlg.getByRole("button", { name: "Save roles" }).click();
  await expect(dlg.getByText("You cannot remove your own ODeL admin role. Ask another ODeL admin.")).toBeVisible();
});
