# QA script · B0 Platform base (dev)

## Purpose

This script tests **phase B0**, the base every later phase builds on. It covers:

- the **provider console**: the platform team signs in and adds a university;
- **adding a university**: details, branding with the readability check, review and create, and the result;
- the university's **own address** (its platform address works at once) and the **invitation email** to its first admin;
- the **first admin's sign-in**: Google (the dev stand-in), two-step setup with a QR code, 8 backup codes, and the empty
  **setup checklist** in the university's colours;
- **sessions**: signing out, signing in with a code or a backup code, three wrong codes, trusting a computer, the idle warning;
- **universities kept apart**: one university's staff cannot see or enter another's;
- a university's **own domain** (optional): the DNS record to add, Check now, live;
- the **audit trail**;
- **phone and tablet** sizes.

Everything you do writes to the shared dev database. Name what you create **QA …** (section 10 says how it is cleaned up).

## Links

- Provider console: https://odel-console-dev.oyeksglobal.com
- Wesley University (test university): https://wesley.odel-dev.oyeksglobal.com/staff/sign-in
- A university you create: `https://<short address>.odel-dev.oyeksglobal.com/staff/sign-in`
- Emails the platform sent (dev only): https://odel-console-dev.oyeksglobal.com/api/v1/dev/emails
- Contract this follows: `docs/api-b0.md` in odel-backend · Figma: 03 Staff Web, pages D1 (W-01 to W-10, S-01 to S-04) and D10 (SA-01 to SA-09)

## Accounts

| Who | Where | Email | Two-step |
|---|---|---|---|
| Chuka Obi, platform admin | Provider console | `chuka.obi@oyeksglobal.com` | Shared test key: ask the project owner |
| Ngozi Adebayo, Wesley's ODeL admin | Wesley portal | `ngozi.adebayo@wesleyuni.edu.ng` | Shared test key: ask the project owner |
| Your test university's first admin | Its portal | `yourname+qa1@gmail.com` (your own Gmail) | You set it up in section 3 |

Use a separate browser profile or private window per person, so you can stay signed in as Chuka while testing the admin.

## Before you start

- Reload the page (Ctrl/Cmd + R) if you are told a new version was deployed.
- A code from the authenticator works **once**. If a code is refused right after you used it, wait for the next one (up to 30 s).
- Three wrong codes in a row end the sign-in on purpose; start again from the sign-in page.
- Staff are signed out after **30 minutes** without activity; a warning appears at 28 minutes.

## 1 · Provider console sign-in (Chuka)

1. **Do:** open the console. **Expect:** the ODeL Platform sign-in page, "Sign in to the console".
2. **Do:** Continue with university Google account → **Use another email** → `someone@gmail.com` → Continue.
   **Expect:** back on sign-in with a message that the account is not on the staff list.
3. **Do:** Continue again. **Expect:** "Choose an account" lists **Chuka Obi · Platform admin**, marked *Development sign-in*.
4. **Do:** choose Chuka. **Expect:** "Enter your 6-digit code" (W-03), with *Trust this computer for 30 days* **unticked**
   and *Use a backup code instead*.
5. **Do:** type `000000` → Verify. **Expect:** "That code did not work. You have 2 tries left."
6. **Do:** type the code from the authenticator → Verify. **Expect:** **Universities** (SA-01) with Wesley, Northbridge and
   Crestfield, each with its address, status *Setting up* and first admin.

## 2 · Add a university (Chuka · SA-02 to SA-05b)

1. **Do:** Add a university. **Expect:** Step 1 of 4 · Details, all fields empty.
2. **Do:** Next: branding with nothing filled in. **Expect:** each required field says what is missing; you stay on step 1.
3. **Do:** fill in: Full name `QA University 1`, Short name `QA ODeL`, Own web address `odl.qa.test`, Short address `wesley`,
   First admin `QA Admin`, email `yourname+qa1@gmail.com`, Staff Google domain `gmail.com` → Next.
   **Expect:** Own web address: "Use a real domain the university controls; test domains like .test or example.com can never be reached".
4. **Do:** clear Own web address → Next. **Expect:** Short address: already used by another university (Wesley).
5. **Do:** Short address `qa1` → Next. **Expect:** step 2 · Branding. The Short address hint showed the platform address
   `qa1.odel-dev.oyeksglobal.com`.
6. **Do:** Main colour `#F5D76E`. **Expect:** "Text on it is hard to read (1.x : 1)"; you cannot go on.
7. **Do:** Main colour `#0F6E6E`, Accent `#E07A2E`, upload a square PNG or SVG logo under 2 MB. **Expect:** "reads well",
   the preview shows the colours and logo. Try a 3 MB file or a JPG: refused with a clear message.
8. **Do:** Next: rules and payments. **Expect:** step 3 says the defaults are used for now and the university's admin sets
   them later. **Do:** Next: review. **Expect:** every value you entered; Own web address "None yet · can be added later".
9. **Do:** Back, change something, Next again. **Expect:** your other entries are kept.
10. **Do:** Create the university. **Expect:** "QA University 1 is set up", created now by Chuka Obi. Next steps:
    ✓ created with its own data · ✓ Live at `https://qa1.odel-dev.oyeksglobal.com` · ⌛ Invitation emailed to QA Admin;
    waiting for the first sign-in · ⌛ completes the setup checklist.
11. **Do:** Add a university again with Short address `qa1`. **Expect:** refused, already used.

## 3 · The first admin gets in (your Gmail · W-01 to W-10)

1. **Do:** open your inbox. **Expect:** within a few minutes, "You are invited to QA University 1's ODeL staff portal" from
   *QA ODeL* `<no-reply@oyeksglobal.com>`, with a link to `https://qa1.odel-dev.oyeksglobal.com/staff/sign-in`. Check spam
   if it is not there.
2. **Do:** open the link. **Expect:** the staff sign-in page in teal and orange with your logo; "Use your @gmail.com Google account".
3. **Do:** Continue → Use another email → `someone@yahoo.com`. **Expect:** refused: not a university account (wrong domain).
4. **Do:** Continue → Use another email → `nobody+x@gmail.com`. **Expect:** refused: the Google account you chose is not on the staff list.
5. **Do:** Continue → choose **QA Admin**. **Expect:** "Set up two-step sign-in" (W-04) with a QR code and the key in groups of four.
6. **Do:** scan the QR with your phone; type a wrong code → Turn on. **Expect:** refused with tries left.
7. **Do:** type the code from the app → Turn on. **Expect:** "Save your backup codes" (W-05): 8 codes like `4827-1930`,
   Download and Print. Download them; they are shown only once.
8. **Do:** I've saved them — continue. **Expect:** the setup checklist (W-10) in your colours: 9 steps, none done; steps 8 and 9
   locked ("Finish steps 1–7 first"); the bell shows 1 new item (the welcome). Every other menu item opens an honest
   "coming in a later phase" page.
9. **Do:** in the console (Chuka), open QA University 1. **Expect:** first admin *accepted*.

## 4 · Signing out and in (your test admin · S-01 to S-04, W-03)

1. **Do:** Sign out (bottom of the menu). **Expect:** "Sign out?" asks to confirm and reminds you to close the browser on a
   shared computer. **Do:** Sign out. **Expect:** sign-in page with "You signed out".
2. **Do:** sign in again (Continue → QA Admin). **Expect:** "Enter your 6-digit code", *Trust this computer* unticked.
3. **Do:** Use a backup code instead → enter one of your codes → Verify. **Expect:** the setup checklist.
4. **Do:** sign out, sign in, and use **the same** backup code. **Expect:** refused.
5. **Do:** switch to the app code; enter three wrong codes. **Expect:** after the third, back on the sign-in page with
   "Too many wrong codes".
6. **Do:** sign in with the right code and tick **Trust this computer for 30 days**. **Expect:** the checklist.
   **Do:** sign out and in again. **Expect:** no code asked on this browser. In a different browser the code is asked.
7. **Do:** leave the portal untouched for 28 minutes. **Expect:** "Are you still there?" with a 2-minute countdown.
   *Stay signed in* keeps you in; letting it run out signs you out with "You were signed out".

## 5 · Universities kept apart

1. **Do:** signed in as your test admin, open the console address. **Expect:** the console sign-in page; you are not signed in there.
2. **Do:** open Wesley's sign-in and try `yourname+qa1@gmail.com`. **Expect:** refused (Wesley staff use @wesleyuni.edu.ng).
3. **Do:** open `https://nothing-here.odel-dev.oyeksglobal.com`. **Expect:** "This web address is not set up"; tab title
   "Not set up · ODeL".
4. **Do:** open `https://qa1.odel-dev.oyeksglobal.com/` (no /staff). **Expect:** the student portal's "opens soon" page in
   your colours (students sign in from phase B1).
5. **Do (if you hold Ngozi's key):** sign in to Wesley as Ngozi. **Expect:** Wesley's checklist, crest and navy; nothing of QA University 1.

## 6 · A university's own domain (optional · console)

Only the project owner can add a real DNS record. Without one you can still test the waiting state.

1. **Do:** open QA University 1 → **Web addresses**. **Expect:** Platform address `qa1.odel-dev.oyeksglobal.com` (opens the
   portal) and "University's own domain · optional" with *No own domain*.
2. **Do:** enter `odl.qa.example.com` → Save. **Expect:** refused (test domains can never be reached).
3. **Do:** enter a real domain you do not control, e.g. `odl.qa-university-test.com.ng` → Save. **Expect:** *Waiting for DNS
   record*, with the record to add: CNAME, that name, pointing to `qa1.odel-dev.oyeksglobal.com`.
4. **Do:** Check now. **Expect:** "No DNS record for … yet" or "points to …, not to the platform"; last checked time updates.
5. **Do:** Remove. **Expect:** back to *No own domain*; invitation links keep using the platform address.
6. **With the owner:** after they add a real CNAME (DNS only), Check now. **Expect:** *DNS found · issuing certificate*, then
   within about 2 minutes *Live*; the domain opens the portal over https; invitation emails now use it.

## 7 · Branding changes and the invitation (console)

1. **Do:** on QA University 1, Resend invitation (only while not yet accepted; use a second test university to see it).
   **Expect:** "Invitation emailed to … again"; a second email arrives.
2. **Do:** open https://odel-console-dev.oyeksglobal.com/api/v1/dev/emails. **Expect:** the invitations you caused, status *SENT*,
   with the platform address link.

## 8 · Audit trail (Chuka · SA-09)

1. **Do:** Audit trail. **Expect:** newest first: *Created QA University 1; invited QA Admin*, the admin's sign-ins with the method
   ("Google and a two-step code", "… a backup code", "… a trusted browser"), *Three wrong two-step codes …*, sign-outs,
   *Sign-in refused for someone@yahoo.com (wrong_domain)*; each with time, university and IP.
2. **Do:** filter by QA University 1. **Expect:** only its entries.

## 9 · Phone and tablet

Repeat a few steps at 390 px (phone) and 768 / 1024 px (tablet), or on real devices:

1. Sign-in page: a slim coloured header with the logo above the card; nothing cut off; buttons at least thumb-sized.
2. Dev "Choose an account" page and the two-step screens: usable with one hand; the code boxes accept paste.
3. Setup checklist and the console's Universities list: the menu becomes a drawer (menu button top left); tables become cards;
   no sideways scrolling.

## 10 · Clean up

There is no "delete university" in the console. When you are done, send the project owner the short addresses you created
(`qa1`, `qa2`, …); they are removed on dev with everything that belongs to them. Delete your downloaded backup codes.

## Defects

Note each one with: the step number, the account, what you did, what you expected, what you saw, the time, and the page
address. A screenshot helps but is not required.
