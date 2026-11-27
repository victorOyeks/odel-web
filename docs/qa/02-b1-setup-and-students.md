# QA script · B1 Set up a session and let students in (dev)

## Purpose

This script tests **phase B1**. Mrs Ngozi Adebayo (ODeL admin) builds the 2026/2027 session, imports the admitted students and
sends the welcome emails; a student activates with her matric number and an emailed code, lands on Home, and later resets her
password. It covers:

- the **setup checklist** (W-10) ticking each step from real data;
- **Academic setup**: sessions and semesters, faculties → departments → programmes (one by one and by CSV), staffing, grading rules;
- the **course catalogue**, **study centres and rooms**, **People & roles** (invite, bulk invite, roles, suspend, two-step reset);
- **students**: import with a row report that saves nothing until confirmed, import history, add one student, the students list
  and a student's record;
- **welcome emails**: wording, test send, send to all with progress, delivery report;
- the **student web**: activation, sign-in, lockout, suspension, password reset, Home;
- the university's **audit log**; **phone, tablet and keyboard** use.

Name what you create **QA …** and use Gmail plus-addresses (`yourname+stu1@gmail.com`) for students, so every code reaches you.

## Links

- Staff: https://wesley.odel-dev.oyeksglobal.com/staff/sign-in (or your own test university from script 01)
- Students: https://wesley.odel-dev.oyeksglobal.com/
- Emails the platform sent (dev only): https://odel-console-dev.oyeksglobal.com/api/v1/dev/emails
- Contracts: `docs/api-b1-academic.md`, `docs/api-b1-students.md` in odel-backend · Figma: 03 Staff Web page D1 (W-10 to W-22),
  02 Student Web and 01 Student Mobile page D1 (M-01 to M-11, E-01 to E-06) · routes: `docs/routes.md`

Best done on a **new test university** (script 01, section 2) so the checklist starts at 0 of 9.

## 1. Setup checklist (W-10)

1. Sign in as the ODeL admin. The checklist shows **0 of 9 steps complete**, step 8 *Import students* is **Locked · Finish steps
   1, 2 and 4 first**, step 9 **Locked · Import students first**.
2. Each step's button says Start / Continue / Edit / Review and opens the right screen. Come back after each section below and
   check the step ticks and the summary (e.g. *2026/2027 · 2 semesters · registration 2–16 Feb*) and the percent.

## 2. Sessions & semesters (W-11, W-11b, W-11c)

1. Academic setup → Sessions → **New session**. Try `2026-27`: *Write the session as 2026/2027.*
2. Second semester starting before the first ends: *The second semester must start after the first one ends.*
3. Registration closing after the semester ends, late close before the close: each is refused with a message on the field.
4. Save draft with both semesters and a registration window → listed as **Draft**, checklist step 1 **Done**.
5. A second session whose dates overlap → *These dates overlap 2026/2027 (…)*. Same name → *There is already a 2026/2027 session.*
6. Make active (row action) → Active; the earlier active one becomes Archived. Delete works only on a draft with no staffing.

## 3. Academic structure (W-12 … W-12j, W-12c)

1. Add faculty *Faculty of Science* `SCI` → department *Computer Science* `CSC` → programme *B.Sc. Computer Science* `BSC-CSC`, 4 years,
   entry 100L and 200L. The tree and the right panel show it (duration, entry levels, graduation units, grading rules, courses by level).
2. Reuse a code: *SCI is already used by Faculty of Science.* Edit names and codes; move a department to another faculty.
3. **Import from CSV**: Download template, fill two good rows and one bad (duration 9, or a department code under two faculties).
   The dialog says **N rows need fixing** with each row's problem; nothing is in the tree yet. Download problem rows; **Import the
   rest** adds only the good rows. Wrong columns: *The columns do not match the template…*; header only: *The file has no rows…*.
4. Keyboard: the tree's expand buttons and links work with Tab and Enter; the selected item is announced.

## 4. Course catalogue (W-13 … W-13e)

1. Add a course: `csc201` is saved as **CSC 201**. Choose programmes (core or elective), level, semester, units (1–12).
2. A level the programme does not have, a duplicate code (*CSC 201 is already in the catalogue (…)*), no title: each refused clearly.
3. Optional lecturer (only staff with the Lecturer role are listed). Edit the course. Filters (programme, level, semester, lecturer
   *No lecturer yet*) and search; pages of 25; Export downloads the rows shown.
4. **Import CSV** with one bad row (unknown programme code) → row report, import the rest.

## 5. Study centres and rooms (W-14 … W-14d)

1. Add centre *Akure Study Centre* `AKR`, Ondo, phone `0803 555 0117`. A bad phone and a 7-letter code are refused.
2. The centre sheet opens: no rooms yet. Add room *Room 1*, 30 seats, **40 computers** → *A room cannot have more computers than
   seats.* Fix to 30. Edit and remove a room.
3. Status in the list: *No rooms* → *No coordinator* → *Ready* once a coordinator is chosen (section 7).

## 6. People & roles (W-15, W-15b, W-15c, W-21)

1. **Invite staff**: a Gmail address is refused (*Use an @… address: staff sign in with the university's Google accounts.*). Invite
   a lecturer (scope: department Computer Science) and a centre coordinator (Akure). They receive the invitation email.
2. Status **Invited** until they sign in; **Resend invitation** works only then.
3. **Bulk invite (CSV)**: template, one row with an unknown role and one duplicate email → row report; confirm invites the rest.
4. **Edit roles**: add and remove roles; removing a role signs the person out. Try removing your own ODeL admin role:
   *You cannot remove your own ODeL admin role. Ask another ODeL admin.*
5. **Suspend** someone who lectures a course: the warning names the course; a reason is required; they are signed out at once and
   their sign-in ends with the suspended message. **Restore access** brings them back. You cannot suspend yourself.
6. **Reset two-step sign-in** for someone who has set it up: reason required; their next sign-in asks them to set two-step up again;
   they get an email.

## 7. Staffing (W-16 … W-16e)

1. Before any import: the banner *No students imported yet for 2026/2027 · N centres*.
2. **Assign** CSC 201: lecturer, one facilitator per centre, exam officer, "Email them" ticked → saved; the assigned people get an email.
3. A suspended person shows in red. Centres tab: choose a coordinator.
4. **Copy from last session** (needs an earlier session with staffing): copied count and the skipped list (suspended people).

## 8. Grading rules (W-17 … W-17e)

1. The first visit says these are the built-in defaults. **Confirm these rules** ticks step 7.
2. CA 40 / exam 50: *Must add up to 100 / Now 90*, the check bar says *Fix 1 problem: the weights add up to 90*, Save is disabled.
3. Edit bands: make C 50–59 and D 45–52 → *bands C and D overlap (50–52)*; leave a gap → *scores … are in no band*; remove the F band →
   *the bottom band must start at 0*.
4. **Standing and degree class**: classes must go down (*Must be below …*); save.
5. Rules for a programme: change it and save → *has its own rules*; **Use the default again**.

## 9. Import students (W-18, W-19, W-18b)

1. Step 8 is unlocked once steps 1, 2 and 4 are done. Students → Import students. Try an `.xlsx`: *Save it as CSV (File → Save as →
   CSV UTF-8) and upload it again.*
2. Upload a CSV with good rows plus: a centre `Ikeja`, a matric number twice, a row without email, a bad phone.
   W-19 shows **Ready / Errors / Warnings** with the right counts and messages (*Did you mean …?*, *rows 4 and 5*). Nothing is in
   Students yet. Download problem rows. **Upload a fixed file** re-checks.
3. **Import N valid rows** → done. Students lists them as *Not activated*. Import the same file again: rows count as updated or
   unchanged, never duplicated. Import history lists both imports.

## 10. Welcome emails (W-20, W-20d, W-20c)

1. **Edit the wording**: insert fields, the preview fills them; remove `{activation_link}` → refused; an unknown `{foo}` → refused.
   Send a test of the unsaved text; Save template; Use the default wording.
2. **Send a test to me** arrives in your inbox with the university's colours and an Activate button.
3. **Send to N students**: the progress bar moves; then the delivery report: delivered, no email, failed list (CSV). Already active
   students are skipped. The checklist's step 9 ticks.

## 11. The student (M-01 … M-11, E-01 … E-06), on a phone first

1. Open the welcome email on your phone; the button opens *Enter your matric number* already filled in.
2. A wrong matric number: *We could not find this number…* and *Just admitted?*. A student without email: *We have no email
   address for you…* with the centre's number.
3. The 6-digit code arrives within a minute. *Resend code in 0:59* counts down. A wrong code: *That code is not right. 2 tries left
   before we send a new one.* Third wrong: a new code is sent. *I can't access this email* shows the centre to call.
4. Password rules tick as you type; mismatched passwords refused. Privacy notice: Accept without ticking → *Tick the box…*.
5. Check your details → Home: name, programme, level, centre and *Your courses appear after registration*.
6. Activate again → *This account is already active*. Sign out (tick "shared computer").
7. Sign in with a wrong password: *Wrong password. 4 tries left…*; five wrong → *Too many attempts… until 3:42 pm*, Sign in disabled.
8. **Forgot password?** → code → new password → *Save and sign in* → Home; other devices are signed out.
9. From the staff record (W-22b) **Send code**: the email's link opens the reset screen without sending a second code.
10. The office suspends the student: the open session ends; sign-in shows *Your account is suspended…*. Restore access.
11. Leave the student idle for 28 minutes: *Are you still there?*; at 30 minutes the sign-in page says you were signed out.

## 12. Students list and record (W-22, W-22b, W-22c)

1. Search by name, matric number or email; filter by programme, level, centre, status.
2. A student's record: activation sent / activated dates, consent date, history. Edit the phone or email and save.
3. **Add a student** (late admission): duplicate matric refused; "Send the welcome email now" sends it.

## 13. Audit log

Reports → Audit log: the import, the send, the activation, sign-ins, role changes and suspensions are there with who and when.
Filter by type and dates; Export downloads the page.

## 14. Sizes and access

- Phone (360 px): tables become cards, side panels and dialogs fill the screen, buttons are at least 48 px tall, nothing scrolls
  sideways. Tablet (768, 1024) and desktop (1440).
- Keyboard only: every dialog traps focus and closes with Esc; every action is reachable with Tab.
- A screen reader announces errors on the field and the status of each step.
- Sign in as a lecturer (no ODeL admin role): the setup screens are not in the menu, and typing their address shows *You do not have access*.
