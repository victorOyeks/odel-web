// Colour maths for per-university branding. Pure functions: used on the server
// (to write CSS variables) and in the browser (live contrast check on SA-03).

export const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export const PLATFORM_BRAND = { primary: "#1A2368", accent: "#C27808" };

export function normaliseHex(input: string): string | null {
  const m = input.trim().match(HEX_RE);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

function rgb(hex: string): [number, number, number] {
  const h = (normaliseHex(hex) ?? "#000000").slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b]
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** WCAG 2 relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** "6.2 : 1" — one decimal, as the designs write it. */
export function formatRatio(r: number): string {
  return `${(Math.floor(r * 10) / 10).toFixed(1)} : 1`;
}

/** White text on the main colour must reach 4.5 : 1 (contract, SA-03b). */
export function whiteTextPasses(hex: string): boolean {
  return contrast("#FFFFFF", hex) >= 4.5;
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function fromHsl(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** The lightest shade of the same hue that white text reads well on. */
export function suggestReadable(hex: string): string {
  const [h, s, l] = toHsl(hex);
  for (let light = Math.min(l, 60); light >= 5; light -= 1) {
    const candidate = fromHsl(h, s, light);
    if (whiteTextPasses(candidate)) return candidate;
  }
  return "#000000";
}

/**
 * CSS variables for a university's colours. Tints are derived from the hue so
 * every tenant gets the same visual weights as the Wesley navy in the designs.
 */
export function brandVariables(primary: string, accent: string): Record<string, string> {
  const p = normaliseHex(primary) ?? PLATFORM_BRAND.primary;
  const a = normaliseHex(accent) ?? PLATFORM_BRAND.accent;
  const [ph, ps] = toHsl(p);
  const [ah, as] = toHsl(a);
  return {
    "--brand": p,
    "--brand-subtle": fromHsl(ph, Math.min(ps, 57), 95),
    "--brand-muted": fromHsl(ph, Math.min(ps, 52), 90),
    "--brand-focus": fromHsl(ph, Math.min(ps, 40), 48),
    "--accent": a,
    "--accent-subtle": fromHsl(ah, Math.min(as, 90), 96),
    "--accent-ink": fromHsl(ah, Math.min(as, 90), 26),
  };
}

export function brandStyle(primary: string, accent: string): string {
  const vars = brandVariables(primary, accent);
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}
