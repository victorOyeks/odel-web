# Routes (B0 Platform base)

Figma files: **03 Staff Web** `JTrDKm6sW4Zc3xLtiF5Abn`, **02 Student Web** `oYPXI3kMCgPu5ZKDhehy7J`, **01 Student Mobile** `BdgcGOz6MmsQAdQ3JcOiwK`, **00 Design System** `JS7iHUa012ezAnsVeuQKjd`.

Status: **Built** = matches the frame and talks to the contract; **Adapted** = built, with a deliberate difference noted; **Placeholder** = honest holding page until a later phase.

## University host (e.g. `wesley.localhost:3000`)

| Route | Screen | Figma | Status |
|---|---|---|---|
| `/` | Student home: "Student portal opens soon" | — | Placeholder (student sign-in arrives in B1) |
| `/courses`, `/classes`, `/exams`, `/results`, `/payments`, … | Student menu destinations | — | Placeholder ("… opens soon") |
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
| `/staff/setup` | W-10 Setup checklist, day-one empty state | 03 · 3:304, D10 SA-05c 290:13835 | Built |
| `/staff/*` (Students, Payments, Registration, Courses, Centres, People & roles, Academic setup, Reports, Help, Settings, checklist step links) | "… is coming in a later phase" | — | Placeholder |
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
| `/universities/new` step 3 | Rules and payments | SA-04 (skipped) | Adapted: kept in the stepper as "Defaults for now; the university’s admin sets these" |
| `/universities/new` step 4 | SA-05 Review and create | 03 · 146:498 | Built |
| `/universities/{id}?created=1` | SA-05b University created | 03 · 146:657 | Built |
| `/universities/{id}` | SA-01b University page (details, branding, first admin, resend invitation) | 03 · 247:11785 | Adapted: no Edit / Change admin (no endpoints in B0) |
| `/audit` | SA-09 Audit trail (filter by university, pages, export CSV of the page) | 03 · 148:993 | Built |
| `/health`, `/features`, `/support`, `/releases`, `/help`, `/settings` | "… is coming in a later phase" | — | Placeholder |

SA-02 fields: the design has Full name, Email sender name, Web address, First admin's name and email, Expected students, Plan. The contract's `POST /platform/tenants` needs name, shortName, slug, webAddress, googleDomain and firstAdmin, so the form has Full name, Short name, Web address, Short address (slug), Staff Google domain and the first admin; sender name, expected students and plan wait for the API.

## Responsive

- Staff and console screens were designed for desktop. Below 1024 px the side menu becomes a drawer (menu button in the top bar); below 768 px tables become stacked cards, two-column forms become one column, and button rows stack full width. Every button and link is at least 48 px tall below 768 px.
- Sign-in screens drop the brand panel below 1024 px; the crest and name sit in a brand-coloured bar above the form.
- Student shell: top app bar + bottom tab bar on phones and tablets (01 Student Mobile), side menu + top bar from 1024 px (02 Student Web).
