"use client";

import { hardNavigate } from "@/lib/navigate";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { RoleAssignment, SessionUser } from "@/lib/types";
import { homePath, signInPath, type Surface } from "@/lib/host";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { OfflineBanner } from "@/components/states/offline-banner";
import { IdleTimer } from "./idle-timer";
import { NotificationsBell } from "./notifications-bell";
import type { NavItem } from "./roles";

export interface ShellProps {
  surface: Surface;
  brand: { name: string; logoUrl: string | null; portal: string };
  user: SessionUser;
  roles: RoleAssignment[];
  activeRoleId: string | null;
  nav: NavItem[];
  footer: NavItem[];
  idleTimeoutSeconds: number;
  children: ReactNode;
}

function isActive(pathname: string, item: NavItem, surface: Surface) {
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (item.also?.some(under)) return true;
  if (item.href === homePath(surface)) return pathname === item.href;
  return under(item.href);
}

/** Staff web and provider console frame: side menu + top bar (D1 W-10, D10 SA-01). */
export function AppShell(props: ShellProps) {
  const { surface, brand, user, roles, activeRoleId, nav, footer, idleTimeoutSeconds, children } = props;
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const title = [...nav, ...footer].find((i) => isActive(pathname, i, surface))?.label ?? nav[0]?.label ?? "Home";

  // Close the drawer when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  async function signOut() {
    setSigningOut(true);
    await api("POST", "/auth/sign-out");
    hardNavigate(`${signInPath(surface)}?signedOut=1`);
  }

  const side = (
    <SideNav
      {...{ surface, brand, user, roles, activeRoleId, nav, footer, pathname }}
      onSignOut={() => setConfirmSignOut(true)}
      onClose={drawer ? () => setDrawer(false) : undefined}
    />
  );

  return (
    <div className="flex min-h-dvh flex-1">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">
        Skip to content
      </a>
      <div className="sticky top-0 hidden h-dvh w-[264px] shrink-0 lg:block">{side}</div>
      {drawer ? (
        <Drawer
          onClose={() => {
            setDrawer(false);
            menuButton.current?.focus();
          }}
        >
          {side}
        </Drawer>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface px-2 sm:gap-4 sm:px-6 lg:px-6">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            aria-expanded={drawer}
            className="flex size-12 items-center justify-center rounded-md text-icon hover:bg-subtle lg:hidden"
          >
            <Icon name="menu" size={24} />
          </button>
          <p className="min-w-0 flex-1 truncate text-h4 text-ink">{title}</p>
          <NotificationsBell />
          <span className="hidden sm:inline-flex" title={user.fullName}>
            <Avatar initials={user.initials} />
          </span>
        </header>
        <main id="main" className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-7">
          <OfflineBanner />
          {children}
        </main>
      </div>

      <Dialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        icon="logout"
        title="Sign out?"
        actions={
          <>
            <Button variant="ghost" onClick={signOut} loading={signingOut}>
              Sign out
            </Button>
            <Button onClick={() => setConfirmSignOut(false)} autoFocus>
              Cancel
            </Button>
          </>
        }
      >
        Unsaved changes in open forms will be lost. On a shared computer, also close the browser.
      </Dialog>

      <IdleTimer timeoutSeconds={idleTimeoutSeconds} surface={surface} />
    </div>
  );
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-[min(300px,85vw)] max-w-none bg-transparent p-0 lg:hidden"
    >
      {children}
    </dialog>
  );
}

function SideNav({
  surface,
  brand,
  user,
  roles,
  activeRoleId,
  nav,
  footer,
  pathname,
  onSignOut,
  onClose,
}: Omit<ShellProps, "children" | "idleTimeoutSeconds"> & { pathname: string; onSignOut: () => void; onClose?: () => void }) {
  const active = roles.find((r) => r.id === activeRoleId) ?? roles[0];
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-4 pt-5 pb-4">
      <div className="flex items-start gap-2.5 pb-3">
        {surface === "university" ? <Logo name={brand.name} logoUrl={brand.logoUrl} className="h-[39px] w-[42px]" /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-label-lg text-brand">{brand.name}</p>
          <p className="text-body-sm text-ink-2">{brand.portal}</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close menu" className="-mt-2 -mr-2 flex size-12 items-center justify-center rounded-md text-icon hover:bg-subtle">
            <Icon name="close" size={24} />
          </button>
        ) : null}
      </div>
      <RoleSwitcher user={user} roles={roles} active={active} surface={surface} />
      <div className="h-3" />
      <ul className="flex flex-col gap-1">
        {nav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item, surface)} />
        ))}
      </ul>
      <div className="min-h-6 flex-1" />
      <ul className="flex flex-col gap-1">
        {footer.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item, surface)} />
        ))}
        <li>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-label text-ink-2 hover:bg-subtle lg:h-10"
          >
            <Icon name="logout" className="text-icon-2" />
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-12 items-center gap-3 rounded-md px-3 text-label lg:h-10",
          active ? "bg-brand-subtle text-brand" : "text-ink-2 hover:bg-subtle",
        )}
      >
        <Icon name={item.icon} className={active ? "text-brand" : "text-icon-2"} />
        {item.label}
      </Link>
    </li>
  );
}

/** S-03: the role under the person's name opens a menu of their other roles. */
function RoleSwitcher({ user, roles, active, surface }: { user: SessionUser; roles: RoleAssignment[]; active?: RoleAssignment; surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canSwitch = roles.length > 1;
  const subtitle = active ? `${active.roleLabel} · ${active.scopeLabel}` : "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLButtonElement>("[role=menuitemradio][aria-checked=true]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(id: string) {
    if (id === active?.id) {
      setOpen(false);
      return;
    }
    setBusy(id);
    setError(null);
    const r = await api("POST", "/me/active-role", { roleAssignmentId: id });
    if (r.ok) {
      hardNavigate(homePath(surface));
      return;
    }
    setBusy(null);
    setError(r.error.message ?? "We could not switch role. Try again.");
  }

  const card = (
    <>
      <Avatar initials={user.initials} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-label text-ink">{user.fullName}</span>
        <span className="text-body-sm text-ink-2">{subtitle}</span>
      </span>
      {canSwitch ? <Icon name="swap_horiz" className="text-icon-2" /> : null}
    </>
  );

  if (!canSwitch) return <div className="flex w-full items-center gap-2.5 rounded-lg bg-subtle p-2.5">{card}</div>;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.fullName}, working as ${subtitle}. Switch role`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg bg-subtle p-2.5 hover:bg-muted"
      >
        {card}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Switch role"
          className="absolute top-[calc(100%+8px)] left-0 z-30 flex w-[min(300px,calc(100vw-32px))] flex-col gap-1 rounded-lg border border-line bg-surface p-2 shadow-pop"
          onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"));
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              items[(i + 1) % items.length]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              items[(i - 1 + items.length) % items.length]?.focus();
            }
          }}
        >
          <p className="px-1 text-overline text-ink-3">Switch role</p>
          {roles.map((r) => {
            const on = r.id === active?.id;
            return (
              <button
                key={r.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => choose(r.id)}
                className={cn("flex min-h-12 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left", on ? "bg-brand-subtle" : "hover:bg-subtle")}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-label", on ? "text-brand" : "text-ink")}>{r.roleLabel}</span>
                  <span className="text-body-sm text-ink-2">{r.scopeLabel}</span>
                </span>
                {busy === r.id ? <Icon name="progress_activity" className="spin text-brand" /> : on ? <Icon name="check" className="text-brand" /> : null}
              </button>
            );
          })}
          {error ? (
            <p role="alert" className="px-3 pb-1 text-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
