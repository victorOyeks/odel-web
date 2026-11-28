"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { AddressAvailability, LogoUpload, NewTenant, TenantDetail } from "@/lib/types";
import { brandVariables, contrast, formatRatio, normaliseHex, suggestReadable, whiteTextPasses } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/shell/page-header";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { KeyValues } from "./kv";
import { SettlementAccountForm } from "./payments-card";
import { Checkbox } from "@/components/ui/fields";
import { naira } from "@/lib/format";
import type { ResolvedAccount } from "@/lib/types-b2";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Details" },
  { n: 2, label: "Branding" },
  { n: 3, label: "Rules and payments" },
  { n: 4, label: "Review" },
];

interface Form {
  name: string;
  shortName: string;
  webAddress: string;
  slug: string;
  googleDomain: string;
  adminName: string;
  adminEmail: string;
  primary: string;
  accent: string;
}

type Errors = Partial<Record<keyof Form | "logo", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
/** The base of every university's platform address, from the console's own host (odel-console-dev.x.com -> odel-dev.x.com). */
function platformBase(): string {
  if (typeof window === "undefined") return "…";
  const h = window.location.hostname;
  if (h.startsWith("console.")) return h.slice("console.".length);
  return h.replace(/-console(?=-|\.)/, "").replace(/^console-/, "");
}

/** Test and example domains can never have a real DNS record (the API refuses them too). */
const RESERVED_RE = /(\.(test|example|invalid|localhost|local)|(^|\.)example\.(com|org|net))$/i;
const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

/** QA ODEL-B0-003: names need at least one letter (any alphabet); 11111 or --- is refused. */
const HAS_LETTER = /\p{L}/u;
const NEEDS_LETTERS = "Use letters: a name cannot be only numbers or symbols";

function suggestSlug(name: string) {
  return (name.toLowerCase().match(/[a-z][a-z0-9]*/)?.[0] ?? "").slice(0, 31);
}
function suggestDomain(web: string) {
  const parts = web.toLowerCase().split(".");
  return parts.length >= 3 ? parts.slice(1).join(".") : web.toLowerCase();
}

/** SA-02 … SA-05: add a university in four steps. Nothing is created until the last step. */
export function NewUniversity() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [f, setF] = useState<Form>({
    name: "",
    shortName: "",
    webAddress: "",
    slug: "",
    googleDomain: "",
    adminName: "",
    adminEmail: "",
    primary: "#1A2368",
    accent: "#C27808",
  });
  const touched = useRef<Set<keyof Form>>(new Set());
  const [errors, setErrors] = useState<Errors>({});
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [logo, setLogo] = useState<{ key: string; name: string; previewUrl: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [fee, setFee] = useState({ amount: "15000", share: "3000" });
  const [feeErr, setFeeErr] = useState<{ amount?: string; share?: string; account?: string }>({});
  const [account, setAccount] = useState<ResolvedAccount | null>(null);
  const [accountOk, setAccountOk] = useState(false);

  function set<K extends keyof Form>(k: K, v: string) {
    touched.current.add(k);
    setF((prev) => {
      const next = { ...prev, [k]: v };
      // Fill the related fields until the person edits them.
      if (k === "name") {
        if (!touched.current.has("slug")) next.slug = suggestSlug(v);
        if (!touched.current.has("shortName")) next.shortName = v.trim() ? `${v.trim().split(/\s+/)[0]} ODeL` : "";
      }
      if (k === "webAddress" && !touched.current.has("googleDomain")) next.googleDomain = suggestDomain(v.trim());
      return next;
    });
    setErrors((e) => ({ ...e, [k]: undefined }));
    if (k === "webAddress" || k === "slug") setTaken(null);
  }

  function go(n: Step) {
    setStep(n);
    setFailure(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      window.scrollTo({ top: 0 });
    });
  }

  function validateDetails(): Errors {
    const e: Errors = {};
    if (!f.name.trim()) e.name = "Enter the university’s full name";
    else if (!HAS_LETTER.test(f.name)) e.name = NEEDS_LETTERS;
    if (!f.shortName.trim()) e.shortName = "Enter a short name, for example Wesley ODeL";
    else if (!HAS_LETTER.test(f.shortName)) e.shortName = NEEDS_LETTERS;
    if (f.webAddress.trim() && !HOST_RE.test(f.webAddress.trim())) e.webAddress = "Enter an address like odl.crestfield.edu.ng, without https://";
    else if (f.webAddress.trim() && RESERVED_RE.test(f.webAddress.trim()))
      e.webAddress = "Use a real domain the university controls; test domains like .test or example.com can never be reached";
    if (!SLUG_RE.test(f.slug)) e.slug = "Use 2–31 lowercase letters, numbers or dashes, starting with a letter";
    if (!f.googleDomain.trim() || !HOST_RE.test(f.googleDomain.trim())) e.googleDomain = "Enter the domain staff emails end with, for example crestfield.edu.ng";
    if (!f.adminName.trim()) e.adminName = "Enter the first admin’s name";
    else if (!HAS_LETTER.test(f.adminName)) e.adminName = "Enter the first admin’s real name, in letters";
    if (!EMAIL_RE.test(f.adminEmail.trim())) e.adminEmail = "Enter an email address like name@crestfield.edu.ng";
    else if (f.googleDomain && !f.adminEmail.trim().toLowerCase().endsWith(`@${f.googleDomain.trim().toLowerCase()}`))
      e.adminEmail = `Use their @${f.googleDomain.trim()} address so they can sign in with Google`;
    return e;
  }

  async function nextFromDetails() {
    const e = validateDetails();
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(e);
      return;
    }
    setBusy(true);
    const q = new URLSearchParams({ slug: f.slug, name: f.name.trim() });
    if (f.webAddress.trim()) q.set("webAddress", f.webAddress.trim().toLowerCase());
    const r = await api<AddressAvailability>("GET", `/platform/tenants/address-available?${q}`);
    setBusy(false);
    if (!r.ok) {
      setFailure(r.error.message ?? "We could not check the web address. Try again.");
      return;
    }
    const e2: Errors = {};
    if (r.data.name && !r.data.name.available) e2.name = r.data.name.message ?? "A university with this name is already on the platform";
    if (r.data.webAddress && !r.data.webAddress.available) e2.webAddress = r.data.webAddress.message ?? "Already used by another university";
    if (r.data.slug && !r.data.slug.available) e2.slug = r.data.slug.message ?? "Already used by another university";
    if (Object.keys(e2).length) {
      setErrors(e2);
      if (e2.webAddress || e2.slug) setTaken(e2.webAddress ? "web" : "slug");
      focusFirstError(e2);
      return;
    }
    go(2);
  }

  const primaryHex = normaliseHex(f.primary);
  const accentHex = normaliseHex(f.accent);
  const ratio = primaryHex ? contrast("#FFFFFF", primaryHex) : 0;
  const readable = !!primaryHex && whiteTextPasses(primaryHex);

  function nextFromBranding() {
    const e: Errors = {};
    if (!primaryHex) e.primary = "Enter a colour like #0F6E6E";
    else if (!readable) e.primary = `Text on it is hard to read (${formatRatio(ratio)})`;
    if (!accentHex) e.accent = "Enter a colour like #E07A2E";
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(e);
      return;
    }
    go(3);
  }

  async function upload(file: File) {
    setErrors((e) => ({ ...e, logo: undefined }));
    if (!["image/svg+xml", "image/png"].includes(file.type)) {
      setErrors((e) => ({ ...e, logo: "Use an SVG or PNG file" }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((e) => ({ ...e, logo: "The logo must be 2 MB or smaller" }));
      return;
    }
    setUploading(true);
    const r = await api<LogoUpload>("POST", "/platform/logo-uploads", { fileName: file.name, contentType: file.type, size: file.size });
    if (!r.ok) {
      setUploading(false);
      setErrors((e) => ({ ...e, logo: r.error.fields?.file ?? r.error.message ?? "We could not upload the logo. Try again." }));
      return;
    }
    try {
      // uploadUrl is opaque: relative (dev storage, through our /api proxy) or absolute (R2).
      const put = await fetch(r.data.uploadUrl, { method: r.data.method ?? "PUT", headers: r.data.headers, body: file });
      if (!put.ok) throw new Error(String(put.status));
    } catch {
      setUploading(false);
      setErrors((e) => ({ ...e, logo: "The upload did not finish. Check your connection and try again." }));
      return;
    }
    const p = await api<{ url: string }>("GET", `/platform/logo-uploads/preview?key=${encodeURIComponent(r.data.key)}`);
    setLogo({ key: r.data.key, name: file.name, previewUrl: p.ok ? p.data.url : URL.createObjectURL(file) });
    setUploading(false);
  }

  async function create() {
    setBusy(true);
    setFailure(null);
    const body: NewTenant = {
      name: f.name.trim(),
      shortName: f.shortName.trim(),
      slug: f.slug,
      webAddress: f.webAddress.trim() ? f.webAddress.trim().toLowerCase() : null,
      googleDomain: f.googleDomain.trim().toLowerCase(),
      branding: { primaryColor: primaryHex!, accentColor: accentHex!, logoKey: logo?.key ?? null },
      firstAdmin: { fullName: f.adminName.trim(), email: f.adminEmail.trim().toLowerCase() },
    };
    const r = await api<TenantDetail>("POST", "/platform/tenants", body);
    if (r.ok) {
      // Payment settings need the new university's id, so they are saved right after it is created.
      const feeSaved = await api("PUT", `/platform/payments/universities/${r.data.id}`, { amount: Number(fee.amount), centreShare: Number(fee.share) });
      const accSaved = account && accountOk ? await api("PUT", `/platform/payments/universities/${r.data.id}/settlement-account`, { resolutionId: account.resolutionId, confirmedAccountName: account.accountName }) : { ok: true };
      router.push(`/universities/${r.data.id}?created=1${feeSaved.ok && accSaved.ok ? "" : "&payments=failed"}`);
      return;
    }
    setBusy(false);
    const code = r.error.error;
    if (code === "web_address_taken" || code === "slug_taken") {
      setErrors(code === "web_address_taken" ? { webAddress: "Already used by another university" } : { slug: "Already used by another university" });
      setTaken(code === "web_address_taken" ? "web" : "slug");
      go(1);
      return;
    }
    if (code === "name_taken") {
      setErrors({ name: r.error.fields?.name ?? r.error.message ?? "A university with this name is already on the platform" });
      go(1);
      return;
    }
    if (code === "contrast") {
      setErrors({ primary: r.error.fields?.primaryColor ?? "Text on it is hard to read" });
      go(2);
      return;
    }
    if (r.error.fields && Object.keys(r.error.fields).length) {
      const map: Record<string, keyof Form> = {
        name: "name",
        shortName: "shortName",
        slug: "slug",
        webAddress: "webAddress",
        googleDomain: "googleDomain",
        "firstAdmin.fullName": "adminName",
        "firstAdmin.email": "adminEmail",
        "branding.primaryColor": "primary",
        primaryColor: "primary",
        "branding.accentColor": "accent",
      };
      const e: Errors = {};
      for (const [k, v] of Object.entries(r.error.fields)) if (map[k]) e[map[k]] = v;
      setErrors(e);
      go(e.primary || e.accent ? 2 : 1);
      return;
    }
    setFailure(r.error.message ?? "We could not create the university. Nothing was saved. Try again.");
  }

  function focusFirstError(e: Errors) {
    const first = Object.keys(e)[0];
    if (first) requestAnimationFrame(() => document.getElementById(`f-${first}`)?.focus());
  }

  const subtitle = {
    1: "Step 1 of 4 · nothing is live until you create it on the last step.",
    2: "Step 2 of 4 · students see this on the web, in emails and on printed slips.",
    3: "Step 3 of 4 · the platform fee and where the university's share is paid.",
    4: "Step 4 of 4 · check everything, then create the university.",
  }[step];
  const title = step === 2 && f.name ? `Branding for ${f.name}` : "Add a university";

  return (
    <>
      <div tabIndex={-1} ref={headingRef as never} className="outline-none">
        <PageHeader title={title} subtitle={subtitle} />
      </div>
      <ol aria-label="Steps" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {STEPS.map((s) => {
          const current = s.n === step;
          const done = s.n < step;
          return (
            <li key={s.n} aria-current={current ? "step" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-[20px] border border-line px-3 py-2 text-label text-ink", current ? "bg-brand-subtle" : "bg-surface")}>
              <Icon name={done ? "check_circle" : current ? "radio_button_checked" : "radio_button_unchecked"} className={current || done ? "text-brand" : "text-icon-2"} />
              {s.n}. {s.label}
              {done ? <span className="sr-only">(done)</span> : null}
            </li>
          );
        })}
      </ol>

      {failure ? <Banner tone="danger" title="Something went wrong">{failure}</Banner> : null}

      {step === 1 ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void nextFromDetails();
          }}
          className="flex flex-col gap-6"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6">
            <div className="flex flex-col gap-4">
              <TextField id="f-name" label="Full name" placeholder="Type the university’s full name" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoComplete="organization" />
              <TextField id="f-shortName" label="Short name" placeholder="For example: Crestfield ODeL" value={f.shortName} onChange={(e) => set("shortName", e.target.value)} error={errors.shortName} hint="Shown in emails, in the authenticator app and when students install the portal" />
              <TextField id="f-webAddress" label="Own web address (optional)" placeholder="For example: odl.crestfield.edu.ng" value={f.webAddress} onChange={(e) => set("webAddress", e.target.value)} error={errors.webAddress} hint={errors.webAddress ? undefined : "The university’s own domain. Leave empty to start with the platform address; it can be added later"} inputMode="url" autoCapitalize="none" spellCheck={false} />
              <TextField id="f-slug" label="Short address" placeholder="For example: crestfield" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} error={errors.slug} hint={errors.slug ? undefined : `Their platform address: ${f.slug || "short-address"}.${platformBase()} — live as soon as you create the university`} autoCapitalize="none" spellCheck={false} />
            </div>
            <div className="flex flex-col gap-4">
              <TextField id="f-adminName" label="First admin’s name (they set up everything else)" placeholder="Type a name" value={f.adminName} onChange={(e) => set("adminName", e.target.value)} error={errors.adminName} autoComplete="off" />
              <TextField id="f-adminEmail" type="email" label="First admin’s email (the invitation goes here)" placeholder="Type an email address" value={f.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} error={errors.adminEmail} autoComplete="off" autoCapitalize="none" spellCheck={false} />
              <TextField id="f-googleDomain" label="Staff Google domain" placeholder="For example: crestfield.edu.ng" value={f.googleDomain} onChange={(e) => set("googleDomain", e.target.value)} error={errors.googleDomain} hint={errors.googleDomain ? undefined : "Staff sign in with Google accounts on this domain"} autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
          {taken ? (
            <Banner tone="danger" title={taken === "web" ? "That web address is taken" : "That short address is taken"}>
              {taken === "web"
                ? "Each university needs its own address. Use the university’s own domain, e.g. odl.crestfield.edu.ng."
                : "Each university needs its own short address. Try the university’s name or initials."}
            </Banner>
          ) : null}
          <Actions>
            <ButtonLink href="/" variant="ghost">
              Cancel
            </ButtonLink>
            <Button type="submit" leadingIcon="arrow_forward" loading={busy}>
              Next: branding
            </Button>
          </Actions>
        </form>
      ) : null}

      {step === 2 ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            nextFromBranding();
          }}
          className="flex flex-col gap-6 lg:flex-row lg:items-start"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-subtle p-3">
              {logo?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.previewUrl} alt="" className="size-8 object-contain" />
              ) : (
                <Icon name="image" size={32} className="text-brand" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-label text-ink">{logo?.name ?? "No logo yet"}</p>
                <p className="text-body-sm text-ink-2">Logo · SVG or PNG, square, at least 512 px, 2 MB at most</p>
              </div>
              <label className={cn("inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] border-brand bg-surface px-4 text-label text-brand hover:bg-brand-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus md:h-10", uploading && "pointer-events-none opacity-70")}>
                {uploading ? <Icon name="progress_activity" className="spin" /> : <Icon name="upload" />}
                {uploading ? "Uploading" : logo ? "Replace" : "Upload logo"}
                <input
                  id="f-logo"
                  type="file"
                  accept=".svg,.png,image/svg+xml,image/png"
                  className="sr-only"
                  aria-describedby={errors.logo ? "logo-error" : undefined}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {errors.logo ? (
                <p id="logo-error" role="alert" className="w-full text-body-sm text-danger">
                  {errors.logo}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColourField id="f-primary" label="Main colour" value={f.primary} onChange={(v) => set("primary", v)} error={errors.primary ?? (primaryHex && !readable ? `Text on it is hard to read (${formatRatio(ratio)})` : undefined)} hint={primaryHex && readable ? `Text on it reads well (${formatRatio(ratio)})` : undefined} />
              <ColourField id="f-accent" label="Accent colour" value={f.accent} onChange={(v) => set("accent", v)} error={errors.accent} hint="Used for highlights and badges" />
            </div>
            {primaryHex && !readable ? (
              <Banner
                tone="danger"
                title="The main colour fails the readability check"
                action={
                  <button type="button" className="min-h-12 underline-offset-4 hover:underline md:min-h-0" onClick={() => set("primary", suggestReadable(primaryHex))}>
                    Use {suggestReadable(primaryHex)} instead
                  </button>
                }
              >
                White text on {primaryHex} is {formatRatio(ratio)}; it must be at least 4.5 : 1. Pick a darker shade or use the one we suggest.
              </Banner>
            ) : null}
            <Actions>
              <Button type="button" variant="ghost" onClick={() => go(1)}>
                Back
              </Button>
              <Button type="submit" leadingIcon="arrow_forward">
                Next: rules and payments
              </Button>
            </Actions>
          </div>
          <BrandPreview name={f.name || "University name"} primary={primaryHex ?? "#1A2368"} accent={accentHex ?? "#C27808"} logoUrl={logo?.previewUrl ?? null} />
        </form>
      ) : null}

      {step === 3 ? (
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            const a = Number(fee.amount);
            const sh = Number(fee.share);
            const err: typeof feeErr = {};
            if (!(a >= 1000 && a <= 1_000_000)) err.amount = "Enter a fee from ₦1,000 to ₦1,000,000.";
            if (!(fee.share !== "" && sh >= 0 && sh <= a)) err.share = "The centre's share must be from ₦0 up to the fee.";
            if (account && !accountOk) err.account = "Tick the box to confirm the account name, or clear the account to set it later.";
            setFeeErr(err);
            if (!Object.keys(err).length) go(4);
          }}
        >
          <Banner tone="info" title="Grading starts on the defaults">
            The 5-point scale, 30% coursework and 70% exam. The university&apos;s ODeL admin reviews the academic rules from the setup checklist.
          </Banner>
          <section aria-labelledby="fee-h" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 id="fee-h" className="text-h4 text-ink">
              Platform fee
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Fee per student per semester (₦)" inputMode="numeric" value={fee.amount} onChange={(e) => setFee((x) => ({ ...x, amount: e.target.value.replace(/\D/g, "") }))} error={feeErr.amount} />
              <TextField label="ODeL centre's share (₦)" inputMode="numeric" value={fee.share} onChange={(e) => setFee((x) => ({ ...x, share: e.target.value.replace(/\D/g, "") }))} error={feeErr.share} />
            </div>
            <p className="text-body-sm text-ink-2">
              Provider&apos;s share {naira(Math.max(0, Number(fee.amount) - Number(fee.share)))} per payment; Paystack&apos;s charge comes out of it. Only the provider sees this split.
            </p>
          </section>
          <section aria-labelledby="acc-h" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 id="acc-h" className="text-h4 text-ink">
              Settlement account (optional now)
            </h2>
            <p className="text-body text-ink-2">The ODeL centre&apos;s share goes here through a Paystack subaccount. Students cannot pay until it is set; you can also set it later on the university page.</p>
            <SettlementAccountForm
              resolved={account}
              onResolved={(r) => {
                setAccount(r);
                setAccountOk(false);
              }}
            />
            {account ? (
              <Checkbox label={`${account.accountName} is the university's ODeL account`} checked={accountOk} onChange={(e) => setAccountOk(e.target.checked)} hint="It is saved when you create the university (within 15 minutes of verifying)." />
            ) : null}
            {feeErr.account ? <p className="text-body-sm text-danger">{feeErr.account}</p> : null}
          </section>
          <Actions>
            <Button type="button" variant="ghost" onClick={() => go(2)}>
              Back
            </Button>
            <Button type="submit" leadingIcon="arrow_forward">
              Next: review
            </Button>
          </Actions>
        </form>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-6">
          <KeyValues
            rows={[
              { label: "University", value: `${f.name.trim()} · ${f.shortName.trim()}` },
              { label: "Platform address", value: `${f.slug}.${platformBase()} · live as soon as you create it` },
              {
                label: "Own web address",
                value: f.webAddress.trim() ? `${f.webAddress.trim().toLowerCase()} · we show the DNS record to add after you create it` : "None yet · can be added later",
              },
              { label: "Staff sign-in", value: `Google accounts ending @${f.googleDomain.trim().toLowerCase()}` },
              {
                label: "Branding",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Swatch hex={primaryHex!} /> <Swatch hex={accentHex!} /> <span>· readability passed{logo ? ` · logo ${logo.name}` : " · no logo yet"}</span>
                  </span>
                ),
              },
              {
                label: "Rules and payments",
                value: `Default grading · ${naira(Number(fee.amount))} per semester, ${naira(Number(fee.share))} to the ODeL centre · ${account && accountOk ? `account ${account.bankName} ${account.accountNumberMasked}, ${account.accountName}` : "settlement account set later"}`,
              },
              { label: "First admin", value: `${f.adminName.trim()} · ${f.adminEmail.trim().toLowerCase()} · invitation sent when you create it` },
              { label: "Data", value: "Separate tenant · no data shared with other universities" },
            ]}
          />
          <Banner tone="info" title={`Creating ${f.name.trim()} emails the invitation to ${f.adminName.trim()}`}>
            The university is not open to students until its admin finishes the setup checklist.
          </Banner>
          <Actions>
            <Button type="button" variant="ghost" onClick={() => go(3)}>
              Back
            </Button>
            <Button type="button" leadingIcon="check" loading={busy} onClick={create}>
              Create the university
            </Button>
          </Actions>
        </div>
      ) : null}
    </>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{children}</div>;
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block size-4 rounded-sm border border-line" style={{ background: hex }} />
      {hex}
    </span>
  );
}

function ColourField({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  const hex = normaliseHex(value);
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={error ? undefined : hint}
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={7}
      inputClassName="font-mono uppercase"
      trailing={
        <label className="relative flex size-8 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-line" style={{ background: hex ?? "#fff" }}>
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input type="color" value={(hex ?? "#000000").toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
      }
    />
  );
}

/** SA-03 live preview: the student view in the chosen colours. */
function BrandPreview({ name, primary, accent, logoUrl }: { name: string; primary: string; accent: string; logoUrl: string | null }) {
  const vars = brandVariables(primary, accent) as CSSProperties;
  return (
    <aside aria-label="Preview" className="flex w-full shrink-0 flex-col gap-3 lg:w-[380px]" style={vars}>
      <p className="text-overline text-ink-2">Preview · student view</p>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2.5 rounded-[12px] bg-brand p-3 text-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-full bg-white object-contain" />
          ) : (
            <span aria-hidden="true" className="size-9 rounded-full bg-accent" />
          )}
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-label">{name}</p>
            <p className="text-caption">Open &amp; Distance Learning</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-[12px] bg-brand-subtle p-3.5">
          <p className="text-overline text-ink-2">Continue where you stopped</p>
          <p className="text-label text-ink">GNS 101 · Use of English</p>
        </div>
        <div className="flex h-10 items-center justify-center gap-2 rounded-md bg-brand text-label text-white">
          <Icon name="play_arrow" />
          Open lesson
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent-subtle py-[3px] pr-2.5 pl-2 text-label-sm text-accent-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
          Live class Thu 6:00 pm
        </span>
        <p className="text-caption text-ink-2">Buttons, links and badges all take the university’s colours.</p>
      </div>
    </aside>
  );
}
