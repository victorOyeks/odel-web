// B2 mock (ODEL_MOCK_API=1): payments (docs/api-b2-payments.md), course registration and the centre move
// (docs/api-b2-registration.md), the provider's payment settings and the fake gateway's dev pages.
// State lives in memory per university; the shapes follow the contracts so the screens work without the API.
import type { MStudent, Uni } from "./b1-data";
import { body, csvResponse, err, invalid, json, noContent, notFound, forbidden, page, readUpload, record, signedOut, today, uid, uploadTicket, type B1Ctx } from "./b1-util";
import type { CarryOver, CentreMove, Fee, FeeStatus, PayMethod, Payment, PaymentStatus, RegCourse, RegRequest, Registration, RequestStatus, WindowState } from "@/lib/types-b2";

// ---------------------------------------------------------------- formatting

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
const longDay = (d: string) => {
  const x = asDate(d);
  return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
const shortDay = (d: string) => {
  const x = asDate(d);
  return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
};
const dayMonth = (d: string) => {
  const x = asDate(d);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
};
const lagosDay = (iso: string) => new Date(Date.parse(iso) + 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const fullName = (s: MStudent) => [s.firstName, s.otherNames, s.surname].filter(Boolean).join(" ");
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ---------------------------------------------------------------- state

interface MPayment {
  id: string;
  studentId: string;
  semesterId: string;
  reference: string;
  method: PayMethod;
  ussdBank: string | null;
  status: PaymentStatus;
  startedAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  /** The fake checkout's outcome, before the webhook lands. */
  outcome: "success" | "decline" | "close" | null;
  outcomeAt: number | null;
  failureReason: string | null;
  usedLabel: string | null;
  refund: Payment["refund"];
  reversedAt: string | null;
}

interface MFee {
  status: FeeStatus;
  paidPaymentId: string | null;
  duplicateId: string | null;
  reversal: { paymentId: string; at: string } | null;
}

interface MReg {
  id: string;
  studentId: string;
  semesterId: string;
  courseIds: string[];
  late: boolean;
  slipNumber: string;
  slipVersion: number;
  code: string;
  submittedAt: string;
  updatedAt: string | null;
  centreCode: string;
  history: NonNullable<Registration["history"]>;
}

interface MReq {
  id: string;
  kind: "LATE" | "CHANGE";
  status: RequestStatus;
  studentId: string;
  semesterId: string;
  centreCode: string;
  reasonCategory: string | null;
  reason: string;
  attachment: { key: string; fileName: string; contentType: string; size: number } | null;
  drop: string[];
  add: string[];
  unitsBefore: number;
  registerBy: string | null;
  decision: RegRequest["decision"];
  createdAt: string;
}

interface MCourse2 {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number;
  programmeCode: string;
  kind: "COMPULSORY" | "ELECTIVE";
}

export interface B2 {
  amount: number;
  centreShare: number;
  account: { bankCode: string; bankName: string; last4: string; accountName: string; subaccountCode: string; since: string; updatedBy: string } | null;
  payments: MPayment[];
  fees: Map<string, MFee>; // `${studentId}|${semesterId}`
  regs: MReg[];
  reqs: MReq[];
  carry: (CarryOver & { status: "OPEN" | "CLEARED" })[];
  levels: Record<string, { minUnits: number; maxUnits: number; maxElectives: number }>; // "default|200" or "<programmeId>|200"
  changesCloseOn: string | null;
  feeRules: { blockRegistration: boolean; blockExams: boolean; previewsWhenUnpaid: boolean };
  moves: Map<string, CentreMove[]>;
  electives: MCourse2[];
  /** Mock switches (GET /api/v1/dev/mock-b2?window=LATE): the registration window state for the demo. */
  windowState: WindowState;
}

interface ProviderSettings {
  /** undefined = not set from the console (the university's own seed applies). */
  account?: B2["account"];
  amount?: number;
  centreShare?: number;
}
const g = globalThis as unknown as { __odelB2?: Map<Uni, B2>; __odelB2Accounts?: Map<string, ProviderSettings> };

function seedPayment(p: Partial<MPayment> & { studentId: string; reference: string; status: PaymentStatus; startedAt: string }): MPayment {
  return {
    id: uid(),
    semesterId: "sem-2627-1",
    method: "CARD",
    ussdBank: null,
    paidAt: null,
    expiresAt: null,
    sentAt: null,
    outcome: null,
    outcomeAt: null,
    failureReason: null,
    usedLabel: null,
    refund: null,
    reversedAt: null,
    ...p,
  };
}

export function b2For(u: Uni, demo: boolean): B2 {
  g.__odelB2 ??= new Map();
  let b = g.__odelB2.get(u);
  if (b) return b;
  b = {
    amount: 15000,
    centreShare: 3000,
    account: null,
    payments: [],
    fees: new Map(),
    regs: [],
    reqs: [],
    carry: [],
    levels: {},
    changesCloseOn: null,
    feeRules: { blockRegistration: true, blockExams: true, previewsWhenUnpaid: true },
    moves: new Map(),
    electives: [],
    windowState: "OPEN",
  };
  if (demo) {
    b.account = { bankCode: "058", bankName: "Guaranty Trust Bank", last4: "4521", accountName: "WESLEY UNIVERSITY ODEL CENTRE", subaccountCode: "ACCT_8f4k2m9x1q", since: "2026-11-21T10:00:00+01:00", updatedBy: "Chuka Obi" };
    b.electives = [
      { id: "c-csc209", code: "CSC 209", title: "Web Technologies", units: 2, level: 200, semester: 1, programmeCode: "BSC-CSC-ODL", kind: "ELECTIVE" },
      { id: "c-mth211", code: "MTH 211", title: "Linear Algebra I", units: 3, level: 200, semester: 1, programmeCode: "BSC-CSC-ODL", kind: "ELECTIVE" },
      { id: "c-sta201", code: "STA 201", title: "Probability I", units: 3, level: 200, semester: 1, programmeCode: "BSC-CSC-ODL", kind: "ELECTIVE" },
      { id: "c-csc211", code: "CSC 211", title: "Introduction to Databases", units: 3, level: 200, semester: 1, programmeCode: "BSC-CSC-ODL", kind: "ELECTIVE" },
      { id: "c-csc103", code: "CSC 103", title: "Introduction to Programming", units: 3, level: 100, semester: 1, programmeCode: "BSC-CSC-ODL", kind: "COMPULSORY" },
    ];
    // Chidinma paid and registered; Halima's transfer is confirming; Grace paid twice; Sade's card payment was reversed.
    const chi = seedPayment({ studentId: "st-3", reference: "WU-PF-88301", status: "PAID", startedAt: "2026-11-24T15:00:00+01:00", paidAt: "2026-11-24T15:02:00+01:00", usedLabel: "Debit card · Access card ending 1180" });
    const hal = seedPayment({ studentId: "st-4", reference: "WU-PF-88342", status: "CONFIRMING", method: "BANK_TRANSFER", startedAt: "2026-11-24T16:20:00+01:00", sentAt: "2026-11-24T16:24:00+01:00", expiresAt: "2026-11-24T16:50:00+01:00" });
    const gr1 = seedPayment({ studentId: "st-6", reference: "WU-PF-88213", status: "PAID", startedAt: "2026-11-24T14:28:00+01:00", paidAt: "2026-11-24T14:28:00+01:00", usedLabel: "Debit card · GTBank card ending 4412" });
    const gr2 = seedPayment({
      studentId: "st-6",
      reference: "WU-PF-88219",
      status: "REFUNDING",
      startedAt: "2026-11-24T14:31:00+01:00",
      paidAt: "2026-11-24T14:31:00+01:00",
      usedLabel: "Debit card · GTBank card ending 4412",
      refund: { reference: "RF-3312", amount: 15000, amountLabel: "₦15,000", status: "PENDING", startedAt: "2026-11-24T15:02:00+01:00", processedAt: null, expectedBy: "2026-12-18", to: "GTBank card ending 4412", reason: "You paid the platform fee twice" },
    });
    const sade = seedPayment({ studentId: "st-7", reference: "WU-PF-88105", status: "REVERSED", method: "BANK_TRANSFER", startedAt: "2026-11-23T11:42:00+01:00", paidAt: "2026-11-23T11:44:00+01:00", reversedAt: "2026-11-26T10:00:00+01:00", usedLabel: "Bank transfer (Wema)" });
    b.payments.push(chi, hal, gr1, gr2, sade);
    b.fees.set("st-3|sem-2627-1", { status: "PAID", paidPaymentId: chi.id, duplicateId: null, reversal: null });
    b.fees.set("st-4|sem-2627-1", { status: "CONFIRMING", paidPaymentId: null, duplicateId: null, reversal: null });
    b.fees.set("st-6|sem-2627-1", { status: "PAID", paidPaymentId: gr1.id, duplicateId: gr2.id, reversal: null });
    b.fees.set("st-7|sem-2627-1", { status: "REVERSED", paidPaymentId: null, duplicateId: null, reversal: { paymentId: sade.id, at: "2026-11-26T10:00:00+01:00" } });
    b.carry.push({ id: uid(), studentId: "st-3", courseId: "c-csc103", code: "CSC 103", title: "Introduction to Programming", units: 3, semester: 1, fromSession: "2025/2026", source: "ADMIN", status: "OPEN", createdAt: "2026-11-25T10:00:00+01:00", createdBy: "Ngozi Adebayo" });
    b.regs.push({
      id: uid(),
      studentId: "st-3",
      semesterId: "sem-2627-1",
      courseIds: ["c-csc201", "c-csc203", "c-csc205", "c-csc207", "c-gst201", "c-csc103", "c-csc209"],
      late: false,
      slipNumber: "REG-26-1-0201",
      slipVersion: 1,
      code: "R7K2-9X1M",
      submittedAt: "2026-11-25T10:12:00+01:00",
      updatedAt: null,
      centreCode: "OND",
      history: [{ at: "2026-11-25T10:12:00+01:00", action: "SUBMITTED", summary: "Registered 7 courses, 18 units", by: "Chidinma Okeke", slipVersion: 1 }],
    });
  }
  g.__odelB2.set(u, b);
  return b;
}

/** The provider's view of a university with no B2 state yet (accounts set from the console). */
function accounts() {
  g.__odelB2Accounts ??= new Map();
  return g.__odelB2Accounts;
}

// ---------------------------------------------------------------- semesters and windows

function currentSemester(u: Uni) {
  const s = [...u.sessions].sort((a, b) => b.name.localeCompare(a.name)).find((x) => x.status !== "ARCHIVED") ?? u.sessions[0];
  if (!s) return null;
  const sem = s.semesters.find((x) => x.number === 1) ?? s.semesters[0];
  if (!sem) return null;
  return { id: sem.id, sessionId: s.id, sessionName: s.name, number: sem.number, name: sem.number === 1 ? "1st semester" : "2nd semester", label: `${s.name} · ${sem.number === 1 ? "1st" : "2nd"} semester` };
}
const semView = (sem: NonNullable<ReturnType<typeof currentSemester>>) => ({ id: sem.id, sessionId: sem.sessionId, sessionName: sem.sessionName, number: sem.number, label: sem.label, name: sem.number === 1 ? "First semester" : "Second semester" });

/** The demo window follows the switch, with dates around today so every label reads true. */
function windowOf(b: B2) {
  const t = today();
  const st = b.windowState;
  const d =
    st === "NOT_OPEN"
      ? { opensOn: addDays(t, 6), closesOn: addDays(t, 20), lateClosesOn: addDays(t, 30) }
      : st === "LATE"
        ? { opensOn: addDays(t, -20), closesOn: addDays(t, -2), lateClosesOn: addDays(t, 8) }
        : st === "CLOSED"
          ? { opensOn: addDays(t, -40), closesOn: addDays(t, -20), lateClosesOn: addDays(t, -10) }
          : { opensOn: addDays(t, -5), closesOn: addDays(t, 13), lateClosesOn: addDays(t, 23) };
  const changesCloseOn = b.changesCloseOn ?? addDays(d.lateClosesOn, 1);
  const label =
    st === "NOT_SET"
      ? "Not set up yet"
      : st === "NOT_OPEN"
        ? `Opens ${longDay(d.opensOn)}`
        : st === "OPEN"
          ? `Open until ${longDay(d.closesOn)}`
          : st === "LATE"
            ? `Closed on ${shortDay(d.closesOn)} · late registration until ${shortDay(d.lateClosesOn)}`
            : `Closed on ${shortDay(d.lateClosesOn)}`;
  return { state: st, ...d, changesCloseOn, label, registerBy: st === "OPEN" ? d.closesOn : null };
}

// ---------------------------------------------------------------- payments: views

function feeRec(b: B2, studentId: string, semesterId: string): MFee {
  const k = `${studentId}|${semesterId}`;
  let f = b.fees.get(k);
  if (!f) {
    f = { status: "NOT_PAID", paidPaymentId: null, duplicateId: null, reversal: null };
    b.fees.set(k, f);
  }
  return f;
}

const METHOD_LABEL: Record<PayMethod, string> = { CARD: "Debit card", BANK_TRANSFER: "Bank transfer", USSD: "USSD" };
const P_STATUS: Record<PaymentStatus, string> = {
  PENDING: "Waiting for you",
  CONFIRMING: "Confirming",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDING: "Refund on its way",
  REFUNDED: "Refunded",
  REVERSED: "Reversed by the bank",
};
const USSD: Record<string, { name: string; code: string }> = {
  GTBANK: { name: "GTBank", code: "*737#" },
  UBA: { name: "UBA", code: "*919#" },
  STERLING: { name: "Sterling", code: "*822#" },
  ZENITH: { name: "Zenith", code: "*966#" },
};

/** Mock time: a confirmed checkout's webhook lands 4 s later; a sent transfer or dialled code is confirmed 15 s after "I have…". */
function settle(b: B2, p: MPayment) {
  const t = Date.now();
  if (p.status === "CONFIRMING" && p.outcome === "success" && p.outcomeAt && t - p.outcomeAt > 4000) markPaid(b, p);
  else if (p.status === "CONFIRMING" && p.sentAt && !p.outcome && t - Date.parse(p.sentAt) > 15_000 && t - Date.parse(p.sentAt) < 3 * 3600_000) markPaid(b, p);
  if (p.status === "PENDING" && p.expiresAt && Date.parse(p.expiresAt) < t && p.method !== "CARD") p.status = "EXPIRED";
}

function markPaid(b: B2, p: MPayment) {
  const f = feeRec(b, p.studentId, p.semesterId);
  p.paidAt = now();
  p.usedLabel ??= p.method === "CARD" ? "Debit card · GTBank card ending 4412" : p.method === "USSD" ? `USSD · ${USSD[p.ussdBank ?? "GTBANK"]?.name ?? "GTBank"}` : "Bank transfer (Wema)";
  if (f.status === "PAID" && f.paidPaymentId && f.paidPaymentId !== p.id) {
    p.status = "REFUNDING";
    p.refund = { reference: `RF-${Math.floor(1000 + Math.random() * 9000)}`, amount: b.amount, amountLabel: naira(b.amount), status: "PENDING", startedAt: now(), processedAt: null, expectedBy: addDays(today(), 14), to: p.usedLabel.replace(/^Debit card · /, ""), reason: "You paid the platform fee twice" };
    f.duplicateId = p.id;
    return;
  }
  p.status = "PAID";
  f.status = "PAID";
  f.paidPaymentId = p.id;
  f.reversal = null;
}

function paymentView(b: B2, p: MPayment, sem: ReturnType<typeof currentSemester>): Payment {
  settle(b, p);
  const label = sem?.label ?? "2026/2027 · 1st semester";
  const message =
    p.status === "PENDING"
      ? p.outcome === "close"
        ? "You closed the payment page before paying. Nothing was charged."
        : p.method === "BANK_TRANSFER"
          ? "Send the exact amount to the account below, then tell us you have sent it."
          : p.method === "USSD"
            ? "Dial the code from the phone number linked to your bank account, then tell us you have dialled it."
            : "Finish paying on the secure payment page."
      : p.status === "CONFIRMING"
        ? "We are confirming your payment with your bank. Do not pay again: this page updates by itself."
        : p.status === "PAID"
          ? `Your platform fee for ${label} is paid. Registration is open to you.`
          : p.status === "FAILED"
            ? p.failureReason ?? "The payment did not go through. Nothing was charged."
            : p.status === "EXPIRED"
              ? "This payment ran out of time and nothing arrived. Start again: you get a new account number or code."
              : p.status === "CANCELLED"
                ? "You chose another way to pay. Nothing was charged on this one."
                : p.status === "REFUNDING"
                  ? `You paid twice. ${naira(b.amount)} is going back to ${p.refund?.to ?? "your account"}.`
                  : p.status === "REFUNDED"
                    ? `${naira(b.amount)} was refunded to ${p.refund?.to ?? "your account"}.`
                    : "Your bank took this payment back. Registration and exams are locked again.";
  return {
    id: p.id,
    feeId: `${p.studentId}|${p.semesterId}`,
    label,
    reference: p.reference,
    method: p.method,
    methodLabel: p.usedLabel ?? (p.method === "USSD" && p.ussdBank ? `USSD · ${USSD[p.ussdBank]?.name}` : METHOD_LABEL[p.method]),
    amount: b.amount,
    amountLabel: naira(b.amount),
    status: p.status,
    statusLabel: P_STATUS[p.status],
    message,
    startedAt: p.startedAt,
    paidAt: p.paidAt,
    expiresAt: p.expiresAt,
    checkout: p.method === "CARD" ? { authorizationUrl: `/api/v1/dev/payments/checkout/${p.reference}` } : null,
    ussd: p.method === "USSD" && p.ussdBank ? { bank: USSD[p.ussdBank].name, code: `${USSD[p.ussdBank].code.replace("#", "")}*000*${p.reference.slice(-4)}#`, expiresAt: p.expiresAt ?? "" } : null,
    transfer:
      p.method === "BANK_TRANSFER"
        ? { bankName: "Paystack-Titan", accountNumber: `99${p.reference.replace(/\D/g, "").padStart(8, "0").slice(-8)}`, accountName: "Wesley University ODeL / Paystack", amount: b.amount, amountLabel: `${naira(b.amount)}.00`, expiresAt: p.expiresAt ?? "", note: `Send exactly ${naira(b.amount)}.00 in one transfer. This account works for 30 minutes.` }
        : null,
    failureReason: p.failureReason,
    receiptUrl: p.status === "PAID" || p.status === "REFUNDING" || p.status === "REFUNDED" || p.status === "REVERSED" ? `/api/v1/payments/${p.id}/receipt.pdf` : null,
    refund: p.refund,
  };
}

function feeView(b: B2, u: Uni, studentId: string): Fee | null {
  const sem = currentSemester(u);
  if (!sem) return null;
  const f = feeRec(b, studentId, sem.id);
  const mine = b.payments.filter((p) => p.studentId === studentId && p.semesterId === sem.id);
  mine.forEach((p) => settle(b, p));
  const open = mine.filter((p) => p.status === "PENDING" || p.status === "CONFIRMING").sort((a, z) => z.startedAt.localeCompare(a.startedAt))[0] ?? null;
  let status: FeeStatus = f.status;
  if (status !== "PAID" && open?.status === "CONFIRMING") status = "CONFIRMING";
  if (status === "CONFIRMING" && !open) status = "NOT_PAID";
  const paid = f.paidPaymentId ? b.payments.find((p) => p.id === f.paidPaymentId) : null;
  const dup = f.duplicateId ? b.payments.find((p) => p.id === f.duplicateId) : null;
  const rev = f.reversal ? b.payments.find((p) => p.id === f.reversal!.paymentId) : null;
  const message = {
    NOT_PAID: "Pay your platform fee to register your courses and sit exams.",
    CONFIRMING: "We are waiting for your bank to confirm your payment. Do not pay again.",
    PAID: `Paid on ${paid?.paidAt ? longDay(lagosDay(paid.paidAt)) : "—"}. Registration is open to you.`,
    REFUNDED: "Your payment was refunded. Pay again to register your courses and sit exams.",
    REVERSED: `Your bank took back the ${naira(b.amount)} you paid on ${rev?.paidAt ? dayMonth(lagosDay(rev.paidAt)) : "—"}. Registration and exams are locked. Pay again or call the ODeL office.`,
  }[status];
  const statusLabel = { NOT_PAID: "Not paid", CONFIRMING: "Confirming", PAID: "Paid", REFUNDED: "Refunded", REVERSED: "Reversed" }[status];
  const actions: Fee["actions"] = status === "PAID" ? ["DOWNLOAD_RECEIPT", "VIEW_PAYMENTS"] : status === "CONFIRMING" ? ["CHECK_STATUS", "VIEW_PAYMENTS"] : ["PAY", "VIEW_PAYMENTS"];
  return {
    id: `${studentId}|${sem.id}`,
    semesterId: sem.id,
    sessionId: sem.sessionId,
    sessionName: sem.sessionName,
    semesterNumber: sem.number,
    semesterName: sem.name,
    label: sem.label,
    amount: b.amount,
    amountLabel: naira(b.amount),
    status,
    statusLabel,
    message,
    locked: status !== "PAID",
    openPayment: open ? paymentView(b, open, sem) : null,
    paidPayment: paid && paid.paidAt ? { id: paid.id, reference: paid.reference, paidAt: paid.paidAt, method: paid.method, methodLabel: paid.usedLabel ?? METHOD_LABEL[paid.method], receiptUrl: `/api/v1/payments/${paid.id}/receipt.pdf` } : null,
    duplicate: dup ? { paymentId: dup.id, reference: dup.reference, paidAt: dup.paidAt ?? dup.startedAt, amount: b.amount, amountLabel: naira(b.amount), refund: dup.refund } : null,
    reversal: rev && f.reversal ? { paymentId: rev.id, reference: rev.reference, reversedAt: f.reversal.at, message: `Your bank reversed payment ${rev.reference}. Registration and exams are locked until the fee is paid again. Your registered courses are kept.` } : null,
    methods: [
      { key: "CARD", label: "Debit card" },
      { key: "BANK_TRANSFER", label: "Bank transfer" },
      { key: "USSD", label: "USSD" },
    ],
    ussdBanks: Object.entries(USSD).map(([key, v]) => ({ key, ...v })),
    ussdOtherBanks: "USSD works with GTBank, UBA, Sterling and Zenith. Another bank? Pay by card or transfer.",
    actions,
  };
}

/** A small, valid one-page PDF with lines of text (receipts and slips). */
function pdf(name: string, lines: string[]) {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/₦/g, "NGN ").replace(/[^\x20-\x7e]/g, "-");
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Response(out, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"` } });
}

// ---------------------------------------------------------------- registration helpers

function courseCatalogue(u: Uni, b: B2): MCourse2[] {
  const fromB1: MCourse2[] = u.courses.flatMap((c) =>
    c.offeredTo.map((o) => ({ id: c.id, code: c.code, title: c.title, units: c.units, level: c.level, semester: c.semester, programmeCode: u.programmes.find((p) => p.id === o.programmeId)?.code ?? "", kind: o.kind as "COMPULSORY" | "ELECTIVE" })),
  );
  return [...fromB1, ...b.electives];
}
const courseById = (u: Uni, b: B2, id: string) => courseCatalogue(u, b).find((c) => c.id === id);

function limitsFor(u: Uni, b: B2, s: MStudent) {
  const prog = u.programmes.find((p) => p.code === s.programmeCode);
  return b.levels[`${prog?.id}|${s.level}`] ?? b.levels[`default|${s.level}`] ?? { minUnits: 15, maxUnits: 20, maxElectives: 3 };
}

function offered(u: Uni, b: B2, s: MStudent, semNumber: number) {
  const all = courseCatalogue(u, b).filter((c) => c.programmeCode === s.programmeCode && c.level === s.level && c.semester === semNumber);
  const carry = b.carry.filter((c) => c.studentId === s.id && c.status === "OPEN" && c.semester === semNumber);
  return {
    compulsory: all.filter((c) => c.kind === "COMPULSORY"),
    electives: all.filter((c) => c.kind === "ELECTIVE"),
    carry,
  };
}

function check(u: Uni, b: B2, s: MStudent, semNumber: number, electiveIds: string[]) {
  const o = offered(u, b, s, semNumber);
  const lim = limitsFor(u, b, s);
  const locked = [...o.compulsory.map((c) => c.units), ...o.carry.map((c) => c.units)].reduce((a, x) => a + x, 0);
  const problems: { code: string; message: string }[] = [];
  const picked = electiveIds.map((id) => o.electives.find((e) => e.id === id) ?? { id, code: courseById(u, b, id)?.code ?? "That course", units: 0, bad: true });
  picked.filter((p) => "bad" in p).forEach((p) => problems.push({ code: "not_an_elective", message: `${p.code} is not an elective for your programme this semester.` }));
  const total = locked + picked.reduce((a, p) => a + p.units, 0);
  const count = o.compulsory.length + o.carry.length + picked.length;
  if (locked > lim.maxUnits) problems.push({ code: "rules_conflict", message: `Your compulsory and carry-over courses come to ${locked} units, over the maximum of ${lim.maxUnits}. Contact your study centre: the ODeL office needs to adjust the unit limits.` });
  else if (total > lim.maxUnits) problems.push({ code: "over_max", message: `That is ${total} units. The most you can take is ${lim.maxUnits}: remove an elective.` });
  if (total < lim.minUnits) problems.push({ code: "under_min", message: `That is ${total} units, ${lim.minUnits - total} under the minimum of ${lim.minUnits}. Add an elective.` });
  if (picked.length > lim.maxElectives) problems.push({ code: "too_many_electives", message: `Choose up to ${lim.maxElectives} electives. You picked ${picked.length}.` });
  return { totalUnits: total, courseCount: count, electiveCount: picked.length, ok: !problems.length, problems, counter: `${total} · min ${lim.minUnits} · max ${lim.maxUnits}` };
}

function regView(u: Uni, b: B2, r: MReg, withHistory = true): Registration {
  const sem = currentSemester(u)!;
  const carryIds = new Set(b.carry.filter((c) => c.studentId === r.studentId).map((c) => c.courseId));
  const courses = r.courseIds
    .map((id) => courseById(u, b, id))
    .filter(Boolean)
    .map((c) => {
      const kind = carryIds.has(c!.id) ? "CARRY_OVER" : c!.kind;
      return { courseId: c!.id, code: c!.code, title: c!.title, units: c!.units, kind, kindLabel: kind === "CARRY_OVER" ? "Carry-over" : kind === "ELECTIVE" ? "Elective" : "Core" } as RegCourse;
    });
  const w = windowOf(b);
  const centre = u.centres.find((c) => c.code === r.centreCode);
  return {
    id: r.id,
    semester: semView(sem),
    status: "REGISTERED",
    late: r.late,
    slipNumber: r.slipNumber,
    slipVersion: r.slipVersion,
    verificationCode: r.code,
    courses,
    courseCount: courses.length,
    totalUnits: courses.reduce((a, c) => a + c.units, 0),
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
    changesCloseOn: w.changesCloseOn,
    canRequestChange: today() <= w.changesCloseOn && !b.reqs.some((q) => q.studentId === r.studentId && q.kind === "CHANGE" && q.status === "PENDING"),
    centre: centre ? { id: centre.id, code: centre.code, name: centre.name } : null,
    ...(withHistory ? { history: r.history } : {}),
  };
}

const REASONS: Record<string, string> = { MEDICAL: "Medical", BEREAVEMENT: "Bereavement", WORK: "Work", TRAVEL: "Travel", FEES: "Fees", TECHNICAL: "Technical problem", OTHER: "Other" };
const REQ_STATUS: Record<RequestStatus, string> = { PENDING: "Waiting for a decision", APPROVED: "Approved", DECLINED: "Declined", CANCELLED: "Cancelled" };

function hasCoordinator(u: Uni, centreCode: string) {
  const c = u.centres.find((x) => x.code === centreCode);
  return !!(c && Object.values(u.staffing).some((s) => s.centres[c.id]));
}

function reqView(u: Uni, b: B2, q: MReq, withReg = false): RegRequest {
  const s = u.students.find((x) => x.id === q.studentId)!;
  const sem = currentSemester(u)!;
  const centre = u.centres.find((c) => c.code === q.centreCode);
  const c2 = (id: string) => {
    const c = courseById(u, b, id);
    return { courseId: id, code: c?.code ?? "?", title: c?.title ?? "", units: c?.units ?? 0, kind: (c?.kind ?? "ELECTIVE") as RegCourse["kind"] };
  };
  const drop = q.drop.map(c2);
  const add = q.add.map(c2);
  const after = q.unitsBefore - drop.reduce((a, c) => a + c.units, 0) + add.reduce((a, c) => a + c.units, 0);
  const reg = b.regs.find((r) => r.studentId === q.studentId && r.semesterId === q.semesterId);
  const summary = [drop.length ? `Drop ${drop.map((c) => c.code).join(", ")}` : "", add.length ? `add ${add.map((c) => c.code).join(", ")}` : ""].filter(Boolean).join(", ");
  return {
    id: q.id,
    kind: q.kind,
    status: q.status,
    statusLabel: REQ_STATUS[q.status],
    semester: semView(sem),
    student: { id: s.id, matricNumber: s.matricNumber, fullName: fullName(s), programme: u.programmes.find((p) => p.code === s.programmeCode)?.name ?? s.programmeCode, level: s.level, levelLabel: `${s.level}L` },
    centre: centre ? { id: centre.id, name: centre.name, hasCoordinator: hasCoordinator(u, centre.code) } : null,
    reasonCategory: q.reasonCategory,
    reasonCategoryLabel: q.reasonCategory ? REASONS[q.reasonCategory] ?? q.reasonCategory : null,
    reason: q.reason,
    attachment: q.attachment ? { fileName: q.attachment.fileName, size: q.attachment.size, sizeLabel: sizeLabel(q.attachment.size), contentType: q.attachment.contentType, type: q.attachment.fileName.split(".").pop()?.toUpperCase() ?? "FILE" } : null,
    change: q.kind === "CHANGE" ? { drop, add, unitsBefore: q.unitsBefore, unitsAfter: after, maxUnits: limitsFor(u, b, s).maxUnits, summary: summary.charAt(0).toUpperCase() + summary.slice(1) } : null,
    registerBy: q.registerBy,
    decision: q.decision,
    createdAt: q.createdAt,
    registeredOn: reg ? lagosDay(reg.submittedAt) : null,
    ...(withReg ? { registration: reg ? regView(u, b, reg) : null } : {}),
  };
}

function slipNumberFor(b: B2, s: MStudent, semNumber: number) {
  const base = `REG-${today().slice(2, 4)}-${semNumber}-${s.matricNumber.split("/").pop()}`;
  let n = base;
  for (let i = 2; b.regs.some((r) => r.slipNumber === n); i++) n = `${base}-${i}`;
  return n;
}

function regMe(u: Uni, b: B2, s: MStudent) {
  const sem = currentSemester(u);
  const w = windowOf(b);
  const fee = sem ? feeView(b, u, s.id) : null;
  const feeStatus = !b.feeRules.blockRegistration ? "NOT_REQUIRED" : fee?.status === "PAID" ? "PAID" : fee?.status === "CONFIRMING" ? "CONFIRMING" : "NOT_PAID";
  const reg = sem ? b.regs.find((r) => r.studentId === s.id && r.semesterId === sem.id) : undefined;
  const reqs = b.reqs.filter((q) => q.studentId === s.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
  const late = reqs.find((q) => q.kind === "LATE");
  const change = reqs.find((q) => q.kind === "CHANGE");
  const approvedLate = late?.status === "APPROVED" && late.registerBy && today() <= late.registerBy;
  const centre = u.centres.find((c) => c.code === s.centreCode)!;
  const prog = u.programmes.find((p) => p.code === s.programmeCode)!;
  let blocked: { code: string; message: string } | null = null;
  if (s.status === "SUSPENDED") blocked = { code: "suspended", message: "Your account is suspended. Contact the ODeL office." };
  else if (!sem || w.state === "NOT_SET") blocked = { code: "not_set", message: "Registration for this semester is not set up yet. Check back later." };
  else if (reg) blocked = { code: "already_registered", message: "You have registered for this semester." };
  else if (w.state === "NOT_OPEN") blocked = { code: "not_open", message: `Registration opens ${longDay(w.opensOn)}.` };
  else if (feeStatus === "NOT_PAID") blocked = { code: "fee_not_paid", message: `Pay the ${naira(b.amount)} platform fee for ${sem.label} first. Registration opens as soon as it is confirmed.` };
  else if (feeStatus === "CONFIRMING") blocked = { code: "fee_confirming", message: "We are confirming your payment. Do not pay again: registration opens as soon as it is confirmed." };
  else if (w.state === "LATE" && !approvedLate)
    blocked = late?.status === "PENDING" ? { code: "late_request_pending", message: "Your late registration request is waiting for a decision. We email you when it is decided." } : { code: "late_request_needed", message: `Registration closed on ${shortDay(w.closesOn)}. Ask your centre for late registration by ${shortDay(w.lateClosesOn)}.` };
  else if (w.state === "CLOSED" && !approvedLate) blocked = { code: "closed", message: `Registration closed on ${shortDay(w.lateClosesOn)}. Contact your study centre.` };
  return {
    student: { id: s.id, matricNumber: s.matricNumber, fullName: fullName(s), programme: { id: prog.id, code: prog.code, name: prog.name }, level: s.level, levelLabel: `${s.level}L`, centre: { id: centre.id, code: centre.code, name: centre.name } },
    semester: sem ? semView(sem) : null,
    window: { ...w, registerBy: approvedLate ? late!.registerBy : w.registerBy },
    fee: sem ? { required: b.feeRules.blockRegistration, status: feeStatus, paid: feeStatus === "PAID", label: `Platform fee · ${sem.label}`, payPath: "/payments" } : null,
    canRegister: !blocked,
    blocked,
    registration: reg ? regView(u, b, reg, false) : null,
    lateRequest: late ? reqView(u, b, late) : null,
    changeRequest: change ? reqView(u, b, change) : null,
    limits: limitsFor(u, b, s),
  };
}

// ---------------------------------------------------------------- staff helpers

const isAdmin = (ctx: B1Ctx) => ctx.staff?.role === "ODEL_ADMIN";
const canReadPayments = (ctx: B1Ctx) => ["ODEL_ADMIN", "ODEL_DIRECTOR", "MANAGEMENT"].includes(ctx.staff?.role ?? "");
const isCoordinator = (ctx: B1Ctx) => ctx.staff?.role === "CENTRE_COORDINATOR";
/** The mock coordinator (multi-role persona) coordinates Akure. */
const coordCentres = (ctx: B1Ctx) => (isCoordinator(ctx) ? ["AKR"] : null);

function payRow(u: Uni, b: B2, s: MStudent) {
  const sem = currentSemester(u)!;
  const fee = feeView(b, u, s.id)!;
  const mine = b.payments.filter((p) => p.studentId === s.id && p.semesterId === sem.id).sort((a, z) => z.startedAt.localeCompare(a.startedAt));
  const last = fee.paidPayment ? mine.find((p) => p.id === fee.paidPayment!.id) : mine[0];
  let status = fee.status as string;
  if (status === "NOT_PAID" && last?.status === "FAILED") status = "FAILED";
  const label: Record<string, string> = { PAID: "Paid", CONFIRMING: "Confirming", NOT_PAID: "Not paid", FAILED: "Failed", REFUNDED: "Refunded", REVERSED: "Reversed" };
  const centre = u.centres.find((c) => c.code === s.centreCode);
  const prog = u.programmes.find((p) => p.code === s.programmeCode);
  return {
    studentId: s.id,
    fullName: fullName(s),
    matricNumber: s.matricNumber,
    centre: centre ? { code: centre.code, name: centre.name, shortName: centre.shortName } : null,
    programme: prog ? { code: prog.code, name: prog.name } : null,
    level: s.level,
    status,
    statusLabel: label[status],
    paidTwice: !!fee.duplicate,
    method: last?.method ?? null,
    methodLabel: last ? (last.method === "CARD" ? "Card" : last.method === "USSD" ? "USSD" : "Bank transfer") : null,
    reference: last?.reference ?? null,
    date: last ? last.paidAt ?? last.startedAt : null,
    paymentId: last?.id ?? null,
  };
}

function payRows(ctx: B1Ctx, b: B2) {
  const u = ctx.uni;
  const q = (ctx.url.searchParams.get("q") ?? "").trim().toLowerCase();
  const centre = ctx.url.searchParams.get("centre") ?? "";
  const status = ctx.url.searchParams.get("status") ?? "";
  const method = ctx.url.searchParams.get("method") ?? "";
  const from = ctx.url.searchParams.get("from") ?? "";
  const to = ctx.url.searchParams.get("to") ?? "";
  return u.students
    .map((s) => payRow(u, b, s))
    .filter((r) => !q || r.fullName.toLowerCase().includes(q) || r.matricNumber.toLowerCase().includes(q) || (r.reference ?? "").toLowerCase().includes(q))
    .filter((r) => !centre || r.centre?.code === centre)
    .filter((r) => !status || (status === "PAID_TWICE" ? r.paidTwice : r.status === status))
    .filter((r) => !method || r.method === method)
    .filter((r) => (!from && !to) || (r.date && (!from || lagosDay(r.date) >= from) && (!to || lagosDay(r.date) <= to)))
    .sort((a, z) => (a.date && z.date ? z.date.localeCompare(a.date) : a.date ? -1 : z.date ? 1 : a.matricNumber.localeCompare(z.matricNumber)));
}

function regRow(u: Uni, b: B2, s: MStudent) {
  const sem = currentSemester(u)!;
  const reg = b.regs.find((r) => r.studentId === s.id && r.semesterId === sem.id);
  const fee = feeView(b, u, s.id)!;
  const pendingLate = b.reqs.some((q) => q.studentId === s.id && q.kind === "LATE" && q.status === "PENDING");
  const v = reg ? regView(u, b, reg, false) : null;
  const status = reg ? "REGISTERED" : pendingLate ? "LATE_REQUEST" : fee.status === "PAID" ? "PAID_NOT_REGISTERED" : fee.status === "CONFIRMING" ? "FEE_CONFIRMING" : "NOT_PAID";
  const label: Record<string, string> = { REGISTERED: "Registered", LATE_REQUEST: "Late request", PAID_NOT_REGISTERED: "Paid, not registered", FEE_CONFIRMING: "Fee confirming", NOT_PAID: "Not paid" };
  const prog = u.programmes.find((p) => p.code === s.programmeCode);
  const centre = u.centres.find((c) => c.code === s.centreCode);
  return {
    studentId: s.id,
    fullName: fullName(s),
    matricNumber: s.matricNumber,
    programme: prog ? { id: prog.id, code: prog.code, name: prog.name } : null,
    level: s.level,
    centre: centre ? { id: centre.id, code: centre.code, name: centre.name } : null,
    courseCount: v?.courseCount ?? null,
    units: v?.totalUnits ?? null,
    submittedAt: reg?.submittedAt ?? null,
    changedAt: reg?.updatedAt ?? null,
    registrationId: reg?.id ?? null,
    status,
    statusLabel: label[status],
    feeStatus: fee.status,
  };
}

function moveView(u: Uni, m: CentreMove) {
  return m;
}

// ---------------------------------------------------------------- the route

export async function b2Route(ctx: B1Ctx, opts: { demo: boolean; tenantId: string }): Promise<Response | null> {
  const { path, method, url, uni: u } = ctx;
  const b = b2For(u, opts.demo);
  const ps = accounts().get(opts.tenantId);
  if (ps?.account !== undefined) b.account = ps.account;
  if (ps?.amount !== undefined) b.amount = ps.amount;
  if (ps?.centreShare !== undefined) b.centreShare = ps.centreShare;
  let m: RegExpMatchArray | null;

  // ---- dev: fake checkout and switches (browser navigation, no session needed)
  if (method === "GET" && path === "/dev/mock-b2") {
    const w = url.searchParams.get("window");
    if (w && ["NOT_SET", "NOT_OPEN", "OPEN", "LATE", "CLOSED"].includes(w)) b.windowState = w as WindowState;
    return json(200, { window: b.windowState });
  }
  if (method === "GET" && (m = path.match(/^\/dev\/payments\/checkout\/([^/]+)(?:\/(success|decline|close))?$/))) {
    const p = b.payments.find((x) => x.reference === m![1]);
    if (!p) return new Response("Unknown payment", { status: 404 });
    if (m[2]) {
      p.outcome = m[2] as MPayment["outcome"];
      p.outcomeAt = Date.now();
      if (m[2] === "success") p.status = "CONFIRMING";
      if (m[2] === "decline") {
        p.status = "FAILED";
        p.failureReason = "Your bank declined the card (insufficient funds). Try another card or pay by transfer.";
        p.usedLabel = "Debit card · Verve card ending 4417";
      }
      return new Response(null, { status: 302, headers: { location: `/payments/return?reference=${p.reference}` } });
    }
    const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Test checkout</title><body style="font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px"><h1>Test checkout</h1><p>Stand-in for Paystack. ${p.reference} · ${naira(b.amount)}</p><p><a href="/api/v1/dev/payments/checkout/${p.reference}/success">Pay with test card</a></p><p><a href="/api/v1/dev/payments/checkout/${p.reference}/decline">Decline the card</a></p><p><a href="/api/v1/dev/payments/checkout/${p.reference}/close">Close checkout</a></p></body>`;
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (method === "POST" && (m = path.match(/^\/dev\/payments\/([^/]+)\/simulate$/))) {
    const p = b.payments.find((x) => x.reference === m![1]);
    if (!p) return notFound("that payment");
    const o = String((await body(ctx.req)).outcome ?? "SUCCESS");
    if (o === "SUCCESS") markPaid(b, p);
    if (o === "DECLINE") Object.assign(p, { status: "FAILED", failureReason: "Your bank declined the card (insufficient funds). Try another card or pay by transfer." });
    if (o === "PENDING") p.status = "CONFIRMING";
    if (o === "REVERSE") {
      p.status = "REVERSED";
      p.reversedAt = now();
      const f = feeRec(b, p.studentId, p.semesterId);
      if (f.paidPaymentId === p.id) Object.assign(f, { status: "REVERSED", paidPaymentId: null, reversal: { paymentId: p.id, at: now() } });
    }
    if (o === "REFUND_PROCESSED" && p.refund) {
      p.refund = { ...p.refund, status: "PROCESSED", processedAt: now() };
      p.status = "REFUNDED";
    }
    return json(200, { reference: p.reference, outcome: o, webhook: null });
  }

  // ---- public slip verification
  if (method === "GET" && (m = path.match(/^\/public\/registration\/verify\/([^/]+)$/))) {
    const code = decodeURIComponent(m[1]).toUpperCase().trim();
    const r = b.regs.find((x) => x.code === code);
    if (!r) return err(404, "not_found", "We could not find a slip with this code. Check the code on the slip.");
    const s = u.students.find((x) => x.id === r.studentId)!;
    const v = regView(u, b, r, false);
    return json(200, { valid: true, slipNumber: r.slipNumber, studentName: fullName(s), matricNumber: s.matricNumber, programme: `${u.programmes.find((p) => p.code === s.programmeCode)?.name} · ${s.level}L`, semester: v.semester.label, courseCount: v.courseCount, totalUnits: v.totalUnits, submittedAt: r.submittedAt, updatedAt: r.updatedAt, slipVersion: r.slipVersion });
  }

  const student = ctx.studentId ? u.students.find((x) => x.id === ctx.studentId) : null;

  // ---- student payments
  if (path.startsWith("/payments")) {
    if (!student) return ctx.staff && (m = path.match(/^\/payments\/([^/]+)\/receipt\.pdf$/)) ? receipt(m[1]) : ctx.staff ? forbidden() : signedOut();
    const sem = currentSemester(u);
    if (method === "GET" && path === "/payments/fees/current") {
      const f = feeView(b, u, student.id);
      return f ? json(200, f) : err(404, "no_session", "Your university has not opened a session yet.");
    }
    if (method === "GET" && path === "/payments/fees") {
      const f = feeView(b, u, student.id);
      return json(200, { items: f ? [f] : [] });
    }
    if (method === "GET" && path === "/payments/mine") {
      return json(200, { items: b.payments.filter((p) => p.studentId === student.id).sort((a, z) => z.startedAt.localeCompare(a.startedAt)).map((p) => paymentView(b, p, sem)) });
    }
    if (method === "GET" && path === "/payments/return") {
      const p = b.payments.find((x) => x.reference === url.searchParams.get("reference") && x.studentId === student.id);
      return p ? json(200, paymentView(b, p, sem)) : notFound("that payment");
    }
    if (method === "POST" && path === "/payments") {
      if (!sem) return err(404, "no_session", "Your university has not opened a session yet.");
      if (!b.account) return err(409, "payments_not_ready", "Payments are not open for your university yet. Try again later or call the ODeL office.");
      const req = await body<{ method?: PayMethod; ussdBank?: string }>(ctx.req);
      const mth = req.method;
      if (!mth || !["CARD", "BANK_TRANSFER", "USSD"].includes(mth)) return invalid({ method: "Choose how to pay." });
      if (mth === "USSD" && !USSD[req.ussdBank ?? ""]) return err(400, "ussd_bank_not_supported", "USSD works with GTBank, UBA, Sterling and Zenith. Pay by card or bank transfer instead.", { fields: { ussdBank: "Choose GTBank, UBA, Sterling or Zenith." } });
      const fee = feeView(b, u, student.id)!;
      if (fee.status === "PAID") return err(409, "already_paid", `Your fee for ${sem.label} is paid. Your receipt is under Payments.`);
      const open = b.payments.find((p) => p.studentId === student.id && p.semesterId === sem.id && (p.status === "PENDING" || p.status === "CONFIRMING"));
      if (open?.status === "CONFIRMING") return err(409, "payment_confirming", "We are waiting for your bank to confirm your last payment. Do not pay again.");
      if (open && open.method === mth && (mth !== "USSD" || open.ussdBank === req.ussdBank) && open.outcome !== "close") return json(200, paymentView(b, open, sem));
      if (open) open.status = "CANCELLED";
      const p: MPayment = seedPayment({
        studentId: student.id,
        semesterId: sem.id,
        reference: `WU-PF-${Math.floor(880000 + Math.random() * 99999)}`,
        status: "PENDING",
        method: mth,
        ussdBank: mth === "USSD" ? req.ussdBank! : null,
        startedAt: now(),
        expiresAt: mth === "CARD" ? null : new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      b.payments.push(p);
      record(ctx, "PAYMENT_STARTED", `${fullName(student)} started paying the platform fee (${METHOD_LABEL[mth]}, ${p.reference})`, { id: student.userId, fullName: fullName(student), role: "STUDENT", roleLabel: "Student" });
      return json(201, paymentView(b, p, sem));
    }
    if ((m = path.match(/^\/payments\/([^/]+)(?:\/(sent|check|cancel|receipt\.pdf))?$/))) {
      const p = b.payments.find((x) => x.id === m![1] && x.studentId === student.id);
      if (!p) return notFound("that payment");
      const act = m[2];
      if (method === "GET" && !act) return json(200, paymentView(b, p, sem));
      if (method === "GET" && act === "receipt.pdf") return receipt(p.id);
      if (method === "POST" && act === "sent") {
        if (p.status === "PENDING") {
          p.status = "CONFIRMING";
          p.sentAt = now();
        }
        return json(200, paymentView(b, p, sem));
      }
      if (method === "POST" && act === "check") return json(200, paymentView(b, p, sem));
      if (method === "POST" && act === "cancel") {
        if (p.status !== "PENDING") return err(409, "not_pending", "This payment is no longer waiting for you, so it cannot be cancelled.");
        p.status = "CANCELLED";
        return json(200, paymentView(b, p, sem));
      }
    }
    return null;
  }

  function receipt(id: string) {
    const p = b.payments.find((x) => x.id === id);
    if (!p || !p.paidAt) return err(404, "not_found", "There is no receipt for this payment: it is not paid.");
    if (!student && !canReadPayments(ctx)) return forbidden();
    const s = u.students.find((x) => x.id === p.studentId)!;
    const sem = currentSemester(u)!;
    return pdf(`receipt-${p.reference}.pdf`, [
      `${ctx.tenant.name} - Platform fee receipt`,
      `Receipt no. ${p.reference}`,
      `Student: ${fullName(s)} (${s.matricNumber})`,
      `Programme: ${u.programmes.find((x) => x.code === s.programmeCode)?.name} - ${s.level}L`,
      `Session and semester: ${sem.label}`,
      `Amount: ${naira(b.amount)}`,
      `Method: ${p.usedLabel ?? METHOD_LABEL[p.method]}`,
      `Paid on: ${p.paidAt}`,
      `Provider reference: PSK_${p.reference.slice(-6)}`,
      `Status: ${P_STATUS[p.status]}`,
    ]);
  }

  // ---- staff payments (A-01, A-02); the split is never shown here
  if (path.startsWith("/fees/")) {
    if (!ctx.staff) return signedOut();
    if (!canReadPayments(ctx)) return forbidden();
    const sem = currentSemester(u);
    if (method === "GET" && path === "/fees/settings") {
      return json(200, { amount: b.amount, amountLabel: naira(b.amount), paymentsOpen: !!b.account, settlementAccount: b.account ? { bankName: b.account.bankName, accountNumberMasked: `••••${b.account.last4}`, accountName: b.account.accountName, since: b.account.since } : null });
    }
    if (!sem) return err(404, "no_session", "There is no session yet. Set one up in Academic setup.");
    if (method === "GET" && path === "/fees/payments/summary") {
      const rows = u.students.map((s) => payRow(u, b, s));
      const paid = rows.filter((r) => r.status === "PAID").length;
      const conf = b.payments.filter((p) => p.status === "CONFIRMING");
      const refunds = b.payments.filter((p) => p.refund);
      return json(200, {
        semester: { id: sem.id, label: sem.label },
        amount: b.amount,
        amountLabel: `${naira(b.amount)} per student`,
        paid: { count: paid, collected: paid * b.amount, collectedLabel: `${naira(paid * b.amount)} collected` },
        confirming: { count: rows.filter((r) => r.status === "CONFIRMING").length, oldestStartedAt: conf.map((p) => p.startedAt).sort()[0] ?? null },
        notPaid: { count: rows.filter((r) => r.status === "NOT_PAID" || r.status === "FAILED").length },
        refunds: { count: refunds.length, amount: refunds.length * b.amount, amountLabel: naira(refunds.length * b.amount) },
        reversed: { count: rows.filter((r) => r.status === "REVERSED").length },
        students: u.students.length,
      });
    }
    if (method === "GET" && path === "/fees/payments") return json(200, page(payRows(ctx, b), url, 20));
    if (method === "GET" && path === "/fees/payments/export.csv") {
      return csvResponse("payments.csv", [["student", "matric_number", "centre", "programme", "level", "status", "method", "reference", "date"], ...payRows(ctx, b).map((r) => [r.fullName, r.matricNumber, r.centre?.name, r.programme?.name, r.level, r.statusLabel, r.methodLabel, r.reference, r.date])]);
    }
    if (method === "GET" && (m = path.match(/^\/fees\/students\/([^/]+)$/))) {
      const s = u.students.find((x) => x.id === m![1]);
      if (!s) return notFound("that student");
      const centre = u.centres.find((c) => c.code === s.centreCode);
      const prog = u.programmes.find((p) => p.code === s.programmeCode);
      return json(200, {
        student: { id: s.id, fullName: fullName(s), matricNumber: s.matricNumber, programme: prog ? { code: prog.code, name: prog.name } : null, level: s.level, levelLabel: `${s.level}L`, centre: centre ? { code: centre.code, name: centre.name, shortName: centre.shortName } : null, email: s.email },
        fee: feeView(b, u, s.id),
        attempts: b.payments.filter((p) => p.studentId === s.id).sort((a, z) => z.startedAt.localeCompare(a.startedAt)).map((p) => paymentView(b, p, sem)),
      });
    }
    return null;
  }

  // ---- student registration
  if (path.startsWith("/registration/me")) {
    if (!student) return ctx.staff ? forbidden() : signedOut();
    const sem = currentSemester(u);
    const me = regMe(u, b, student);
    if (method === "GET" && path === "/registration/me") return json(200, me);
    if (!sem) return err(409, "not_set", "Registration for this semester is not set up yet. Check back later.");
    if (method === "GET" && path === "/registration/me/courses") {
      const o = offered(u, b, student, sem.number);
      const reg = b.regs.find((r) => r.studentId === student.id && r.semesterId === sem.id);
      const sel = new Set(reg?.courseIds ?? []);
      const lockedUnits = [...o.compulsory, ...o.carry].reduce((a, c) => a + c.units, 0);
      const prog = u.programmes.find((p) => p.code === student.programmeCode);
      const w = me.window!;
      return json(200, {
        semester: semView(sem),
        window: w,
        limits: me.limits,
        compulsory: o.compulsory.map((c) => ({ courseId: c.id, code: c.code, title: c.title, units: c.units, kind: "COMPULSORY", locked: true, selected: true })),
        carryOvers: o.carry.map((c) => ({ courseId: c.courseId, code: c.code, title: c.title, units: c.units, kind: "CARRY_OVER", locked: true, selected: true, fromSession: c.fromSession })),
        electives: o.electives.map((c) => ({ courseId: c.id, code: c.code, title: c.title, units: c.units, kind: "ELECTIVE", locked: false, selected: sel.has(c.id) })),
        lockedUnits,
        lockedCourses: o.compulsory.length + o.carry.length,
        subtitle: `${prog?.name} · ${student.level}L · ${w.registerBy ? `closes ${shortDay(w.registerBy)}` : w.label}`,
      });
    }
    if (method === "POST" && path === "/registration/me/check") {
      const r = await body<{ electiveIds?: string[] }>(ctx.req);
      return json(200, check(u, b, student, sem.number, r.electiveIds ?? []));
    }
    if (method === "POST" && path === "/registration/me/submit") {
      const r = await body<{ electiveIds?: string[]; confirm?: boolean }>(ctx.req);
      if (me.registration) return err(409, "already_registered", "You have already registered for this semester. Ask for a course change instead.");
      if (me.blocked?.code === "fee_not_paid") return err(402, "fee_not_paid", me.blocked.message, { payPath: "/payments" });
      if (me.blocked?.code === "fee_confirming") return err(409, "fee_confirming", me.blocked.message);
      if (me.blocked) return err(me.blocked.code === "suspended" ? 403 : 409, me.blocked.code === "late_request_pending" ? "late_request_needed" : me.blocked.code, me.blocked.message);
      if (!r.confirm) return err(400, "confirm_required", "Tick the box to confirm these are your courses.");
      const c = check(u, b, student, sem.number, r.electiveIds ?? []);
      if (!c.ok) return err(400, "invalid", c.problems[0].message, { problems: c.problems });
      const o = offered(u, b, student, sem.number);
      const reg: MReg = {
        id: uid(),
        studentId: student.id,
        semesterId: sem.id,
        courseIds: [...o.compulsory.map((x) => x.id), ...o.carry.map((x) => x.courseId), ...(r.electiveIds ?? [])],
        late: me.window?.state === "LATE",
        slipNumber: slipNumberFor(b, student, sem.number),
        slipVersion: 1,
        code: `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
        submittedAt: now(),
        updatedAt: null,
        centreCode: student.centreCode,
        history: [{ at: now(), action: "SUBMITTED", summary: `Registered ${c.courseCount} courses, ${c.totalUnits} units`, by: fullName(student), slipVersion: 1 }],
      };
      b.regs.push(reg);
      record(ctx, "REGISTRATION_SUBMITTED", `${fullName(student)} registered ${c.courseCount} courses (${c.totalUnits} units)`, { id: student.userId, fullName: fullName(student), role: "STUDENT", roleLabel: "Student" });
      return json(201, regView(u, b, reg));
    }
    if (method === "GET" && path === "/registration/me/registrations") {
      return json(200, { items: b.regs.filter((r) => r.studentId === student.id).map((r) => regView(u, b, r, false)) });
    }
    if ((m = path.match(/^\/registration\/me\/registrations\/([^/]+)(\/slip\.pdf)?$/)) && method === "GET") {
      const r = b.regs.find((x) => x.id === m![1] && x.studentId === student.id);
      if (!r) return notFound("that registration");
      return m[2] ? slip(r) : json(200, regView(u, b, r));
    }
    if (method === "POST" && path === "/registration/me/uploads") {
      const r = await body<{ fileName?: string; contentType?: string; size?: number }>(ctx.req);
      if (!["image/jpeg", "image/png", "application/pdf"].includes(r.contentType ?? "")) return invalid({ fileName: "Attach a JPG, PNG or PDF file." });
      if ((r.size ?? 0) > 5 * 1024 * 1024) return invalid({ size: "The file must be 5 MB or smaller. Take a smaller photo or save it as PDF." });
      return json(200, uploadTicket(r.fileName ?? "file", r.contentType ?? "application/octet-stream"));
    }
    if (method === "POST" && path === "/registration/me/late-requests") {
      const r = await body<{ reasonCategory?: string; reason?: string; attachment?: { key: string; fileName: string; contentType: string; size: number } | null }>(ctx.req);
      const w = me.window!;
      if (me.registration) return err(409, "already_registered", "You have already registered for this semester.");
      if (w.state === "OPEN") return err(409, "not_late", "Registration is open: register now.");
      if (w.state === "NOT_OPEN") return err(409, "not_late", "Registration has not opened yet.");
      if (w.state === "CLOSED") return err(409, "not_late", `Late registration closed on ${shortDay(w.lateClosesOn)}. Contact your study centre.`);
      if (b.reqs.some((q) => q.studentId === student.id && q.kind === "LATE" && (q.status === "PENDING" || q.status === "APPROVED"))) return err(409, "request_pending", "You already asked; the decision will come by email.");
      const fields: Record<string, string> = {};
      if (!REASONS[r.reasonCategory ?? ""]) fields.reasonCategory = "Choose a reason.";
      const reason = (r.reason ?? "").trim();
      if (reason.length < 10 || reason.length > 1000) fields.reason = "Say why you are late (10 to 1000 characters).";
      if (r.attachment && !ctx.uploads.has(r.attachment.key)) fields.attachment = "Upload the file again.";
      if (Object.keys(fields).length) return invalid(fields);
      const q: MReq = { id: uid(), kind: "LATE", status: "PENDING", studentId: student.id, semesterId: sem.id, centreCode: student.centreCode, reasonCategory: r.reasonCategory!, reason, attachment: r.attachment ?? null, drop: [], add: [], unitsBefore: 0, registerBy: null, decision: null, createdAt: now() };
      b.reqs.push(q);
      return json(201, reqView(u, b, q));
    }
    if (method === "POST" && path === "/registration/me/change-requests") {
      const r = await body<{ registrationId?: string; dropCourseIds?: string[]; addCourseIds?: string[]; reason?: string }>(ctx.req);
      const reg = b.regs.find((x) => x.id === r.registrationId && x.studentId === student.id);
      if (!reg) return notFound("that registration");
      const w = me.window!;
      if (today() > w.changesCloseOn!) return err(409, "changes_closed", `Course changes closed on ${shortDay(w.changesCloseOn!)}.`);
      if (b.reqs.some((q) => q.studentId === student.id && q.kind === "CHANGE" && q.status === "PENDING")) return err(409, "request_pending", "You already asked for a change. Wait for the decision, or cancel it to ask again.");
      const drop = r.dropCourseIds ?? [];
      const add = r.addCourseIds ?? [];
      const o = offered(u, b, student, sem.number);
      for (const id of drop) {
        const c = courseById(u, b, id);
        if (o.compulsory.some((x) => x.id === id)) return invalid({ dropCourseIds: `${c?.code} is compulsory, so it cannot be dropped.` });
        if (o.carry.some((x) => x.courseId === id)) return invalid({ dropCourseIds: `${c?.code} is a carry-over, so it cannot be dropped.` });
      }
      if (!drop.length && !add.length) return invalid({ addCourseIds: "Drop or add at least one course." });
      const reason = (r.reason ?? "").trim();
      if (reason.length < 10 || reason.length > 1000) return invalid({ reason: "Say why you want the change (10 to 1000 characters)." });
      const electives = reg.courseIds.filter((id) => o.electives.some((e) => e.id === id) && !drop.includes(id)).concat(add);
      const c = check(u, b, student, sem.number, electives);
      if (!c.ok) return err(400, "invalid", c.problems[0].message, { problems: c.problems });
      const q: MReq = { id: uid(), kind: "CHANGE", status: "PENDING", studentId: student.id, semesterId: sem.id, centreCode: reg.centreCode, reasonCategory: null, reason, attachment: null, drop, add, unitsBefore: regView(u, b, reg).totalUnits, registerBy: null, decision: null, createdAt: now() };
      b.reqs.push(q);
      return json(201, reqView(u, b, q));
    }
    if (method === "GET" && path === "/registration/me/requests") {
      return json(200, { items: b.reqs.filter((q) => q.studentId === student.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt)).map((q) => reqView(u, b, q)) });
    }
    if ((m = path.match(/^\/registration\/me\/requests\/([^/]+)(\/attachment|\/cancel)?$/))) {
      const q = b.reqs.find((x) => x.id === m![1] && x.studentId === student.id);
      if (!q) return notFound("that request");
      if (method === "GET" && !m[2]) return json(200, reqView(u, b, q));
      if (method === "GET" && m[2] === "/attachment") return q.attachment ? json(200, { url: `/api/v1/dev/storage/${q.attachment.key}`, expiresAt: new Date(Date.now() + 300_000).toISOString() }) : notFound("an attachment");
      if (method === "POST" && m[2] === "/cancel") {
        if (q.status !== "PENDING") return err(409, "not_pending", "This request was already decided, so it cannot be cancelled.");
        q.status = "CANCELLED";
        return json(200, reqView(u, b, q));
      }
    }
    return null;
  }

  function slip(r: MReg) {
    const s = u.students.find((x) => x.id === r.studentId)!;
    const v = regView(u, b, r);
    return pdf(`${r.slipNumber}.pdf`, [
      `${ctx.tenant.name} - Course registration slip`,
      `${v.semester.label} · slip ${r.slipNumber}${r.slipVersion > 1 ? ` (version ${r.slipVersion})` : ""}`,
      `${fullName(s)} · ${s.matricNumber}`,
      ...v.courses.map((c) => `${c.code}  ${c.title}  ${c.units} units  ${c.kindLabel}`),
      `Total: ${v.courseCount} courses, ${v.totalUnits} units`,
      `Verify this slip at ${ctx.tenant.portalUrl}/verify · code ${r.code}`,
    ]);
  }

  // ---- staff registration
  if (path.startsWith("/registration/")) {
    if (!ctx.staff) return signedOut();
    const role = ctx.staff.role ?? "";
    const reader = ["ODEL_ADMIN", "ODEL_DIRECTOR", "CENTRE_COORDINATOR"].includes(role);
    if (!reader) return forbidden();
    const mine = coordCentres(ctx);
    const sem = currentSemester(u);
    if (method === "GET" && path === "/registration/requests") {
      const kind = url.searchParams.get("kind");
      const status = url.searchParams.get("status") ?? "PENDING";
      const centreId = url.searchParams.get("centreId");
      const noCoord = url.searchParams.get("noCoordinator") === "true";
      const all = b.reqs
        .filter((q) => !mine || mine.includes(q.centreCode))
        .filter((q) => !centreId || u.centres.find((c) => c.id === centreId)?.code === q.centreCode)
        .filter((q) => !noCoord || !hasCoordinator(u, q.centreCode))
        .filter((q) => status === "ALL" || q.status === status)
        .sort((a, z) => z.createdAt.localeCompare(a.createdAt));
      const pg = page(all.filter((q) => !kind || q.kind === kind).map((q) => reqView(u, b, q)), url, 25);
      return json(200, { ...pg, counts: { late: all.filter((q) => q.kind === "LATE").length, change: all.filter((q) => q.kind === "CHANGE").length } });
    }
    if ((m = path.match(/^\/registration\/requests\/([^/]+)(\/attachment|\/approve|\/decline)?$/))) {
      const q = b.reqs.find((x) => x.id === m![1] && (!mine || mine.includes(x.centreCode)));
      if (!q) return notFound("that request");
      if (method === "GET" && !m[2]) {
        const { registration, ...request } = reqView(u, b, q, true);
        return json(200, { request, registration });
      }
      if (method === "GET" && m[2] === "/attachment") return q.attachment ? json(200, { url: `/api/v1/dev/storage/${q.attachment.key}`, expiresAt: new Date(Date.now() + 300_000).toISOString() }) : notFound("an attachment");
      if (method === "POST") {
        if (role !== "ODEL_ADMIN" && role !== "CENTRE_COORDINATOR") return forbidden();
        if (q.status !== "PENDING") return err(409, "not_pending", `This request was already ${q.status === "CANCELLED" ? "cancelled by the student" : `${q.status.toLowerCase()} by ${q.decision?.by ?? "someone else"}`}.`);
        const r = await body<{ note?: string | null }>(ctx.req);
        const note = (r.note ?? "").trim();
        if (m[2] === "/decline" && (note.length < 5 || note.length > 500)) return invalid({ note: "Write a short note for the student (5 to 500 characters): it says what to do next." });
        const s = u.students.find((x) => x.id === q.studentId)!;
        if (m[2] === "/approve" && q.kind === "CHANGE") {
          const reg = b.regs.find((x) => x.studentId === q.studentId && x.semesterId === q.semesterId)!;
          reg.courseIds = reg.courseIds.filter((id) => !q.drop.includes(id)).concat(q.add);
          reg.slipVersion += 1;
          reg.updatedAt = now();
          reg.history.push({ at: now(), action: "CHANGE_APPLIED", summary: `${reqView(u, b, q).change!.summary} (approved by ${ctx.staff.fullName})`, by: ctx.staff.fullName, slipVersion: reg.slipVersion });
        }
        if (m[2] === "/approve" && q.kind === "LATE") {
          const w = windowOf(b);
          q.registerBy = today() > w.lateClosesOn ? addDays(today(), 3) : w.lateClosesOn;
        }
        q.status = m[2] === "/approve" ? "APPROVED" : "DECLINED";
        q.decision = { at: now(), by: ctx.staff.fullName, role, note: note || null };
        record(ctx, `REGISTRATION_${q.kind}_${q.status}`, `${q.status === "APPROVED" ? "Approved" : "Declined"} ${fullName(s)}'s ${q.kind === "LATE" ? "late registration" : "course change"}`);
        return json(200, reqView(u, b, q));
      }
    }
    if (!sem) return err(404, "no_session", "There is no session yet. Set one up in Academic setup.");
    const reportRows = () => {
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const centreId = url.searchParams.get("centreId");
      const programmeId = url.searchParams.get("programmeId");
      const level = url.searchParams.get("level");
      const status = url.searchParams.get("status");
      return u.students
        .filter((s) => !mine || mine.includes(s.centreCode))
        .map((s) => regRow(u, b, s))
        .filter((r) => !q || r.fullName.toLowerCase().includes(q) || r.matricNumber.toLowerCase().includes(q))
        .filter((r) => !centreId || r.centre?.id === centreId)
        .filter((r) => !programmeId || r.programme?.id === programmeId)
        .filter((r) => !level || String(r.level) === level)
        .filter((r) => !status || r.status === status);
    };
    if (method === "GET" && path === "/registration/report") {
      const all = u.students.filter((s) => !mine || mine.includes(s.centreCode)).map((s) => regRow(u, b, s));
      const w = windowOf(b);
      const late = b.reqs.filter((q) => q.kind === "LATE" && q.status === "PENDING" && (!mine || mine.includes(q.centreCode)));
      return json(200, {
        semester: semView(sem),
        window: w,
        subtitle: `${sem.label} · open ${dayMonth(w.opensOn)}–${longDay(w.closesOn).slice(4)} · late registration until ${dayMonth(w.lateClosesOn)}`,
        cards: {
          registered: all.filter((r) => r.status === "REGISTERED").length,
          paid: all.filter((r) => r.feeStatus === "PAID").length,
          paidNotRegistered: all.filter((r) => r.status === "PAID_NOT_REGISTERED").length,
          lateRequests: late.length,
          lateRequestsAtCentres: late.filter((q) => hasCoordinator(u, q.centreCode)).length,
          lateRequestsAtOffice: late.filter((q) => !hasCoordinator(u, q.centreCode)).length,
          courseChanges: b.reqs.filter((q) => q.kind === "CHANGE" && q.status === "PENDING" && (!mine || mine.includes(q.centreCode))).length,
        },
        ...page(reportRows(), url, 25),
        feeStatusKnown: true,
      });
    }
    if (method === "GET" && path === "/registration/report.csv") {
      return csvResponse("registrations.csv", [
        ["matric_number", "full_name", "programme", "level", "centre", "status", "courses", "units", "submitted_at", "course_codes"],
        ...reportRows().map((r) => [r.matricNumber, r.fullName, r.programme?.name, r.level, r.centre?.name, r.statusLabel, r.courseCount, r.units, r.submittedAt, r.registrationId ? regView(u, b, b.regs.find((x) => x.id === r.registrationId)!, false).courses.map((c) => c.code).join(" ") : ""]),
      ]);
    }
    if (method === "GET" && (m = path.match(/^\/registration\/students\/([^/]+)$/))) {
      const s = u.students.find((x) => x.id === m![1] && (!mine || mine.includes(x.centreCode)));
      if (!s) return notFound("that student");
      const reg = b.regs.find((r) => r.studentId === s.id && r.semesterId === sem.id);
      const me = regMe(u, b, s);
      return json(200, { student: me.student, registration: reg ? regView(u, b, reg) : null, requests: b.reqs.filter((q) => q.studentId === s.id).map((q) => reqView(u, b, q)), carryOvers: b.carry.filter((c) => c.studentId === s.id) });
    }
    if (method === "GET" && (m = path.match(/^\/registration\/registrations\/([^/]+)\/slip\.pdf$/))) {
      const r = b.regs.find((x) => x.id === m![1]);
      return r ? slip(r) : notFound("that registration");
    }
    if (path === "/registration/rules") {
      if (isCoordinator(ctx)) return forbidden();
      const programmeId = url.searchParams.get("programmeId");
      if (method === "PUT") {
        if (!isAdmin(ctx)) return forbidden();
        const r = await body<{ changesCloseOn?: string | null; programmeId?: string | null; fee?: B2["feeRules"]; levels?: { level: number; minUnits: number; maxUnits: number; maxElectives: number }[] }>(ctx.req);
        const fields: Record<string, string> = {};
        const w = windowOf(b);
        (r.levels ?? []).forEach((l, i) => {
          if (!(l.minUnits >= 0 && l.minUnits <= 60)) fields[`levels[${i}].minUnits`] = "Use 0 to 60.";
          if (!(l.maxUnits >= 1 && l.maxUnits <= 60)) fields[`levels[${i}].maxUnits`] = "Use 1 to 60.";
          else if (l.minUnits > l.maxUnits) fields[`levels[${i}].minUnits`] = `The minimum (${l.minUnits}) is above the maximum (${l.maxUnits}).`;
          if (!(l.maxElectives >= 0 && l.maxElectives <= 20)) fields[`levels[${i}].maxElectives`] = "Use 0 to 20.";
          const comp = compulsoryUnits(l.level, r.programmeId ?? null);
          if (comp > l.maxUnits) fields[`levels[${i}].maxUnits`] = `${l.level}L compulsory courses already come to ${comp} units, over the maximum of ${l.maxUnits}.`;
        });
        if (r.changesCloseOn && r.changesCloseOn < w.lateClosesOn) fields.changesCloseOn = `Course changes must stay open until registration closes (${dayMonth(w.lateClosesOn)}).`;
        if (Object.keys(fields).length) return invalid(fields);
        (r.levels ?? []).forEach((l) => (b.levels[`${r.programmeId ?? "default"}|${l.level}`] = { minUnits: l.minUnits, maxUnits: l.maxUnits, maxElectives: l.maxElectives }));
        if (r.changesCloseOn !== undefined) b.changesCloseOn = r.changesCloseOn;
        if (r.fee) b.feeRules = { ...b.feeRules, ...r.fee };
        record(ctx, "REGISTRATION_RULES_UPDATED", "Changed the registration rules");
      }
      return json(200, rulesView(method === "PUT" ? null : programmeId));
    }
    if (method === "DELETE" && (m = path.match(/^\/registration\/rules\/programmes\/([^/]+)$/))) {
      if (!isAdmin(ctx)) return forbidden();
      Object.keys(b.levels).filter((k) => k.startsWith(`${m![1]}|`)).forEach((k) => delete b.levels[k]);
      return noContent();
    }
    if (path === "/registration/carry-overs" || path.startsWith("/registration/carry-overs/") || path === "/registration/uploads") {
      if (isCoordinator(ctx)) return forbidden();
      if (method !== "GET" && !isAdmin(ctx)) return forbidden();
      const decorate = (c: B2["carry"][number]) => {
        const s = u.students.find((x) => x.id === c.studentId);
        return { ...c, studentName: s ? fullName(s) : "", matricNumber: s?.matricNumber ?? "" };
      };
      if (method === "GET" && path === "/registration/carry-overs") {
        const sid = url.searchParams.get("studentId");
        return json(200, { items: b.carry.filter((c) => !sid || c.studentId === sid).map(decorate) });
      }
      if (method === "GET" && path === "/registration/carry-overs/template.csv") return csvResponse("carry-overs-template.csv", [["matric_number", "course_code", "from_session"], ["WU/ODL/24/0153", "CSC 103", "2025/2026"]]);
      if (method === "POST" && path === "/registration/carry-overs") {
        const r = await body<{ studentId?: string; courseCode?: string; fromSession?: string }>(ctx.req);
        const s = u.students.find((x) => x.id === r.studentId);
        if (!s) return notFound("that student");
        const code = (r.courseCode ?? "").trim().toUpperCase().replace(/^([A-Z]+)\s*(\d+)$/, "$1 $2");
        const c = courseCatalogue(u, b).find((x) => x.code === code);
        if (!c) return invalid({ courseCode: `${code || "That course"} is not in the catalogue.` });
        if (!/^\d{4}\/\d{4}$/.test(r.fromSession ?? "")) return invalid({ fromSession: "Write the session like 2025/2026." });
        if (b.carry.some((x) => x.studentId === s.id && x.courseId === c.id && x.status === "OPEN")) return err(409, "already_open", `${fullName(s)} already has ${c.code} as a carry-over.`);
        const co = { id: uid(), studentId: s.id, courseId: c.id, code: c.code, title: c.title, units: c.units, semester: c.semester, fromSession: r.fromSession!, source: "ADMIN", status: "OPEN" as const, createdAt: now(), createdBy: ctx.staff.fullName };
        b.carry.push(co);
        record(ctx, "CARRY_OVER_ADDED", `Added ${c.code} as a carry-over for ${fullName(s)}`);
        return json(201, decorate(co));
      }
      if (method === "DELETE" && (m = path.match(/^\/registration\/carry-overs\/([^/]+)$/))) {
        const c = b.carry.find((x) => x.id === m![1]);
        if (!c) return notFound("that carry-over");
        if (b.regs.some((r) => r.studentId === c.studentId && r.courseIds.includes(c.courseId))) return err(409, "in_use", `${c.code} is on a submitted registration, so it cannot be removed.`);
        b.carry = b.carry.filter((x) => x !== c);
        return noContent();
      }
      if (method === "POST" && path === "/registration/uploads") {
        const r = await body<{ fileName?: string; contentType?: string }>(ctx.req);
        if (!/\.csv$/i.test(r.fileName ?? "")) return invalid({ file: "Choose a CSV file." });
        return json(200, uploadTicket(r.fileName ?? "carry-overs.csv", "text/csv"));
      }
      if (method === "POST" && path === "/registration/carry-overs/imports") {
        const r = await body<{ key?: string }>(ctx.req);
        const text = readUpload(ctx, r.key ?? "");
        if (text === null) return invalid({ file: "Upload the file again." });
        const rows = text.split(/\r?\n/).filter((l) => l.trim());
        const problems: { row: number; message: string }[] = [];
        let added = 0;
        let skipped = 0;
        rows.slice(1).forEach((line, i) => {
          const [matric, code, from] = line.split(",").map((x) => x.trim());
          const s = u.students.find((x) => x.matricNumber === matric);
          const c = courseCatalogue(u, b).find((x) => x.code === (code ?? "").toUpperCase());
          if (!s) return problems.push({ row: i + 2, message: `Matric number ${matric} not found` });
          if (!c) return problems.push({ row: i + 2, message: `${code} is not in the catalogue` });
          if (b.carry.some((x) => x.studentId === s.id && x.courseId === c.id && x.status === "OPEN")) return void skipped++;
          b.carry.push({ id: uid(), studentId: s.id, courseId: c.id, code: c.code, title: c.title, units: c.units, semester: c.semester, fromSession: from || "2025/2026", source: "IMPORT", status: "OPEN", createdAt: now(), createdBy: ctx.staff!.fullName });
          added++;
        });
        return json(200, { totalRows: rows.length - 1, added, skipped: skipped + problems.length, problems });
      }
    }
    return null;
  }

  function compulsoryUnits(level: number, programmeId: string | null) {
    const progs = programmeId ? u.programmes.filter((p) => p.id === programmeId) : u.programmes;
    return Math.max(0, ...progs.map((p) => courseCatalogue(u, b).filter((c) => c.programmeCode === p.code && c.level === level && c.semester === 1 && c.kind === "COMPULSORY").reduce((a, c) => a + c.units, 0)));
  }

  function rulesView(programmeId: string | null) {
    const sem = currentSemester(u)!;
    const w = windowOf(b);
    const prog = programmeId ? u.programmes.find((p) => p.id === programmeId) : null;
    const allLevels = [...new Set((prog ? [prog] : u.programmes).flatMap((p) => Array.from({ length: p.durationYears }, (_, i) => (i + 1) * 100)))].sort();
    const own = prog && Object.keys(b.levels).some((k) => k.startsWith(`${prog.id}|`));
    return {
      semester: semView(sem),
      window: { opensOn: w.opensOn, closesOn: w.closesOn, lateClosesOn: w.lateClosesOn, changesCloseOn: w.changesCloseOn, changesCloseOnDefault: !b.changesCloseOn },
      fee: b.feeRules,
      programme: prog ? { id: prog.id, name: prog.name } : null,
      inheritedFromDefault: !!prog && !own,
      levels: allLevels.map((level) => {
        const l = (prog && b.levels[`${prog.id}|${level}`]) || b.levels[`default|${level}`] || { minUnits: 15, maxUnits: 20, maxElectives: 3 };
        const comp = compulsoryUnits(level, prog?.id ?? null);
        return { level, ...l, compulsoryUnits: comp, fits: comp <= l.maxUnits };
      }),
      programmesWithOwnLimits: u.programmes.filter((p) => Object.keys(b.levels).some((k) => k.startsWith(`${p.id}|`))).map((p) => ({ id: p.id, name: p.name })),
      note: "Carry-over courses always count towards the maximum.",
    };
  }

  // ---- A-06 move a student to another centre (student-service)
  if ((m = path.match(/^\/students\/([^/]+)\/(move-centre|centre-moves)(?:\/([^/]+)\/cancel)?$/))) {
    if (!ctx.staff) return signedOut();
    const s = u.students.find((x) => x.id === m![1]);
    if (!s) return notFound("that student");
    const list = b.moves.get(s.id) ?? [];
    if (method === "GET" && m[2] === "centre-moves") return json(200, { items: list.map((x) => moveView(u, x)) });
    if (!isAdmin(ctx)) return forbidden();
    if (method === "POST" && m[2] === "centre-moves" && m[3]) {
      const mv = list.find((x) => x.id === m![3]);
      if (!mv) return notFound("that move");
      if (mv.status !== "SCHEDULED") return err(409, "not_scheduled", "This move has already happened, so it cannot be cancelled.");
      mv.status = "CANCELLED";
      return json(200, mv);
    }
    if (method === "POST" && m[2] === "move-centre") {
      const r = await body<{ centreCode?: string; reason?: string; effectiveOn?: string }>(ctx.req);
      const out = moveStudent(ctx, b, s, r.centreCode ?? "", r.reason ?? "", r.effectiveOn ?? "", "reason");
      if (out instanceof Response) return out;
      return json(200, { move: out, record: null });
    }
  }
  // PATCH /students/{id} with another centre goes through the same flow (needs centreChangeReason).
  if (method === "PATCH" && (m = path.match(/^\/students\/([^/]+)$/))) {
    const s = u.students.find((x) => x.id === m![1]);
    if (s && ctx.staff) {
      const r = (await ctx.req.clone().json().catch(() => ({}))) as { centreCode?: string; centreChangeReason?: string; centreEffectiveOn?: string };
      if (r.centreCode && r.centreCode !== s.centreCode && u.centres.some((c) => c.code === r.centreCode)) {
        if (!(r.centreChangeReason ?? "").trim()) return invalid({ centreChangeReason: "Say why the student is moving centre." });
        const out = moveStudent(ctx, b, s, r.centreCode, r.centreChangeReason!, r.centreEffectiveOn ?? "", "centreChangeReason", true);
        if (out instanceof Response) return out;
      }
    }
  }
  return null;
}

function moveStudent(ctx: B1Ctx, b: B2, s: MStudent, centreCode: string, reasonIn: string, effectiveIn: string, reasonField: string, viaPatch = false): Response | CentreMove {
  const u = ctx.uni;
  const to = u.centres.find((c) => c.code === centreCode);
  const from = u.centres.find((c) => c.code === s.centreCode)!;
  const fields: Record<string, string> = {};
  if (!to) fields.centreCode = "Choose a centre from Centres.";
  const reason = reasonIn.trim();
  if (reason.length < 3 || reason.length > 500) fields[reasonField] = "Say why the student is moving (3 to 500 characters).";
  const eff = effectiveIn || today();
  if (eff < addDays(today(), -30)) fields.effectiveOn = "Choose a date no more than 30 days back.";
  if (Object.keys(fields).length) return invalid(fields);
  if (to!.code === s.centreCode) return err(409, "same_centre", `${fullName(s)} is already at ${from.name}.`);
  const list = b.moves.get(s.id) ?? [];
  const sched = list.find((x) => x.status === "SCHEDULED");
  if (sched) return err(409, "move_scheduled", `A move to ${sched.to.name} on ${dayMonth(sched.effectiveOn)} is already scheduled. Cancel it first.`);
  const coord = (c: typeof from) => {
    const pid = Object.values(u.staffing).map((x) => x.centres[c.id]).find(Boolean);
    return pid ? u.people.find((p) => p.id === pid) : null;
  };
  const notified: CentreMove["notified"] = [];
  const notNotified: string[] = [];
  if (s.email) notified.push({ name: fullName(s), role: "Student", email: s.email });
  else notNotified.push(`${fullName(s)} has no email on record: tell them another way.`);
  for (const c of [from, to!]) {
    const p = coord(c);
    if (p) notified.push({ name: p.fullName, role: `Coordinator, ${c.name}`, email: p.email });
    else notNotified.push(`${c.name} has no coordinator in this session: the ODeL office covers it.`);
  }
  const done = eff <= today();
  const mv: CentreMove = {
    id: uid(),
    from: { id: from.id, code: from.code, name: from.name },
    to: { id: to!.id, code: to!.code, name: to!.name },
    reason,
    effectiveOn: eff,
    status: done ? "DONE" : "SCHEDULED",
    requestedBy: ctx.staff?.fullName ?? "",
    createdAt: now(),
    appliedAt: done ? now() : null,
    notified,
    notNotified,
    summary: `Exams and tutorials move to ${to!.shortName} from ${dayMonth(eff)}`,
  };
  b.moves.set(s.id, [mv, ...list]);
  if (done && !viaPatch) {
    s.centreCode = to!.code;
    b.reqs.filter((q) => q.studentId === s.id && q.status === "PENDING").forEach((q) => (q.centreCode = to!.code));
    b.regs.filter((r) => r.studentId === s.id).forEach((r) => (r.centreCode = to!.code));
    record(ctx, "STUDENT_CENTRE_CHANGED", `Moved ${fullName(s)} from ${from.name} to ${to!.name}: ${reason}`);
  }
  return mv;
}

/** GET /students/{id} gains centreMoves. */
export function withCentreMoves(u: Uni, studentId: string, rec: Record<string, unknown>) {
  const b = g.__odelB2?.get(u);
  return { ...rec, centreMoves: b?.moves.get(studentId) ?? [] };
}

// ---------------------------------------------------------------- provider console

const BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "030", name: "Heritage Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "001", name: "Paystack test bank" },
];

const resolutions = new Map<string, { bankCode: string; bankName: string; last4: string; accountName: string; at: number }>();

export async function b2PlatformRoute(
  req: Request,
  path: string,
  method: string,
  url: URL,
  tenants: { id: string; name: string; uni: (() => Uni) | null; demo: boolean }[],
  actor: string,
): Promise<Response | null> {
  if (!path.startsWith("/platform/payments")) return null;
  const state = (t: (typeof tenants)[number]) => {
    const ps = accounts().get(t.id);
    const b = t.uni ? b2For(t.uni(), t.demo) : null;
    const account = ps?.account !== undefined ? ps.account : b?.account ?? null;
    const amount = ps?.amount ?? b?.amount ?? 15000;
    const centreShare = ps?.centreShare ?? b?.centreShare ?? 3000;
    return { b, account, amount, centreShare };
  };
  const item = (t: (typeof tenants)[number]) => {
    const s = state(t);
    return {
      tenantId: t.id,
      name: t.name,
      amount: s.amount,
      centreShare: s.centreShare,
      providerShare: s.amount - s.centreShare,
      settlementAccount: s.account ? { bankCode: s.account.bankCode, bankName: s.account.bankName, accountNumberMasked: `••••${s.account.last4}`, accountName: s.account.accountName, subaccountCode: s.account.subaccountCode, since: s.account.since, updatedBy: { fullName: s.account.updatedBy } } : null,
      paymentsOpen: !!s.account,
    };
  };
  let m: RegExpMatchArray | null;
  if (method === "GET" && path === "/platform/payments/universities") return json(200, { items: tenants.map(item) });
  if (method === "GET" && path === "/platform/payments/banks") return json(200, { items: BANKS });
  if (method === "POST" && path === "/platform/payments/banks/resolve") {
    const r = await body<{ bankCode?: string; accountNumber?: string }>(req);
    const bank = BANKS.find((x) => x.code === r.bankCode);
    if (!bank) return invalid({ bankCode: "Choose the bank." });
    if (!/^\d{10}$/.test(r.accountNumber ?? "")) return invalid({ accountNumber: "Enter the 10-digit account number." });
    if (r.accountNumber!.startsWith("000") && bank.code !== "001") return err(422, "not_resolved", "The bank could not find that account. Check the number and the bank.");
    const id = uid();
    const last4 = r.accountNumber!.slice(-4);
    const name = bank.code === "001" ? "PAYSTACK TEST ACCOUNT" : last4 === "4521" ? "WESLEY UNIVERSITY ODEL CENTRE" : "CRESTFIELD UNIVERSITY DISTANCE LEARNING";
    resolutions.set(id, { bankCode: bank.code, bankName: bank.name, last4, accountName: name, at: Date.now() });
    return json(200, { bankCode: bank.code, bankName: bank.name, accountNumberMasked: `••••${last4}`, accountName: name, resolutionId: id });
  }
  if ((m = path.match(/^\/platform\/payments\/universities\/([^/]+)(\/settlement-account)?$/))) {
    const t = tenants.find((x) => x.id === m![1]);
    if (!t) return notFound("that university");
    if (method === "GET" && !m[2]) return json(200, item(t));
    const s = state(t);
    if (method === "PUT" && !m[2]) {
      const r = await body<{ amount?: number; centreShare?: number }>(req);
      const fields: Record<string, string> = {};
      const amount = Number(r.amount);
      const share = Number(r.centreShare);
      if (!(amount >= 1000 && amount <= 1_000_000)) fields.amount = "Enter a fee from ₦1,000 to ₦1,000,000.";
      if (!(share >= 0 && share <= amount)) fields.centreShare = "The centre's share must be from ₦0 up to the fee.";
      if (Object.keys(fields).length) return invalid(fields);
      accounts().set(t.id, { ...accounts().get(t.id), amount, centreShare: share });
      if (s.b) {
        s.b.amount = amount;
        s.b.centreShare = share;
      }
      return json(200, item(t));
    }
    if (method === "PUT" && m[2]) {
      const r = await body<{ resolutionId?: string; confirmedAccountName?: string }>(req);
      const res = resolutions.get(r.resolutionId ?? "");
      if (!res || Date.now() - res.at > 15 * 60_000) return err(409, "resolve_first", "Verify the account number first.");
      if ((r.confirmedAccountName ?? "").trim() !== res.accountName) return invalid({ confirmedAccountName: "Confirm the account name the bank returned." });
      const acc = { bankCode: res.bankCode, bankName: res.bankName, last4: res.last4, accountName: res.accountName, subaccountCode: s.account?.subaccountCode || `ACCT_${uid().slice(0, 10)}`, since: now(), updatedBy: actor };
      accounts().set(t.id, { ...accounts().get(t.id), account: acc });
      if (s.b) s.b.account = acc;
      return json(200, item(t));
    }
  }
  if (method === "GET" && path === "/platform/payments/settlement") {
    const from = url.searchParams.get("from") || `${today().slice(0, 8)}01`;
    const to = url.searchParams.get("to") || today();
    const tid = url.searchParams.get("tenantId");
    const items: { reference: string; university: string; matricNumber: string; label: string; paidAt: string; method: string; amount: number; provider: number; centre: number; gatewayFee: number; providerNet: number; status: string; tenantId: string }[] = [];
    for (const t of tenants) {
      if (tid && t.id !== tid) continue;
      const s = state(t);
      if (!s.b || !t.uni) continue;
      const u = t.uni();
      for (const p of s.b.payments) {
        if (!p.paidAt) continue;
        const d = lagosDay(p.paidAt);
        if (d < from || d > to) continue;
        const fee = Math.min(2000, Math.round(s.amount * 0.015 + 100));
        items.push({ tenantId: t.id, reference: p.reference, university: t.name, matricNumber: u.students.find((x) => x.id === p.studentId)?.matricNumber ?? "", label: "2026/2027 · 1st semester", paidAt: p.paidAt, method: METHOD_LABEL[p.method], amount: s.amount, provider: s.amount - s.centreShare, centre: s.centreShare, gatewayFee: fee, providerNet: s.amount - s.centreShare - fee, status: p.status === "PAID" ? "PAID" : p.status });
      }
    }
    items.sort((a, z) => z.paidAt.localeCompare(a.paidAt));
    const sum = (rows: typeof items) => ({
      payments: rows.length,
      gross: rows.reduce((a, r) => a + r.amount, 0),
      provider: rows.reduce((a, r) => a + r.provider, 0),
      centre: rows.reduce((a, r) => a + r.centre, 0),
      gatewayFees: rows.reduce((a, r) => a + r.gatewayFee, 0),
      providerNet: rows.reduce((a, r) => a + r.providerNet, 0),
      refunded: rows.filter((r) => r.status === "REFUNDED" || r.status === "REFUNDING").reduce((a, r) => a + r.amount, 0),
    });
    const unis = tenants.filter((t) => items.some((i) => i.tenantId === t.id)).map((t) => ({ tenantId: t.id, name: t.name, ...sum(items.filter((i) => i.tenantId === t.id)) }));
    const pg = page(items.map(({ tenantId: _t, ...r }) => (void _t, r)), url, 50);
    return json(200, { from, to, totals: sum(items), universities: unis, ...pg });
  }
  return null;
}

