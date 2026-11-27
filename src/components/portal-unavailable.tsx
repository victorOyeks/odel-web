import { PageState } from "@/components/ui/page-state";

/** Shown instead of any page when this host has no university, or the API cannot be reached. */
export function PortalUnavailable({ unknownHost }: { unknownHost: boolean }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      {/* React hoists this into <head>, replacing the page's own title ("Sign in" etc.). */}
      <title>{unknownHost ? "Not set up · ODeL" : "Not available · ODeL"}</title>
      {unknownHost ? (
        <PageState kind="no-access" icon="block" title="This web address is not set up" headingLevel={1}>
          There is no ODeL portal at this address. Check the address your university sent you, or contact its ODeL office.
        </PageState>
      ) : (
        <PageState kind="error" title="The portal is not available right now" headingLevel={1}>
          We cannot reach the portal’s server. Check your connection, then try again in a few minutes.
        </PageState>
      )}
    </main>
  );
}
