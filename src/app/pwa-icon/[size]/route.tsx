import { ImageResponse } from "next/og";
import { getContext } from "@/lib/api/server";
import { PLATFORM_BRAND } from "@/lib/brand";

// App icon in the university's main colour with its initials. A tenant logo
// would need rasterising server-side; that can replace this later.
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  const c = await getContext();
  const name = c.ok ? c.data.tenant.name : "ODeL";
  const bg = c.ok ? c.data.tenant.primaryColor : PLATFORM_BRAND.primary;
  const letters =
    name
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "O";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: "white",
          fontSize: size * 0.36,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        {letters}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
