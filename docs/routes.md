# Routes (B0 Platform base, B1 Set up a session and let students in, B2 Pay and register)

Figma files: **03 Staff Web** `JTrDKm6sW4Zc3xLtiF5Abn`, **02 Student Web** `oYPXI3kMCgPu5ZKDhehy7J`, **01 Student Mobile** `BdgcGOz6MmsQAdQ3JcOiwK`, **00 Design System** `JS7iHUa012ezAnsVeuQKjd`.

Status: **Built** = matches the frame and talks to the contract; **Adapted** = built, with a deliberate difference noted; **Placeholder** = honest holding page until a later phase.

## University host (e.g. `wesley.localhost:3000`)

| Route | Screen | Figma | Status |
|---|---|---|---|
| `/` (signed out) | M-01 Welcome: Activate my account / Sign in | 02 · D1 flow A M-01 | Built (paused university: "portal is paused") |
| `/` (student signed in) | Home: fee card (P-01 not paid, P-01e confirming "do not pay again", P-01b paid → Register now, E-07 paid twice, E-08 reversed) with Paystack's charge, "Your semester" (registration, courses, exams), details | 02 · D2 50:932 | Adapted: P-01c "moved centre" shows the new centre only (no student-facing move in the API) |
| `/payments` | P-11 Payments: this semester's fee card and every attempt | 02 · D2 P-11 | Built |
| `/payments/pay` | P-02 choose card / transfer / USSD (4 banks), summary with the charge; paid → Payments, confirming → that payment | 02 · D2 P-02 | Built |
| `/payments/{id}` | P-03 finish on checkout, P-04 transfer (timer), P-04b USSD, P-05 confirming (polls Check), P-06 received, P-07 declined, P-08 closed, expired, E-07b refund, E-08 reversed | 02/01 · D2 | Built |
| `/payments/return?reference=` (or `trxref=`) | Back from Paystack: asks the API, never marks anything paid | — | Built |
| `/payments/{id}/receipt` | P-10 receipt with Download PDF and Print | 02 · D2 P-10 | Built |
| `/registration` | R-01 not open, R-08 fee not paid, confirming, late needed / waiting, B10 late approved, R-02/R-03/R-03b/R-04 choose and review, R-05b registered (slip PDF, code), my requests (R-07, R-07b, R-09c/d/e) with cancel | 02 · D2 17:674 | Built |
| `/registration/late` | R-06 late request with a document (C30 file row) | 02 · D2 R-06 | Built |
| `/registration/change` | R-09 / R-09b course change with the live counter | 02 · D2 R-09 | Built |
| `/verify?code=` | Public slip check | — | Built |
| `/more` | Phone "More" tab: every menu item | — | Built |
| `/staff/payments` | A-01 cards, live search, filters, Export; fee and masked account read-only | 03 · D2 20:479 | Adapted: no "Reported" card (no problem reports in the API) |
| `/staff/payments/students/{id}` | A-02 one student's fee, attempts, refunds, reversal, receipts | 03 · D2 20:865 | Adapted: no manual confirmation (owner: only Paystack confirms) |
| `/staff/registration` | A-07 report: cards, filters, live search, Export; tabs Students / Approvals / Rules / Carry-overs | 03 · D2 244:7343 | Built |
| `/staff/registration/students/{id}` | A-07b one student's registration, slip, history, requests, carry-overs | 03 · D2 244:7463 | Built |
| `/staff/registration/requests` | A-03 queue + A-03c detail, A-03b decline box (own box per kind), A-03e ODeL office queue | 03 · D2 184:5654 | Built |
| `/staff/registration/rules` | A-05 / A-05b / A-05c | 03 · D2 21:751 | Built |
| `/staff/registration/carry-overs` | Carry-overs per student, add, remove, CSV import | — | Adapted: find a student first (the API lists one student at a time) |
| `/staff/students?student=` | W-22b + A-06 Move to another centre (dialog, told / not told, scheduled moves, cancel) | 03 · D2 21:979 | Built (B24: opened from the record) |
| `/sign-in` | M-08 Sign in (matric or email + password, keep me signed in), E-04 wrong password, E-05 locked with the time, E-06 suspended, S-02 signed out | 02/01 · D1 flow B, C | Built |
| `/activate`, `/activate?matric=…` | M-02 matric (or email) → M-03 6-digit code (resend wait, M-03b wrong code, E-03 can't access this email) → M-04 password with live rules → M-05 privacy notice → M-06 check your details; E-01 not found, E-02 already active, no email, too many codes | 02/01 · D1 flow A | Adapted: M-06 centre and email read-only (API allows only the phone) |
| `/reset-password`, `?login=…&sent=1` | M-09 → M-03R code → M-11 new password ("Save and sign in") | 02/01 · D1 flow B | Adapted: M-10 "We'll email you a code" is folded into M-09 (the API sends the code on start, so the masked email is shown on the code screen) |
| `/courses`, `/classes`, `/exams`, `/results`, … | Student menu destinations | — | Placeholder; inside the student shell when signed in ("… opens soon") |
| `/staff/sign-in` | W-01 Google sign-in | 03 · 2:355 | Built |
| `/staff/sign-in?error=not_linked\|wrong_domain\|no_role` | W-02 Account not linked (+ variants) | 03 · 2:376 | Adapted: no "Email the ODeL office" button (no office email in the contract) |
| `/staff/sign-in?error=suspended\|university_suspended\|cancelled\|expired\|too_many_attempts` | W-01 with a banner per error | 03 · 2:355 | Built (copy written for B0) |
| `/staff/sign-in?reason=idle` | S-02 Signed out | 03 · 60:2493 | Built |
| `/staff/sign-in?signedOut=1` | After S-04 | 03 · 60:2493 | Built (success banner) |
| `/staff/sign-in/two-step` | W-03 2FA code, trust this computer, backup code | 03 · 2:410 | Built |
| `/staff/sign-in/set-up` | W-04 2FA setup → W-05 backup codes | 03 · 2:452, 2:548 | Built |
| `/staff/sign-in/role` | W-06 Choose role | 03 · 2:592 | Built |
| `/auth/continue` | Routes by session stage | — | Built |
| `/staff` | Staff home | — | ODeL admin → `/staff/setup`; other roles: placeholder dashboard |
| `/staff/setup` | W-10 Setup checklist from real data: status, summary, percent, locked reason, Start/Continue/Edit/Review | 03 · 3:304 | Built |
| `/staff/academic-setup` | → Sessions tab | — | Redirect |
| `/staff/academic-setup/sessions` | W-11 sessions list; sheet W-11c new / W-11b edit (Save draft, Save and make active); make active; delete a draft | 03 · 3:644, 348:23327, 197:5010 | Built (late-registration close and a second-semester window added: both in the contract) |
| `/staff/academic-setup/structure?sel=faculty:…\|department:…\|programme:…` | W-12 tree + right panel (programme, department W-12e, faculty), add/edit faculty, department, programme (W-12d … W-12j), W-12c CSV import with row report | 03 · 4:710, 101:2430, 177:3551, 177:3841, 178:3855, 178:4127, 348:23391, 348:23536, 348:23681, 101:2805 | Built |
| `/staff/academic-setup/staffing`, `?tab=centres` | W-16 courses / centres, W-16b who teaches (lecturer, one facilitator per centre, exam officer, email them), W-16c coordinator, W-16d copy from last session (copied + skipped list), W-16e before import banner | 03 · 5:1777, 200:5673, 184:4243, 200:5881, 321:7961 | Built |
| `/staff/academic-setup/grading`, `?programmeId=` | W-17 rules, W-17b edit bands, W-17c weights/bands checked while typing (Save disabled, the API refuses too), W-17d a programme's own rules / use the default again, W-17e standing and degree class | 03 · 5:1976, 206:6425, 206:6948, 205:6041, 205:6313 | Built |
| `/staff/courses` | W-13 catalogue with search, programme, level, semester, lecturer filters and pages; W-13b add / W-13e edit (W-13d choose programmes, core or elective); W-13c CSV import; Export (rows on screen) | 03 · 4:1015, 101:3151, 191:5045, 348:23826, 101:3518 | Adapted: "Content" column and "Short description" left out (B3; not in the contract) |
| `/staff/centres`, `?centre=…` | W-14 centres with status, W-14b centre profile sheet (address, coordinator, phone, rooms), W-14c add centre, W-14d add/edit/remove room | 03 · 4:1332, 197:5256, 197:5533, 197:5768 | Built |
| `/staff/people`, `?person=…` | W-15 people & roles (search, role, status), W-15b invite with scoped roles, W-15c bulk invite CSV, person sheet: edit roles, resend invitation, reset two-step, W-21 suspend (warnings from the suspend check, reason) / restore | 03 · 5:1246, 191:4477, 191:4776, 5:1554 | Built |
| `/staff/reports` | Reports index (audit log; others later) | — | Built |
| `/staff/reports/audit` | University audit log: type and date filters, pages, export of the page | console SA-09 148:993 style | Built |
| `/staff/students`, `?student=…` | W-22 list (search, programme, level, centre, status), W-22b record sheet (edit, resend welcome, send reset code, suspend / restore, consent, history), W-22c add a student | 03 · 210:7084, 210:7325, 210:7587 | Adapted: W-22c has first name + surname (API takes them separately); the centre is a select (the API allows it until B2's move flow) |
| `/staff/students/import`, `?importId=…` | W-18 upload (drag and drop), W-19 row report (ready / errors / warnings, problems with "Show all", problem rows CSV, upload a fixed file), confirm, done; W-18b history sheet | 03 · 6:1864, 6:2061, 101:3847 | Built (CSV only; an Excel file gets "save as CSV UTF-8") |
| `/staff/students/welcome` | W-20 preview, W-20d wording editor (insert a field, live preview, test send of unsaved text, default wording), test send, send with progress (polls every 2 s), W-20c delivery report and failed list | 03 · 6:2318, 216:7631, 216:7808 | Adapted: the button counts students with an email ("Send to N"), the rest are listed as skipped |
| `/staff/*` (Payments, Registration, Help, Settings) | "… is coming in a later phase" | — | Placeholder |
| Staff shell | Side menu + top bar, drawer below 1024 px | 03 · W-10 3:304 | Built |
| Role switcher (side menu) | S-03 Role switcher open | 03 · 3:918 | Built |
| Idle dialog (any staff page) | S-01 Are you still there? | 03 · 3:1043 | Built |
| Sign out (side menu) | S-04 Sign out | 03 · 60:2374 | Built |
| Notification bell | Unread dot + list | Web Top Bar | Built (count loads once per page) |
| `/offline` | Offline page (served by the service worker) | D0 Page State · Offline | Built |
| `/dev/states` | Student shell + Empty, Loading, Error, No access, Signed out, Fee blocked, Offline, Poor connection, Maintenance | D0 16:597, 16:11, 16:128 | Built (dev/mock only) |
| `/dev/mock-google` | Mock Google account picker | — | Mock mode only |

## Console host (`console.localhost:3000`)

| Route | Screen | Figma | Status |
|---|---|---|---|
| `/sign-in`, `/sign-in/two-step`, `/sign-in/set-up`, `/sign-in/role` | W-01, W-03, W-04/W-05, W-06 with platform branding | 03 · as above | Built |
| `/` | SA-01 Universities | 03 · 143:375 | Adapted: "Health (7 days)" column replaced by "First admin" (no health data in B0) |
| `/` (no universities) | SA-01 empty state | — (designed in the same style) | Built |
| `/universities/new` step 1 | SA-02 Details, SA-02c empty, SA-02b web address taken | 03 · 143:728, 357:30705, 143:1015 | Adapted: fields follow the contract (see below) |
| `/universities/new` step 2 | SA-03 Branding + live preview, SA-03b contrast failure | 03 · 143:1306, 143:1592 | Built (motto field dropped: not in the contract) |
| `/universities/new` step 3 | SA-04 Rules and payments: fee, centre share, settlement account (bank → verify → confirm the name; saved right after the university is created) | SA-04 | Built |
| `/universities/new` step 4 | SA-05 Review and create | 03 · 146:498 | Built |
| `/universities/{id}?created=1` | SA-05b University created | 03 · 146:657 | Built |
| `/universities/{id}` | SA-01b University page (details, branding, first admin, resend invitation) | 03 · 247:11785 | Adapted: no Edit / Change admin (no endpoints in B0) |
| `/universities/{id}` Payments card | SA-01b fee and split, settlement account (masked), change fee, set or change account | — | Built |
| `/settlement` | Settlement report: totals, per university, per payment (provider / centre / Paystack / student charge / net), Export | — | Built |
| `/staff/sign-in` (console host) | Redirects to `/sign-in`; `next` is always a public path | — | Built |
| `/audit` | SA-09 Audit trail (filter by university, pages, export CSV of the page) | 03 · 148:993 | Built |
| `/health`, `/features`, `/support`, `/releases`, `/help`, `/settings` | "… is coming in a later phase" | — | Placeholder |

SA-02 fields: the design has Full name, Email sender name, Web address, First admin's name and email, Expected students, Plan. The contract's `POST /platform/tenants` needs name, shortName, slug, webAddress, googleDomain and firstAdmin, so the form has Full name, Short name, Web address, Short address (slug), Staff Google domain and the first admin; sender name, expected students and plan wait for the API.

## Responsive

- Staff and console screens were designed for desktop. Below 1024 px the side menu becomes a drawer (menu button in the top bar); below 768 px tables become stacked cards, two-column forms become one column, and button rows stack full width. Every button and link is at least 48 px tall below 768 px.
- Sign-in screens drop the brand panel below 1024 px; the crest and name sit in a brand-coloured bar above the form.
- Student shell: top app bar + bottom tab bar on phones and tablets (01 Student Mobile), side menu + top bar from 1024 px (02 Student Web).
