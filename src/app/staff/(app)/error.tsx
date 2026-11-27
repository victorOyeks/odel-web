"use client";

import { PageState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";

export default function StaffError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <PageState kind="error" headingLevel={1} action={<Button variant="secondary" onClick={reset}>Try again</Button>} />
    </section>
  );
}
