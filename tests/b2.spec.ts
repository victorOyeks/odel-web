import { expect, test, type Page } from "@playwright/test";
import { consoleHost, enterCode, signInAdmin, signInAs, wesley } from "./helpers";

// B2 Pay and register against the mock (ODEL_MOCK_API=1). Tunde Ajayi (WU/ODL/24/0166) is the seeded active student.
async function signInStudent(page: Page) {
  await page.goto(wesley("/sign-in"));
  await page.getByLabel("Matric number or email").fill("WU/ODL/24/0166");
  await page.getByLabel("Password", { exact: true }).fill("Password1");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(wesley("/"));
}

test("P-01 → P-02 → checkout → P-05/P-06 → P-10, then R-02 … R-05b and a course change (R-09)", async ({ page }) => {
  await signInStudent(page);
  await expect(page.getByText("Platform fee · 2026/2027 · 1st semester").first()).toBeVisible();
  await expect(page.getByText("Not paid").first()).toBeVisible();
  await expect(page.getByText("₦15,000 + about ₦329.95 Paystack charge · you pay about ₦15,329.95").first()).toBeVisible();
  await page.getByRole("link", { name: "Pay ₦15,000", exact: true }).click();
  await page.getByRole("button", { name: /Pay ₦15,000 by card/ }).click();
  await page.getByRole("link", { name: "Decline the card" }).click();
  await expect(page.getByRole("heading", { name: "Your payment did not go through" })).toBeVisible();
  await expect(page.getByText(/insufficient funds/)).toBeVisible();
  await page.getByRole("link", { name: "Try again" }).click();
  await page.getByRole("button", { name: /Pay ₦15,000 by card/ }).click();
  await page.getByRole("link", { name: "Pay with test card" }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: /Platform fee receipt/ })).toBeVisible();

  await page.goto(wesley("/registration"));
  await page.getByText("CSC 209").click();
  await page.getByText("MTH 211").click();
  await expect(page.getByText("18 · min 15 · max 20")).toBeVisible();
  await page.getByText("STA 201").click();
  await expect(page.getByText("That is 21 units. The most you can take is 20: remove an elective.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review registration" })).toBeDisabled();
  await page.getByText("STA 201").click();
  await page.getByRole("button", { name: "Review registration" }).click();
  await page.getByLabel(/These are my courses/).check();
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByRole("heading", { name: "Registered · 7 courses · 18 units" })).toBeVisible();
  await page.getByRole("link", { name: "Request a course change" }).click();
  await page.getByText("MTH 211").click();
  await page.getByText("STA 201").click();
  await page.getByLabel("Why do you want this change?").fill("MTH 211 clashes with my work shifts; STA 201 has weekend classes.");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByText("Course change · Drop MTH 211, add STA 201")).toBeVisible();
});

test("A-01 payments (no split), A-03c approve, A-07 report, A-06 move", async ({ page }) => {
  await signInAdmin(page);
  await page.goto(wesley("/staff/payments"));
  await expect(page.getByRole("heading", { name: "Platform fee payments" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Paid twice")).toBeVisible();
  await expect(page.getByText(/₦12,000|provider share/i)).toHaveCount(0);
  await page.getByLabel("Search payments").fill("grace");
  await expect(page).toHaveURL(/q=grace/);
  await expect(page.getByRole("link", { name: "Grace Eze" }).first()).toBeVisible();

  await page.goto(wesley("/staff/registration/requests"));
  await page.getByRole("button", { name: /Tunde Ajayi/ }).click();
  await expect(page.getByText(/If you approve, MTH 211/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved Tunde Ajayi's course change/)).toBeVisible();

  await page.goto(wesley("/staff/registration"));
  await expect(page.getByRole("heading", { name: "Registrations" })).toBeVisible();

  await page.goto(wesley("/staff/students?student=st-3"));
  await page.getByRole("button", { name: "Move to another centre" }).click();
  await page.getByLabel("To", { exact: true }).selectOption("LAG");
  await page.getByRole("button", { name: "Move student" }).click();
  await expect(page.getByText("Say why the student is moving (3 to 500 characters).")).toBeVisible();
  await page.getByLabel(/Reason/).fill("Moved to Lagos for work");
  await page.getByRole("button", { name: "Move student" }).click();
  await expect(page.getByText("Told by email")).toBeVisible();
  await expect(page.getByText(/has no coordinator/)).toBeVisible();
});

test("SA-01b settlement account (masked) and the settlement report; /staff/sign-in on the console", async ({ page }) => {
  await signInAs(page, consoleHost("/sign-in"), /Chuka Obi, platform admin/);
  await enterCode(page, "246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(consoleHost("/"));
  await page.getByRole("link", { name: /Wesley University/ }).first().click();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByText(/₦12,000 provider · ₦3,000 ODeL centre/)).toBeVisible();
  await page.getByRole("button", { name: "Change settlement account" }).click();
  await page.getByLabel("Bank").selectOption("058");
  await page.getByLabel("Account number").fill("0123454521");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("checkbox")).toBeVisible();
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText("Tick the box to confirm this is the university's account.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText(/Saved the settlement account/)).toBeVisible();
  await page.goto(consoleHost("/settlement"));
  await expect(page.getByRole("heading", { name: "Settlement" })).toBeVisible();
  await page.goto(consoleHost("/staff/sign-in"));
  await expect(page).toHaveURL(consoleHost("/"));
});
