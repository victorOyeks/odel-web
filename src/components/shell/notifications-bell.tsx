"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { Notification, Page } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { SkeletonLine } from "@/components/ui/skeleton";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Notification bell (contract: /notifications). The count loads once per page
 * load, not on a timer, so an idle screen does not keep the session alive.
 */
export function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ count: number }>("GET", "/notifications/unread-count").then((r) => r.ok && setCount(r.data.count));
  }, []);

  useEffect(() => {
    if (!open) return;
    api<Page<Notification>>("GET", "/notifications?page=0&size=20").then((r) => {
      if (r.ok) setItems(r.data.items);
      else setFailed(true);
    });
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function readAll() {
    const r = await api("POST", "/notifications/read-all");
    if (r.ok) {
      setCount(0);
      setItems((xs) => xs?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        onClick={() => {
          setFailed(false);
          setOpen((o) => !o);
        }}
        className="relative flex size-12 items-center justify-center rounded-md text-icon hover:bg-subtle sm:size-10"
      >
        <Icon name="notifications" size={24} />
        {count ? <span aria-hidden="true" className="absolute top-2.5 right-2.5 size-2.5 rounded-full border-2 border-surface bg-danger sm:top-1.5 sm:right-1.5" /> : null}
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+8px)] right-0 z-30 flex w-[min(360px,calc(100vw-16px))] flex-col rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-label text-ink">Notifications</p>
            {count ? (
              <button type="button" onClick={readAll} className="min-h-12 text-label-sm text-brand hover:underline sm:min-h-0">
                Mark all as read
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {failed ? (
              <p className="p-4 text-body text-ink-2">We could not load your notifications. Try again in a moment.</p>
            ) : items === null ? (
              <div className="flex flex-col gap-3 p-4" role="status">
                <span className="sr-only">Loading</span>
                <SkeletonLine className="w-3/4" />
                <SkeletonLine className="w-1/2" />
              </div>
            ) : items.length === 0 ? (
              <p className="p-4 text-body text-ink-2">Nothing new. We will let you know when something needs you.</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const body = (
                    <>
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-label text-ink">{n.title}</span>
                        <span className="text-body-sm text-ink-2">{n.body}</span>
                        <span className="text-caption text-ink-3">{when(n.createdAt)}</span>
                      </span>
                    </>
                  );
                  const onClick = () => {
                    if (!n.readAt) void api("POST", `/notifications/${n.id}/read`);
                    setOpen(false);
                  };
                  return (
                    <li key={n.id} className="border-b border-line last:border-0">
                      {n.link ? (
                        <Link href={n.link} onClick={onClick} className="flex gap-3 px-4 py-3 hover:bg-subtle">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex gap-3 px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
