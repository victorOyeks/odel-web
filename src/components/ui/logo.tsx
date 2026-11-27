import { cn } from "@/lib/cn";

/**
 * The university crest from the API (logoUrl), or a lettered mark in the
 * brand colour when there is no logo yet (e.g. the platform itself).
 */
export function Logo({
  name,
  logoUrl,
  className,
  inverse = false,
}: {
  name: string;
  logoUrl: string | null | undefined;
  className?: string;
  inverse?: boolean;
}) {
  if (logoUrl) {
    // A stable, versioned address the browser caches for a year; it is in the server-rendered HTML (and preloaded by the
    // root layout), with its size set, so the crest shows with the page instead of popping in after it.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" width={44} height={40} fetchPriority="high" decoding="sync" className={cn("h-10 w-11 shrink-0 object-contain", className)} />;
  }
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-label",
        inverse ? "bg-white/15 text-white" : "bg-brand text-white",
        className,
      )}
    >
      {letters || "O"}
    </span>
  );
}
