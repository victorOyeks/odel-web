# QA scripts: test in this order

Dev site: university portals at `https://<short address>.odel-dev.oyeksglobal.com` (Wesley: https://wesley.odel-dev.oyeksglobal.com) ·
provider console: https://odel-console-dev.oyeksglobal.com · API docs: https://odel-api-dev.oyeksglobal.com/swagger-ui.html

**Scope.** The scripts set the order and the main flows; they are not the limit of the testing. Cover each area beyond them too:
positive and negative scenarios and any edge cases you find, such as empty or invalid input, the wrong role, another
university's data, repeated or cancelled actions, and refreshing or going back in the middle of a flow.

**Sign-in on dev.** There is no Google sign-in on dev yet. "Continue with university Google account" opens a page titled
**Choose an account** that stands in for Google: pick a person or type an email. Everything after it (the two-step code,
sessions, roles) is the real thing.

**Two-step codes.** Every staff account uses an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Ask
the project owner for the shared test accounts' setup keys and backup codes; they are never written in this repository.
Accounts you create yourself (section 2 of script 01) you set up with your own phone.

**Emails are real.** Invitations go out through Brevo from `no-reply@oyeksglobal.com`. Use addresses you can read, ideally
Gmail plus-addresses (`yourname+anything@gmail.com` all arrive in one inbox). Never use a real university's staff address.
Addresses on test domains (`.test`, `example.com`) are recorded as *Not sent: test address* and never sent.

| # | Script | What it covers | Status |
|---|---|---|---|
| 01 | `01-b0-platform-base.md` | B0 Platform base: provider console sign-in, adding a university (details, branding with the readability check, review, create), its platform address and invitation email, the first admin's sign-in with two-step setup and backup codes, the empty setup checklist, signing out and in (backup code, three wrong codes, trust this computer), universities kept apart, own domains (DNS record, Check now, live), audit trail, phone and tablet sizes | Ready |
| 02 | `02-b1-setup-and-students.md` | B1 Set up a session and let students in: the setup checklist from real data, sessions and semesters, faculties, departments and programmes (one by one and by CSV with a row report), course catalogue, study centres and rooms, People & roles (invite, bulk invite, roles, suspend, two-step reset), staffing, grading rules with weight and band checks, student import with a row report and history, add a student, welcome emails (wording, test, send, delivery report), student activation by matric and emailed code, sign-in lockout and suspension, password reset, Home, the university's audit log, phone sizes and keyboard | Ready |
