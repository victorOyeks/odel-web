import type { ReactNode } from "react";
import { AcademicTabs } from "@/components/academic/tabs";

/** Academic setup: Sessions · Structure · Staffing · Grading (W-11 … W-17e). */
export default function AcademicSetupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AcademicTabs />
      {children}
    </>
  );
}
