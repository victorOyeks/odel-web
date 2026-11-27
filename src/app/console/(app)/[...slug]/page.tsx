import type { Metadata } from "next";
import { getPath } from "@/lib/request";
import { sectionLabel } from "@/components/shell/roles";
import { PageState } from "@/components/ui/page-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Coming in a later phase" };

export default async function ConsoleComingLater() {
  const label = sectionLabel(await getPath(), "console");
  return (
    <section className="flex flex-1 items-start justify-center rounded-lg border border-line bg-surface sm:items-center">
      <PageState kind="later" headingLevel={1} title={`${label} is coming in a later phase`} action={<ButtonLink href="/" variant="secondary">Go to universities</ButtonLink>}>
        This part of the provider console is not built yet.
      </PageState>
    </section>
  );
}
