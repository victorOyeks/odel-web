const TZ = "Africa/Lagos";

/** "Mon 5 Jul, 3:02 pm" — the designs' date style, in the university's time zone. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d).replace(",", "");
}

export const count = (n: number | null | undefined) => (n ? n.toLocaleString("en-NG") : "—");

/** "₦15,000" */
export const naira = (n: number | null | undefined) => `₦${(n ?? 0).toLocaleString("en-NG")}`;

/** A calendar date (YYYY-MM-DD) as "Tue 16 Feb 2027"; with year=false "Tue 16 Feb". */
export function formatDate(d: string | null | undefined, year = true): string {
  if (!d) return "—";
  const x = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(x.getTime())) return d;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }).format(x).replace(",", "");
}

/** "4 Dec, 14:28" — tables. */
export function formatShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${day}, ${time}`;
}
