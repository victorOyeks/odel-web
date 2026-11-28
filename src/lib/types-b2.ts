// B2 (Pay and register) shapes, from odel-backend docs/api-b2-payments.md and docs/api-b2-registration.md.

export type FeeStatus = "NOT_PAID" | "CONFIRMING" | "PAID" | "REFUNDED" | "REVERSED";
export type PayMethod = "CARD" | "BANK_TRANSFER" | "USSD";
export type PaymentStatus = "PENDING" | "CONFIRMING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED" | "REFUNDING" | "REFUNDED" | "REVERSED";

export interface Refund {
  reference: string;
  amount: number;
  amountLabel: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  startedAt: string;
  processedAt: string | null;
  expectedBy: string | null;
  to: string | null;
  reason: string | null;
}

/** Paystack's charge, paid by the student (owner, 28 Nov 2026). `estimate` until Paystack has given the real figure. */
export interface Charge {
  studentPays: boolean;
  fee: number;
  charge: number;
  total: number;
  feeLabel: string;
  chargeLabel: string;
  totalLabel: string;
  estimate: boolean;
  note: string | null;
}

export interface Payment {
  id: string;
  feeId: string;
  label: string;
  reference: string;
  method: PayMethod;
  methodLabel: string;
  amount: number;
  amountLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  message: string | null;
  startedAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  checkout: { authorizationUrl: string } | null;
  ussd: { bank: string; code: string; expiresAt: string } | null;
  transfer: { bankName: string; accountNumber: string; accountName: string; amount: number; amountLabel: string; expiresAt: string; note: string } | null;
  failureReason: string | null;
  receiptUrl: string | null;
  refund: Refund | null;
  charge?: Charge | null;
}

export interface Fee {
  id: string;
  semesterId: string;
  sessionId: string;
  sessionName: string;
  semesterNumber: number;
  semesterName: string;
  label: string;
  amount: number;
  amountLabel: string;
  status: FeeStatus;
  statusLabel: string;
  message: string;
  locked: boolean;
  openPayment: Payment | null;
  paidPayment: { id: string; reference: string; paidAt: string; method: PayMethod; methodLabel: string; receiptUrl: string } | null;
  duplicate: { paymentId: string; reference: string; paidAt: string; amount: number; amountLabel: string; refund: Refund | null } | null;
  reversal: { paymentId: string; reference: string; reversedAt: string; message: string } | null;
  methods: { key: PayMethod; label: string }[];
  ussdBanks: { key: string; name: string; code: string }[];
  ussdOtherBanks: string;
  actions: ("PAY" | "CHECK_STATUS" | "DOWNLOAD_RECEIPT" | "VIEW_PAYMENTS")[];
  charge?: Charge | null;
}

// ---- staff payments

export interface PaymentsSummary {
  semester: { id: string; label: string } | null;
  amount: number;
  amountLabel: string;
  paid: { count: number; collected: number; collectedLabel: string };
  confirming: { count: number; oldestStartedAt: string | null };
  notPaid: { count: number };
  refunds: { count: number; amount: number; amountLabel: string };
  reversed: { count: number };
  students: number;
}

export type PaymentRowStatus = "PAID" | "CONFIRMING" | "NOT_PAID" | "FAILED" | "REFUNDED" | "REVERSED";

export interface PaymentRow {
  studentId: string;
  fullName: string;
  matricNumber: string;
  centre: { code: string; name: string; shortName?: string | null } | null;
  programme: { code: string; name: string } | null;
  level: number | null;
  status: PaymentRowStatus;
  statusLabel: string;
  paidTwice: boolean;
  method: PayMethod | null;
  methodLabel: string | null;
  reference: string | null;
  date: string | null;
  paymentId: string | null;
}

export interface StudentFeeRecord {
  student: { id: string; fullName: string; matricNumber: string; programme?: { code: string; name: string } | null; level?: number | null; levelLabel?: string | null; centre?: { code: string; name: string; shortName?: string | null } | null; email?: string | null };
  fee: Fee | null;
  attempts: Payment[];
}

export interface SettlementAccount {
  bankCode?: string;
  bankName: string;
  accountNumberMasked: string;
  accountName: string;
  subaccountCode?: string;
  since: string | null;
  updatedBy?: { fullName: string } | null;
}

export interface FeeSettings {
  amount: number;
  amountLabel: string;
  paymentsOpen: boolean;
  settlementAccount: SettlementAccount | null;
}

// ---- provider console

export interface UniversityPayments {
  tenantId: string;
  name: string;
  amount: number;
  centreShare: number;
  providerShare: number;
  settlementAccount: SettlementAccount | null;
  paymentsOpen: boolean;
}

export interface Bank {
  code: string;
  name: string;
}

export interface ResolvedAccount {
  bankCode: string;
  bankName: string;
  accountNumberMasked: string;
  accountName: string;
  resolutionId: string;
}

export interface SettlementMoney {
  payments: number;
  gross: number;
  provider: number;
  centre: number;
  gatewayFees: number;
  providerNet: number;
  refunded: number;
}

export interface SettlementReport {
  from: string;
  to: string;
  totals: SettlementMoney;
  universities: (SettlementMoney & { tenantId: string; name: string })[];
  items: { reference: string; university: string; matricNumber: string; label: string; paidAt: string; method: string; amount: number; provider: number; centre: number; gatewayFee: number; studentCharge?: number; providerNet: number; status: string }[];
  page: number;
  size: number;
  total: number;
}

// ---- registration

export type WindowState = "NOT_SET" | "NOT_OPEN" | "OPEN" | "LATE" | "CLOSED";

export interface RegSemester {
  id: string;
  sessionId: string;
  sessionName: string;
  number: number;
  label: string;
  name: string;
}

export interface RegWindow {
  state: WindowState;
  opensOn: string | null;
  closesOn: string | null;
  lateClosesOn: string | null;
  changesCloseOn: string | null;
  label: string | null;
  registerBy: string | null;
}

export interface RegLimits {
  minUnits: number;
  maxUnits: number;
  maxElectives: number;
}

export type CourseKind = "COMPULSORY" | "ELECTIVE" | "CARRY_OVER";

export interface RegCourse {
  courseId: string;
  code: string;
  title: string;
  units: number;
  kind: CourseKind;
  kindLabel?: string;
  locked?: boolean;
  selected?: boolean;
  fromSession?: string;
}

export interface Registration {
  id: string;
  semester: RegSemester;
  status: string;
  late: boolean;
  slipNumber: string;
  slipVersion: number;
  verificationCode: string;
  courses: RegCourse[];
  courseCount: number;
  totalUnits: number;
  submittedAt: string;
  updatedAt: string | null;
  changesCloseOn: string | null;
  canRequestChange: boolean;
  centre: { id: string; code: string; name: string } | null;
  history?: { at: string; action: string; summary: string; by: string | null; slipVersion: number }[];
}

export type RequestStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

export interface RegRequest {
  id: string;
  kind: "LATE" | "CHANGE";
  status: RequestStatus;
  statusLabel: string;
  semester: RegSemester;
  student: { id: string; matricNumber: string; fullName: string; programme: string; level: number; levelLabel: string };
  centre: { id: string; name: string; hasCoordinator: boolean } | null;
  reasonCategory: string | null;
  reasonCategoryLabel: string | null;
  reason: string;
  attachment: { fileName: string; size: number; sizeLabel: string; contentType: string; type: string } | null;
  change: { drop: RegCourse[]; add: RegCourse[]; unitsBefore: number; unitsAfter: number; maxUnits: number; summary: string } | null;
  registerBy: string | null;
  decision: { at: string; by: string; role: string; note: string | null } | null;
  createdAt: string;
  registeredOn: string | null;
  registration?: Registration | null;
}

export interface RegMe {
  student: { id: string; matricNumber: string; fullName: string; programme: { id: string; code: string; name: string }; level: number; levelLabel: string; centre: { id: string; code: string; name: string } };
  semester: RegSemester | null;
  window: RegWindow | null;
  fee: { required: boolean; status: string; paid: boolean; label: string; payPath: string } | null;
  canRegister: boolean;
  blocked: { code: string; message: string } | null;
  registration: Registration | null;
  lateRequest: RegRequest | null;
  changeRequest: RegRequest | null;
  limits: RegLimits;
}

export interface RegCourses {
  semester: RegSemester;
  window: RegWindow;
  limits: RegLimits;
  compulsory: RegCourse[];
  carryOvers: RegCourse[];
  electives: RegCourse[];
  lockedUnits: number;
  lockedCourses: number;
  subtitle: string;
}

export interface RegCheck {
  totalUnits: number;
  courseCount: number;
  electiveCount: number;
  ok: boolean;
  problems: { code: string; message: string }[];
  counter: string;
}

export interface RegReportRow {
  studentId: string;
  fullName: string;
  matricNumber: string;
  programme: { id: string; code: string; name: string } | null;
  level: number | null;
  centre: { id: string; code: string; name: string } | null;
  courseCount: number | null;
  units: number | null;
  submittedAt: string | null;
  changedAt: string | null;
  registrationId: string | null;
  status: string;
  statusLabel: string;
  feeStatus: string | null;
}

export interface RegReport {
  semester: RegSemester | null;
  window: RegWindow | null;
  subtitle: string;
  cards: { registered: number; paid: number | null; paidNotRegistered: number | null; lateRequests: number; lateRequestsAtCentres: number; lateRequestsAtOffice: number; courseChanges: number };
  items: RegReportRow[];
  page: number;
  size: number;
  total: number;
  feeStatusKnown: boolean;
}

export interface RegStudent {
  student: { id: string; fullName: string; matricNumber: string; programme?: string | { name: string } | null; level?: number; levelLabel?: string; centre?: { name: string } | null };
  registration: Registration | null;
  requests: RegRequest[];
  carryOvers: CarryOver[];
}

export interface RegRules {
  semester: RegSemester | null;
  window: { opensOn: string | null; closesOn: string | null; lateClosesOn: string | null; changesCloseOn: string | null; changesCloseOnDefault: boolean } | null;
  fee: { blockRegistration: boolean; blockExams: boolean; previewsWhenUnpaid: boolean };
  programme: { id: string; name: string } | null;
  inheritedFromDefault: boolean;
  levels: { level: number; minUnits: number; maxUnits: number; maxElectives: number; compulsoryUnits: number; fits: boolean }[];
  programmesWithOwnLimits: { id: string; name: string }[];
  note: string;
}

export interface CarryOver {
  id: string;
  studentId: string;
  courseId: string;
  code: string;
  title: string;
  units: number;
  semester: number;
  fromSession: string;
  source: string;
  status: "OPEN" | "CLEARED";
  createdAt: string;
  createdBy: string | null;
  studentName?: string;
  matricNumber?: string;
}

export interface SlipVerification {
  valid: boolean;
  slipNumber: string;
  studentName: string;
  matricNumber: string;
  programme: string;
  semester: string;
  courseCount: number;
  totalUnits: number;
  submittedAt: string;
  updatedAt: string | null;
  slipVersion: number;
}

// ---- A-06 centre move

export interface CentreMove {
  id: string;
  from: { id: string; code: string; name: string };
  to: { id: string; code: string; name: string };
  reason: string;
  effectiveOn: string;
  status: "DONE" | "SCHEDULED" | "CANCELLED";
  requestedBy: string;
  createdAt: string;
  appliedAt: string | null;
  notified: { name: string; role: string; email: string | null }[];
  notNotified: string[];
  summary: string;
}
