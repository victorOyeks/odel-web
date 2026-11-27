import type { Metadata } from "next";
import { NewUniversity } from "@/components/console/new-university";

export const metadata: Metadata = { title: "Add a university" };

/** SA-02 details (SA-02b taken, SA-02c empty), SA-03 branding (SA-03b contrast), step 3 defaults, SA-05 review. */
export default function NewUniversityPage() {
  return <NewUniversity />;
}
