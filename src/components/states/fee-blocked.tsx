import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** Fee blocked (D0 Page State · Fee blocked): banner plus the unpaid fee card. */
export function FeeBlocked({ amount, session, payHref = "/payments" }: { amount: number; session: string; payHref?: string }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <Banner tone="warning" title="Platform fee not paid">
        You can sign in, but you cannot register courses or take exams until it is paid.
      </Banner>
      <FeeStatusCard amount={amount} session={session} payHref={payHref} />
    </div>
  );
}

export function FeeStatusCard({ amount, session, payHref = "/payments" }: { amount: number; session: string; payHref?: string }) {
  return (
    <section aria-label="Platform fee" className="flex w-full flex-col gap-3 rounded-lg bg-warning-subtle p-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-label-sm text-ink-2">Platform fee · {session}</p>
          <p className="text-h2 text-ink">{naira(amount)}</p>
        </div>
        <Badge tone="warning">Not paid</Badge>
      </div>
      <p className="text-body text-ink-2">Pay to register courses and take exams.</p>
      <ButtonLink href={payHref} size="lg" block>
        {`Pay ${naira(amount)}`}
      </ButtonLink>
    </section>
  );
}
