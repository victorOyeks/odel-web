# QA script · B2 Pay and register (dev)

## Purpose

This script tests **phase B2**. Adeola Okafor (WU/ODL/24/0153, Akure Study Centre, B.Sc. Computer Science 200L) pays the platform
fee for **2026/2027 · 1st semester** through Paystack, gets a receipt, and registration opens; she registers 7 courses (18 units),
downloads her slip, and asks to swap an elective, which Mrs Bisi Ade (Akure coordinator) approves. Mrs Ngozi Adebayo (ODeL admin)
sees the payment and the registration in the reports and moves a student to another centre. Chuka Obi (provider) sets the fee and
the settlement account and reads the settlement report. It covers:

- the **student's Home** fee card in every state (not paid, confirming, paid, paid twice, reversed) and what the fee unlocks;
- **paying** by card (Paystack checkout), bank transfer (30-minute account) and USSD (GTBank, UBA, Sterling, Zenith); declined,
  closed and expired payments; coming back from checkout; the receipt and the payment history;
- **Paystack's charge**, which the student pays on top of the ₦15,000 (about ₦329.95, so about ₦15,329.95);
- **course registration**: not open, fee not paid, choosing courses with the live unit counter, over and under the limits, review and
  submit, the slip (PDF) and the public slip check, late registration with a document, course changes, the student's own requests;
- the **staff web**: Payments (A-01, A-02), Registrations (A-07, A-07b), Approvals (A-03, A-03c, the ODeL office queue), Rules (A-05),
  Carry-overs, and moving a student to another centre (A-06);
- the **provider console**: fee and split, settlement account (verify, confirm the name, masked numbers), the Add a university step 3,
  the settlement report;
- **phone, tablet and keyboard** use.

Paystack on dev is in **test mode**: no real money moves. Use Paystack's test cards (below). Use Gmail plus-addresses for any
student you add, so receipts and decisions reach you.

## Links

- Students: https://wesley.odel-dev.oyeksglobal.com/ · slip check: https://wesley.odel-dev.oyeksglobal.com/verify
- Staff: https://wesley.odel-dev.oyeksglobal.com/staff/sign-in
- Provider console: https://odel-console-dev.oyeksglobal.com (Settlement is in the menu)
- Emails the platform sent (dev only): https://odel-console-dev.oyeksglobal.com/api/v1/dev/emails
- Contracts: `docs/api-b2-payments.md`, `docs/api-b2-registration.md` in odel-backend · Figma: page **D2 Pay and register** in
  02 Student Web, 01 Student Mobile and 03 Staff Web · routes: `docs/routes.md`

**Paystack test cards** (any future expiry, any CVV): success `4084 0840 8408 4081` (PIN `0000`, OTP `123456`); declined for
insufficient funds `5060 6666 6666 6666 666` (PIN `1234`); see Paystack's "Test payments" page for the bank and USSD test flows.

**Before you start**: the registration window of 2026/2027 · 1st semester must be **open** today (Academic setup → Sessions → the
1st semester's registration dates). Sections 9 and 10 ask you to move the dates; put them back afterwards.

## 1. The provider sets the fee and the account (console, SA-01b)

1. Sign in to the console as Chuka Obi. Universities → **Wesley University** → the **Payments** card shows the fee (₦15,000), the
   split (**₦12,000 provider · ₦3,000 ODeL centre**), the settlement account (bank, `••••` and the last four digits, the account
   name, the Paystack subaccount, who set it and when) and **Students can pay**.
2. **Change fee or split**: try ₦500 → *Enter a fee from ₦1,000 to ₦1,000,000.*; a centre share above the fee → refused. Put back
   ₦15,000 / ₦3,000.
3. **Change settlement account**: choose a bank, type 10 digits. While you type you see the digits; leave the box and only
   `••••••` and the last four show. Type 9 digits and **Verify** → *Enter the 10-digit account number.* A number the bank does not
   know → *The bank could not find that account. Check the number and the bank.*
4. A good number → the bank's **account name** appears. **Save account** without ticking the confirmation → *Tick the box to
   confirm this is the university's account.* Tick → saved, the card shows the new masked account. (On dev, leave Wesley on its
   test account when you finish.)
5. Signed in as Ngozi (staff web), Payments shows the fee and the masked account **read-only**, never the ₦12,000 / ₦3,000 split.

## 2. Add a university, step 3 (SA-04)

1. Universities → **Add a university**. Step 3 is **Rules and payments**: the fee (₦15,000) and the centre's share (₦3,000), with
   the provider's share worked out; the settlement account is optional (bank, number, Verify, tick the name).
2. A fee of ₦500 or a share above the fee stops you on step 3 with the message on the field.
3. Verify an account, then on step 4 the review row says *₦15,000 per semester, ₦3,000 to the ODeL centre · account …*. Create.
   The university page's Payments card shows the account and **Students can pay**.
4. Leave the account empty: the review says *settlement account set later*, the new university's card says **Not open yet**, and its
   students see *Payments are not open for your university yet. Try again later or call the ODeL office.* when they try to pay.

## 3. Home before paying (P-01) and the charge

1. Sign in as Adeola on a phone. Home shows **Platform fee · 2026/2027 · 1st semester · ₦15,000 · Not paid**, the line
   *₦15,000 + about ₦329.95 Paystack charge · you pay about ₦15,329.95*, and **Pay ₦15,000**.
2. **Your semester**: Course registration *locked until you pay*, Courses and materials *Available after you register*, Exams *You
   need to pay to take exams*.
3. Registration (side menu on a laptop, More on a phone) shows **R-08**: *Pay the ₦15,000 platform fee for 2026/2027 · 1st semester
   first…* with the fee card and its Pay button.

## 4. Pay by card (P-02, P-03, P-05, P-06, P-10)

1. **Pay ₦15,000** → *Pay your platform fee*: Debit card, Bank transfer, USSD; the summary shows the fee, *Paystack charge (about)
   ₦329.95* and *You pay about ₦15,329.95*, with Paystack's note.
2. Debit card → **Pay ₦15,000 by card** opens Paystack's page (full page). Pay with the success test card. You come back to
   `/payments/return?…`: first *We are confirming your payment* (with **Do not pay again**), then by itself **Payment received**:
   amount (₦15,329.95 = ₦15,000 fee + ₦329.95 Paystack charge), method (*Debit card · … ending …*), date, reference `WU-PF-…`.
3. **View receipt** (P-10): the university's crest and name, Platform fee receipt, receipt no. = the reference, student, matric,
   programme, session, semester, paid on, method, **Platform fee / Paystack charge / Total paid**, status. **Download PDF** gives
   `receipt-WU-PF-….pdf` with the same details and the Paystack reference. **Print** prints only the receipt.
4. Home now shows **Paid** with *Paid on …* and the method and reference, **Register now** and **Receipt**. The receipt email
   arrived with the PDF attached.
5. Payments (P-11) lists every attempt newest first with its status; the paid one shows the total paid. Open **Pay** again
   (type `/payments/pay`): you are taken to Payments, never offered a second payment.

## 5. Card problems (P-07, P-08) and coming back

1. With another unpaid student (add one with your Gmail plus-address and activate them), pay with the **declined** test card →
   *Your payment did not go through* with the bank's reason (*insufficient funds…*), **Try again**. Nothing is marked paid; P-11 shows
   **Failed**.
2. Start a card payment and **close** Paystack's page (or press Back) → coming back shows *You closed the payment page* · *Nothing
   was charged.* with **Go back to the payment page** and **Pay another way**.
3. Pay successfully and close the tab before coming back. Home still shows **Paid** a moment later (the bank's message, not the
   browser, marks it paid). Refreshing the return page any number of times changes nothing.
4. Open `/payments/return?reference=WU-PF-000000` → *We could not check this payment… do not pay again*.

## 6. Bank transfer (P-04, P-05, P-01e) and USSD (P-04b)

1. Another unpaid student, **Bank transfer** → **Get account details**: *Transfer ₦15,329.95 to this account* (the fee plus
   Paystack's charge, never ₦15,000 alone), bank (Paystack-Titan), account number and amount with copy buttons, the 30-minute timer
   counting down, the note. **I have made the transfer** → *We are confirming your payment* · **Do not pay again**.
2. Home now shows **Confirming** · *We are waiting for your bank to confirm your payment. Do not pay again.* with **Check payment
   status** and no Pay button (B17). Registration says *We are confirming your payment…*.
3. Make the test transfer. Within a few minutes the payment page changes to **Payment received** by itself, the receipt says
   *Bank transfer*, Home says **Paid**.
4. Start a transfer and do nothing: when the 30 minutes are up the page says the account ran out, with **Start a new payment**.
5. **Pay another way** on a waiting transfer cancels it and opens the choice again (nothing is charged twice).
6. **USSD**: the bank list has only GTBank, UBA, Sterling and Zenith, with *Another bank? Pay by card or transfer.* Choose UBA →
   *Dial the code from the phone number linked to your UBA account*, the code, reference and amount with copy buttons, **Dial it
   now** on a phone, the timer, **I have dialled the code** → confirming.

## 7. Paid twice (E-07, E-07b) and reversed (E-08)

These need two successful payments or a bank dispute; on dev ask the developer to replay them, or run them in Paystack's test
dashboard.

1. **Paid twice**: Home stays **Paid** and adds *You paid twice (WU-PF-…). ₦15,000 is going back to … by …. Refund ref RF-….* with
   **See the refund**: the refund page shows the refund reference, amount, to, started, expected date, and *Your fee stays paid*.
   Staff A-01 shows **Paid twice** next to **Paid**; the Refunds card counts it. When the refund is processed the payment shows
   **Refunded**.
2. **Reversed** by the bank: Home shows **Reversed** in red, *Your bank took back the ₦15,000…*, **Pay ₦15,000 again** and *call
   the ODeL office*. Registration and exams are locked again; registered courses stay. Staff A-01 shows **Reversed** and the card
   counts it; A-02 explains it.

## 8. Register (R-02, R-03, R-03b, R-04, R-05b, R-05)

1. Adeola (paid) → Registration: *Register first semester courses* · *Step 1 of 2 · B.Sc. Computer Science · 200L · closes …*.
   **Already included · cannot be removed**: the compulsory courses (and any carry-over, marked *Carry-over from 2025/2026*) with a
   lock. **Electives · choose up to 3**.
2. Tick CSC 209 and MTH 211: the counter reads **18 · min 15 · max 20**, 7 courses. Tick a third elective: **That is 21 units. The
   most you can take is 20: remove an elective.** in red and **Review registration** is off. Untick all electives: *… under the
   minimum of 15. Add an elective.* Choose up to 3 only: a fourth box is disabled.
3. **Review registration** (R-04): every course with Core / Elective / Carry-over and units, the total, *These are my courses for
   2026/2027 · 1st semester.* **Submit registration** without the tick → *Tick the box to confirm these are your courses.*
4. Submit → **You are registered**, *Registered · 7 courses · 18 units*, slip `REG-26-1-0153`, the verification code, **Download
   slip (PDF)**, **Request a course change**, *Course changes are open until …*. The confirmation email arrived with the slip link.
5. The PDF (R-05): crest, *Course registration slip · 2026/2027 first semester*, student, programme · level, centre, slip number, the
   courses and total, *Verify this slip at …/verify · code …*.
6. Open the slip page link in a private window: **/verify** with the code shows *Valid slip* and the details. A wrong code →
   *We could not find a slip with this code. Check the code on the slip.*
7. Submitting again from another tab → *You have already registered for this semester. Ask for a course change instead.*

## 9. Not open (R-01), closed, late registration (R-06, R-07, R-07b, B10)

1. Set the 1st semester's registration to open next week (Academic setup). Adeola sees **Registration opens …** and the advice to pay
   before then. Home's Course registration line says *Opens … · locked until you pay* for an unpaid student.
2. Set the window to have closed yesterday with late registration until next week. A student who has paid and not registered sees
   **Registration has closed** · *Ask your centre for late registration by …* · **Ask for late registration**.
3. The form (R-06): **Send request** empty → *Choose a reason.* and *Say why you are late…*. Attach a 6 MB photo → *That file is 6 MB.
   Attach one of 5 MB or less…*; attach a Word file → *Attach a JPG, PNG or PDF file.* Attach a good photo: the form shows the file
   row (name, type, size) with **Replace** and **Remove** (C30). Send → *Your late registration request is sent.* and the request
   under **My requests** (*Waiting for a decision*, the reason, the attachment). Sending a second one → *You already asked…*.
4. Mrs Ade **declines** with a note (section 11): Adeola sees **Not approved by Mrs Bisi Ade** with the note and *You can ask again*;
   the email arrived. She asks again.
5. Mrs Ade **approves**: Adeola sees **Late registration approved by Mrs Bisi Ade** · *Register by …* (B10) above the course choice,
   and registers. The slip says late registration.
6. After the late date nobody can ask: *Registration is closed*. Put the dates back.

## 10. Course change (R-09 … R-09e)

1. Adeola (registered) → **Request a course change**: compulsory and carry-over courses are listed as staying; untick MTH 211, tick
   STA 201; the counter shows the result; **After the change** says *Drop MTH 211, add STA 201*. Reason under 10 characters keeps
   **Send for approval** off.
2. A change that breaks the limits (add two 3-unit electives) shows the over-the-maximum message and cannot be sent.
3. Send → *Your course change request is sent* and the request under My requests with *Units 18 → 18 of 20*. **Request a course
   change** is gone while one is waiting. **Cancel this request** (with a confirmation) removes it from the coordinator's queue.
4. Approved (section 11) → **Approved by Mrs Bisi Ade** · *Your registration and slip are updated*; the slip is version 2 with STA 201;
   History shows both entries; the email arrived. Declined → *Not approved* with the note; the courses stay.
5. After the course-change deadline the button is gone: *Course changes closed on …*.

## 11. Approvals (A-03, A-03c, A-03b, A-03e) as the coordinator and the ODeL admin

1. Sign in as **Mrs Bisi Ade** (centre coordinator, Akure). The menu shows Home, **Approvals**, **Registrations**. Approvals lists
   only Akure's requests, with chips **All / Late registration (n) / Course changes (n)** and *Show: Waiting for a decision*.
2. Open Adeola's change (A-03c): name, matric, programme, level, registered date, the reason, *If you approve, MTH 211 Linear Algebra
   I (3 units) is dropped and STA 201 Probability I (3 units) is added: 18 → 18 of 20 units. Adeola gets an email and a new slip.*,
   the current registration (expand), a note box. **Approve** → *Approved Adeola Okafor's course change…*.
3. A late request shows the attachment: opening it shows the file. **Decline** opens its own box (*Decline Adeola's late
   registration?* / *… course change?*, B11); the note is required (*Write a short note (5 to 500 characters)…*).
4. Approving something already decided in another tab → *This request was already approved by …*, and the page shows the decision.
5. Sign in as Ngozi: Registration → **Approvals** shows every centre; **Queue: ODeL office (no coordinator)** lists only centres with
   no coordinator this session (A-03e) with *No coordinator at this centre* on each. The director can read but has no
   Approve/Decline.
6. Another centre's coordinator never sees Akure's requests (empty queue; opening the link → not found).

## 12. Staff reports (A-01, A-02, A-07, A-07b)

1. Ngozi → **Payments** (A-01): cards Paid (with ₦ collected), Confirming (oldest), Not paid, Refunds, Reversed, Students; search
   is **live** (type 2 letters of a name, a matric number or a `WU-PF-` reference, no button); filters Centre, Status (incl. Paid
   twice), Method, Paid from/to apply at once; **Export** downloads a CSV of the filtered rows. The split never appears.
2. A student's row → A-02: fee status in words, every attempt with method, reference, status and the reason or refund, **Receipt**
   for paid ones, a link to the registration record.
3. **Registration** (A-07): *2026/2027 · 1st semester · open … · late registration until …*; cards Registered (of N who paid), Paid,
   not registered, Late requests (at centres / at the ODeL office), Course changes; tabs Students · Approvals (n) · Rules ·
   Carry-overs; Adeola listed **Registered** with 7 courses and 18 units and *Changed …* after her change; filters and live search;
   **Export** CSV.
4. Adeola's row → A-07b: courses as on the slip, slip number, version and code, history, **Download slip**, requests, carry-overs.
5. Mrs Ade's Registrations show only Akure's students.

## 13. Rules (A-05, A-05b, A-05c) and carry-overs

1. Rules: the window dates are read-only with *These dates come from Academic setup*; course changes close on (default the day after
   late registration); the fee switches; unit limits per level for **Every programme (default)** or one programme.
2. 200L minimum 22 with maximum 20 → *The minimum (22) is above the maximum (20).* in red and **Save rules** off. A maximum below the
   compulsory units → *200L compulsory courses already come to … units…*. A course-change date before late registration closes →
   refused on the field.
3. Give B.Sc. Computer Science its own 200L limits (e.g. max 18) and save: Adeola's counter now says *max 18*. **Use the default
   limits again** removes them.
4. **Carry-overs**: find a student (live search by name or matric), **Add a carry-over** (CSC 103, 2025/2026). `CSC 999` → *CSC 999
   is not in the catalogue.*; adding it twice → refused. The student sees it pinned as a carry-over. **Remove** asks first; once on a
   submitted registration it cannot be removed. **Template** and **Import CSV** with one unknown matric number → *Imported … · Row
   n: Matric number … not found*.

## 14. Move a student to another centre (A-06)

1. Ngozi → Students → a student → **Move to another centre**: From (read-only), **To**, From when (empty = today), *What happens*,
   the reason. Without a reason → *Say why the student is moving (3 to 500 characters).*
2. Move to Lagos (Ikeja) → *… is now at Lagos (Ikeja)* with **Told by email** (the student, the Akure coordinator, the Lagos
   coordinator) and **Not told** (e.g. *Lagos (Ikeja) has no coordinator in 2026/2027: the ODeL office covers it.*). The emails
   arrived. The record lists the move under **Centre moves**.
3. A future date → the move is **scheduled** (*moves on …*), with **Cancel this move** until then; a second move while one is
   scheduled → *A move to … is already scheduled. Cancel it first.* A date more than 30 days back → refused.
4. Changing the centre in the record's edit form asks *Why is the student moving?* (required) and goes through the same flow.
5. The student's pending requests now appear in the new centre's queue; Home and the slip show the new centre.

## 15. Settlement report (console)

1. Console → **Settlement**: this month by default; cards Payments, Provider, ODeL centres, Paystack charges, Provider net, Refunded;
   a row per university and one per payment (reference, university, paid, amount, provider ₦12,000, centre ₦3,000, Paystack, the
   charge the student paid, net, status). Refunded and reversed payments are included and marked.
2. Change the dates and the university: the report updates at once. **Export** downloads the rows.

## 16. Sizes, access and the console address

- Phone (360–390 px): the fee card, pay choice, transfer and USSD pages, course choice and review, approvals (list, then the request
  with **All requests** to go back) and every dialog fit the screen with nothing cut off; dialogs scroll inside with the buttons
  always visible; nothing scrolls sideways. Laptop 1440×900: no dialog runs off the bottom.
- The university's crest is there as the page appears (not after).
- Keyboard: every choice (payment method, electives, approvals) works with Tab, Space and Enter; dialogs close with Esc.
- Roles: a lecturer has none of these pages; management sees Payments only; the coordinator cannot open Rules or Carry-overs.
- On the console address, `/staff/sign-in` goes to the console's own sign-in (`/sign-in`), and after signing in you land on `/`,
  never on an address with `/console` in it.
