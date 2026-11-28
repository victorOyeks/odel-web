import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import { formatDate } from "@/lib/format";
import type { Fee, RegCourses, RegMe, RegRequest, Registration } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { FeeCard } from "@/components/payments/fee-card";
import { CoursePicker } from "@/components/registration/course-picker";
import { MyRequestCard, RegisteredView } from "@/components/registration/student";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";

export const metadata: Metadata = { title: "Registration" };

/**
 * Course registration: R-01 not open, R-08 fee not paid, fee confirming, R-06 late request needed or waiting, B10 late
 * request approved, R-02 … R-04 choose and submit, R-05b registered with the slip, and the student's own requests.
 */
export default async function RegistrationPage({ searchParams }: PageProps<"/registration">) {
  const sp = await searchParams;
  const s = await requireStudent();
  const me = await apiGet<RegMe>("/registration/me");
  const frame = (children: React.ReactNode) => (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="registration" title="Registration">
      {children}
    </StudentFrame>
  );
  if (!me.ok) {
    return frame(
      <section className="rounded-lg border border-line bg-surface">
        <PageState kind="error" headingLevel={1} action={<RetryButton variant="secondary" />}>
          We could not load registration. Check your connection and try again.
        </PageState>
      </section>,
    );
  }
  const m = me.data;
  const code = m.blocked?.code;
  const [courses, fee, reqs, full] = await Promise.all([
    m.canRegister ? apiGet<RegCourses>(`/registration/me/courses${m.semester ? `?semesterId=${m.semester.id}` : ""}`) : null,
    code === "fee_not_paid" || code === "fee_confirming" ? apiGet<Fee>("/payments/fees/current") : null,
    apiGet<{ items: RegRequest[] }>(`/registration/me/requests${m.semester ? `?semesterId=${m.semester.id}` : ""}`),
    m.registration ? apiGet<Registration>(`/registration/me/registrations/${m.registration.id}`) : null,
  ]);
  const requests = reqs.ok ? reqs.data.items : [];
  const sent = sp.sent === "late" ? "Your late registration request is sent. We email you the decision." : sp.sent === "change" ? "Your course change request is sent. Your coordinator decides; we email you the decision." : null;
  const approvedLate = m.lateRequest?.status === "APPROVED" && m.canRegister;
  const label = m.semester?.label ?? "this semester";

  let body: React.ReactNode;
  if (m.registration) {
    body = <RegisteredView reg={full?.ok ? full.data : m.registration} justDone={sp.done === "1"} />;
  } else if (m.canRegister && courses?.ok) {
    body = (
      <>
        {approvedLate ? (
          <Banner tone="success" title={`Late registration approved${m.lateRequest?.decision ? ` by ${m.lateRequest.decision.by}` : ""}`}>
            Register by {formatDate(m.window?.registerBy)}.
          </Banner>
        ) : null}
        <CoursePicker data={courses.data} />
      </>
    );
  } else if (m.canRegister) {
    body = (
      <section className="rounded-lg border border-line bg-surface">
        <PageState kind="error" headingLevel={1} action={<RetryButton variant="secondary" />}>
          We could not load your courses. Check your connection and try again.
        </PageState>
      </section>
    );
  } else if ((code === "fee_not_paid" || code === "fee_confirming") && fee?.ok) {
    body = (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-h2 text-ink">Course registration · {label}</h1>
        <Banner tone={code === "fee_confirming" ? "info" : "warning"} title={code === "fee_confirming" ? "Your payment is being confirmed" : "Pay the platform fee first"}>
          {m.blocked?.message}
        </Banner>
        <FeeCard fee={fee.data} compact />
        {m.window?.label ? <p className="text-body text-ink-2">Registration: {m.window.label}.</p> : null}
      </div>
    );
  } else {
    const st = {
      not_set: { icon: "event" as const, title: "Registration is not set up yet" },
      not_open: { icon: "event" as const, title: m.window?.opensOn ? `Registration opens ${formatDate(m.window.opensOn)}` : "Registration has not opened yet" },
      late_request_needed: { icon: "schedule" as const, title: "Registration has closed" },
      late_request_pending: { icon: "hourglass_empty" as const, title: "Your late registration request is waiting" },
      closed: { icon: "lock" as const, title: "Registration is closed" },
      suspended: { icon: "block" as const, title: "Your account is suspended" },
    }[code ?? ""] ?? { icon: "info" as const, title: "You cannot register just now" };
    body = (
      <section className="rounded-lg border border-line bg-surface">
        <PageState
          kind="empty"
          icon={st.icon}
          headingLevel={1}
          title={st.title}
          action={
            code === "late_request_needed" ? (
              <ButtonLink href="/registration/late" size="lg">
                Ask for late registration
              </ButtonLink>
            ) : code === "fee_not_paid" || (code === "not_open" && m.fee?.required && !m.fee.paid && m.fee.status !== "CONFIRMING") ? (
              <ButtonLink href="/payments/pay">Pay the platform fee</ButtonLink>
            ) : undefined
          }
        >
          {code === "not_open"
            ? m.fee?.required && !m.fee.paid
              ? "Pay your platform fee before then so you can register on the first day. We email you when it opens."
              : "Your platform fee is paid, so you can register on the first day. We email you when it opens."
            : (m.blocked?.message ?? "Check back later.")}
        </PageState>
      </section>
    );
  }

  return frame(
    <>
      {sent ? <Banner tone="success" title={sent} /> : null}
      {m.registration ? <h1 className="text-h2 text-ink">Course registration · {label}</h1> : null}
      {body}
      {requests.length ? (
        <section aria-labelledby="mine" className="flex flex-col gap-3">
          <h2 id="mine" className="text-h4 text-ink">
            My requests
          </h2>
          {requests.map((r) => (
            <MyRequestCard key={r.id} r={r} />
          ))}
        </section>
      ) : null}
    </>,
  );
}
