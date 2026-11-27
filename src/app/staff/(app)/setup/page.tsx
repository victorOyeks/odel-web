import type { Metadata } from "next";
import { apiGet, getContext, getSession } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { ChecklistB1 } from "@/lib/types-b1";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";
import { ChecklistView } from "@/components/staff/checklist";

export const metadata: Metadata = { title: "Setup checklist" };

/** The academic session a date falls in (Nigerian sessions start in September). */
function sessionLabel(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function greetingName(fullName: string) {
  const parts = fullName.split(/\s+/);
  return /^(Dr|Prof|Mr|Mrs|Ms)\.?$/.test(parts[0]) && parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
}

/** W-10 Setup checklist from real data (day one looks like D10 SA-05c). */
export default async function SetupPage() {
  const [res, session, ctx] = await Promise.all([apiGet<ChecklistB1>("/setup/checklist").then(expectSession), getSession(), getContext()]);
  const uni = ctx.ok ? ctx.data.tenant.name.split(" ")[0] : "The university";
  const header = (
    <PageHeader
      title={`Set up ${(res.ok && res.data.sessionName) || sessionLabel()}`}
      subtitle={`Welcome, ${greetingName(session?.user.fullName ?? "")}. Work through these steps in order. Students can activate once the import is done; ${uni} goes live when every step is done.`}
      actions={
        <ButtonLink href="/" variant="secondary" leadingIcon="visibility">
          Preview as a student
        </ButtonLink>
      }
    />
  );

  if (!res.ok) {
    return (
      <>
        {header}
        <section className="rounded-lg border border-line bg-surface">
          {res.status === 403 ? (
            <PageState kind="no-access">This page is for the ODeL admin. Switch role or ask the ODeL office to update your access.</PageState>
          ) : (
            <PageState kind="error" action={<RetryButton variant="secondary" />}>
              We could not load the setup checklist. Check your connection and try again.
            </PageState>
          )}
        </section>
      </>
    );
  }
  return (
    <>
      {header}
      <ChecklistView checklist={res.data} />
    </>
  );
}
