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
const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

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
    if (!f.shortName.trim()) e.shortName = "Enter a short name, for example Wesley ODeL";
    if (!f.webAddress.trim()) e.webAddress = "Enter the web address, for example odl.crestfield.edu.ng";
    else if (!HOST_RE.test(f.webAddress.trim())) e.webAddress = "Enter an address like odl.crestfield.edu.ng, without https://";
    if (!SLUG_RE.test(f.slug)) e.slug = "Use 2–31 lowercase letters, numbers or dashes, starting with a letter";
    if (!f.googleDomain.trim() || !HOST_RE.test(f.googleDomain.trim())) e.googleDomain = "Enter the domain staff emails end with, for example crestfield.edu.ng";
    if (!f.adminName.trim()) e.adminName = "Enter the first admin’s name";
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
    const q = new URLSearchParams({ webAddress: f.webAddress.trim().toLowerCase(), slug: f.slug });
    const r = await api<AddressAvailability>("GET", `/platform/tenants/address-available?${q}`);
    setBusy(false);
    if (!r.ok) {
      setFailure(r.error.message ?? "We could not check the web address. Try again.");
      return;
    }
    const e2: Errors = {};
    if (!r.data.webAddress.available) e2.webAddress = r.data.webAddress.message ?? "Already used by another university";
    if (!r.data.slug.available) e2.slug = r.data.slug.message ?? "Already used by another university";
    if (Object.keys(e2).length) {
      setErrors(e2);
      setTaken(e2.webAddress ? "web" : "slug");
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
      webAddress: f.webAddress.trim().toLowerCase(),
      googleDomain: f.googleDomain.trim().toLowerCase(),
      branding: { primaryColor: primaryHex!, accentColor: accentHex!, logoKey: logo?.key ?? null },
      firstAdmin: { fullName: f.adminName.trim(), email: f.adminEmail.trim().toLowerCase() },
    };
    const r = await api<TenantDetail>("POST", "/platform/tenants", body);
    if (r.ok) {
      router.push(`/universities/${r.data.id}?created=1`);
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
    3: "Step 3 of 4 · the university starts with the default rules.",
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
              <TextField id="f-webAddress" label="Web address" placeholder="For example: odl.crestfield.edu.ng" value={f.webAddress} onChange={(e) => set("webAddress", e.target.value)} error={errors.webAddress} hint={errors.webAddress ? undefined : "We give you the DNS record to add"} inputMode="url" autoCapitalize="none" spellCheck={false} />
              <TextField id="f-slug" label="Short address" placeholder="For example: crestfield" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} error={errors.slug} hint={errors.slug ? undefined : "Used for the test address before the DNS record is ready"} autoCapitalize="none" spellCheck={false} />
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
        <div className="flex flex-col gap-6">
          <Banner tone="info" title="Defaults for now; the university’s admin sets these">
            The university starts on the default 5-point grading scale (30% coursework, 70% exam) and pays through the
            platform. Its ODeL admin reviews rules and payments from the setup checklist.
          </Banner>
          <Actions>
            <Button type="button" variant="ghost" onClick={() => go(2)}>
              Back
            </Button>
            <Button type="button" leadingIcon="arrow_forward" onClick={() => go(4)}>
              Next: review
            </Button>
          </Actions>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-6">
          <KeyValues
            rows={[
              { label: "University", value: `${f.name.trim()} · ${f.shortName.trim()}` },
              { label: "Web address", value: `${f.webAddress.trim().toLowerCase()} · DNS record sent after you create it` },
              { label: "Staff sign-in", value: `Google accounts ending @${f.googleDomain.trim().toLowerCase()}` },
              {
                label: "Branding",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Swatch hex={primaryHex!} /> <Swatch hex={accentHex!} /> <span>· readability passed{logo ? ` · logo ${logo.name}` : " · no logo yet"}</span>
                  </span>
                ),
              },
              { label: "Rules and payments", value: "Defaults · the university’s admin sets these" },
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
