import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext } from "@/lib/host";
import { AuthLayout, AuthLead, AuthTitle } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Banner } from "@/components/ui/banner";
import { pathForStage } from "@/components/auth/routing";

export const metadata: Metadata = { title: "Sign in" };

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

function noticeFor(error: string | undefined, email: string | undefined, domain: string | undefined, reason: string | undefined, signedOut: boolean): Notice | null {
  const at = domain ? `@${domain}` : "university";
  switch (error) {
    case "not_linked":
      return {
        tone: "warning",
        title: "The Google account you chose is not on the staff list",
        body: `Check that you chose your ${at} account. If you are new, ask the ODeL office to add you to the portal, then sign in again.`,
      };
    case "no_role":
      return {
        tone: "warning",
        title: "You do not have a role in the portal yet",
        body: "Your staff record is there, but no role has been given to you. Ask the ODeL office to give you a role, then sign in again.",
      };
    case "wrong_domain":
      return {
        tone: "warning",
        title: email ? `${email} is not a university account` : "That is not a university account",
        body: `Sign in with your ${at} address. If you are new, ask the ODeL office to add you to the portal.`,
      };
    case "suspended":
      return { tone: "danger", title: "Your staff account is suspended", body: "Contact the ODeL office if you think this is a mistake." };
    case "cancelled":
      return { tone: "info", title: "Sign-in was cancelled", body: "Choose your university Google account to continue." };
    case "expired":
      return { tone: "warning", title: "Sign-in took too long", body: "For your security it timed out. Start again." };
    case "too_many_attempts":
      return {
        tone: "danger",
        title: "Too many wrong codes",
        body: "For your security we ended this sign-in. Start again and use the newest code from your authenticator app.",
      };
  }
  if (reason === "idle") {
    return {
      tone: "info",
      title: "You were signed out",
      body: "For security we sign staff out after 30 minutes without activity. Sign in again to continue where you were.",
    };
  }
  if (signedOut) return { tone: "success", title: "You signed out", body: "Sign in again any time." };
  return null;
}

/** W-01 Google sign-in, W-02 account not linked, S-02 signed out, and the other sign-in errors. */
export default async function SignInPage({ searchParams }: PageProps<"/staff/sign-in">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const surface = await getSurface();
  const ctx = await getContext();
  if (!ctx.ok) return null;
  const next = safeNext(str("next"), homePath(surface));

  // Already signed in (or half-way through): carry on instead of starting again.
  if (!str("error") && !str("reason") && !str("signedOut")) {
    const session = await getSession();
    if (session) redirect(pathForStage(session.stage, surface, next));
  }

  const t = ctx.data.tenant;
  const paused = surface === "university" && (t.status === "SUSPENDED" || str("error") === "university_suspended");
  const error = str("error");
  const notice = noticeFor(error, str("email"), t.googleDomain, str("reason"), str("signedOut") === "1");
  const notLinked = error === "not_linked" || error === "wrong_domain" || error === "no_role";

  return (
    <AuthLayout ctx={ctx.data} surface={surface}>
      {paused ? (
        <>
          <AuthTitle>Staff sign in</AuthTitle>
          <Banner tone="warning" title={`${t.name}’s portal is paused`}>
            The university has paused its ODeL portal, so nobody can sign in at the moment. Contact the ODeL office for
            help.
          </Banner>
        </>
      ) : (
        <>
          <AuthTitle>
            {error === "no_role" ? "Your account has no role yet" : notLinked ? "We could not find your staff record" : surface === "console" ? "Provider sign in" : "Staff sign in"}
          </AuthTitle>
          {!notLinked ? (
            <AuthLead>
              {t.googleDomain
                ? `Use your @${t.googleDomain} Google account. You will not need a separate password.`
                : "Use your work Google account. You will not need a separate password."}
            </AuthLead>
          ) : null}
          {notice ? (
            <Banner tone={notice.tone} title={notice.title}>
              {notice.body}
            </Banner>
          ) : null}
          <GoogleButton returnTo={next} />
          {surface === "university" ? (
            <>
              <p className="text-body-sm text-ink-3">Students sign in on the student portal with their matric number.</p>
              <Link href="/" className="self-start text-label text-brand underline-offset-4 hover:underline">
                Go to student sign-in
              </Link>
            </>
          ) : null}
        </>
      )}
    </AuthLayout>
  );
}
