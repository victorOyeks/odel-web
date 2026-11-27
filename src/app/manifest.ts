import type { MetadataRoute } from "next";
import { getContext } from "@/lib/api/server";
import { PLATFORM_BRAND } from "@/lib/brand";

// Per-host manifest: each university installs as its own app, in its own colours.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await getContext();
  const tenant = ctx.ok ? ctx.data.tenant : null;
  const platform = !ctx.ok || ctx.data.kind === "PLATFORM";
  const name = platform ? "ODeL Platform" : tenant?.shortName ?? tenant?.name ?? "ODeL";
  return {
    name: platform ? "ODeL Provider console" : `${tenant?.name} ODeL portal`,
    short_name: name,
    description: "Open and distance learning portal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6F8",
    theme_color: tenant?.primaryColor ?? PLATFORM_BRAND.primary,
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
