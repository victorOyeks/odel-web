"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { CustomDomain } from "@/lib/types";

const STATUS: Record<CustomDomain["status"], { label: string; tone: string }> = {
  NONE: { label: "No own domain", tone: "bg-subtle text-ink-2" },
  WAITING_DNS: { label: "Waiting for DNS record", tone: "bg-accent-subtle text-accent-ink" },
  DNS_FOUND: { label: "DNS found · issuing certificate", tone: "bg-brand-subtle text-brand" },
  LIVE: { label: "Live", tone: "bg-success-subtle text-success-ink" },
};

/**
 * SA-01b web addresses: the platform address (always live) and the university's own domain, with the record its IT team
 * must add, "Check now", and set, change or remove the domain. The certificate is issued on the server within minutes.
 */
export function CustomDomainCard({ tenantId, platformUrl, domain }: { tenantId: string; platformUrl: string; domain: CustomDomain | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "check" | "save" | "remove">("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState(!domain);
  const [value, setValue] = useState(domain?.address ?? "");
  const platformHost = platformUrl.replace(/^https?:\/\//, "");

  async function check() {
    setBusy("check");
    setMessage(null);
    const r = await api("POST", `/platform/tenants/${tenantId}/custom-domain/check`);
    setBusy("");
    if (r.ok) router.refresh();
    else setMessage({ tone: "bad", text: r.error.message ?? "We could not check the domain. Try again." });
  }

  async function save(remove: boolean) {
    if (!remove && /(\.(test|example|invalid|localhost|local)|(^|\.)example\.(com|org|net))$/i.test(value.trim())) {
      setMessage({ tone: "bad", text: "Use a real domain the university controls; test domains like .test or example.com can never be reached." });
      return;
    }
    setBusy(remove ? "remove" : "save");
    setMessage(null);
    const r = await api("PATCH", `/platform/tenants/${tenantId}`, { webAddress: remove ? "" : value.trim().toLowerCase() });
    setBusy("");
    if (r.ok) {
      setEditing(false);
      setMessage({ tone: "ok", text: remove ? "Own domain removed. The platform address keeps working." : "Saved. Send the record below to the university's IT team." });
      router.refresh();
    } else {
      setMessage({ tone: "bad", text: r.error.fields?.webAddress ?? r.error.message ?? "We could not save the domain." });
    }
  }

  const st = domain ? STATUS[domain.status] : STATUS.NONE;

  return (
    <section aria-labelledby="web-addresses" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 id="web-addresses" className="text-label-lg text-ink">Web addresses</h2>

      <div className="flex flex-col gap-1">
        <p className="text-label-sm uppercase tracking-[0.06em] text-ink-3">Platform address · always on</p>
        <a href={platformUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start text-label text-brand hover:underline">
          {platformHost} <Icon name="open_in_new" size={16} />
        </a>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label-sm uppercase tracking-[0.06em] text-ink-3">University&apos;s own domain · optional</p>
          <span className={`rounded-full px-2.5 py-1 text-label-sm ${st.tone}`}>{st.label}</span>
        </div>

        {domain && !editing ? (
          <>
            <p className="text-label text-ink">
              {domain.status === "LIVE" ? (
                <a href={`https://${domain.address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand hover:underline">
                  {domain.address} <Icon name="open_in_new" size={16} />
                </a>
              ) : (
                domain.address
              )}
            </p>
            {domain.status !== "LIVE" ? (
              <div className="flex flex-col gap-2 rounded-md bg-canvas p-4">
                <p className="text-body-sm text-ink-2">Ask the university&apos;s IT team to add this DNS record (set it to &ldquo;DNS only&rdquo; if they use Cloudflare):</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
                  <dt className="text-ink-3">Type</dt>
                  <dd className="font-mono text-ink">{domain.recordType}</dd>
                  <dt className="text-ink-3">Name</dt>
                  <dd className="font-mono break-all text-ink">{domain.address}</dd>
                  <dt className="text-ink-3">Points to</dt>
                  <dd className="font-mono break-all text-ink">{domain.pointTo}</dd>
                </dl>
              </div>
            ) : null}
            {domain.problem ? (
              <p className="flex items-start gap-2 text-body-sm text-ink-2">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-warning" />
                {domain.problem}
              </p>
            ) : null}
            <p className="text-body-sm text-ink-3">
              {domain.status === "LIVE"
                ? "Links and emails now use this domain."
                : "We check every 5 minutes; the certificate follows within minutes of the record being found. Links and emails use the platform address until then."}
              {domain.checkedAt ? ` Last checked ${new Date(domain.checkedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {domain.status === "WAITING_DNS" ? (
                <Button onClick={check} loading={busy === "check"} leadingIcon="refresh">
                  Check now
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Change domain
              </Button>
              <Button variant="ghost" onClick={() => save(true)} loading={busy === "remove"}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              save(false);
            }}
          >
            <label className="sr-only" htmlFor="own-domain">
              Own domain
            </label>
            <input
              id="own-domain"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="odl.university.edu.ng"
              className="h-12 flex-1 rounded-md border-[1.5px] border-line bg-surface px-3.5 text-body text-ink focus:border-brand focus:outline-none"
              required
            />
            <Button type="submit" loading={busy === "save"}>
              Save domain
            </Button>
            {domain ? (
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </form>
        )}
        {message ? (
          <p role="status" className={message.tone === "ok" ? "text-body-sm text-success-ink" : "text-body-sm text-danger"}>
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
