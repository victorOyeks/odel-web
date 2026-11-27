import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Kumbh_Sans } from "next/font/google";
import localFont from "next/font/local";
import { preload } from "react-dom";
import { getContext } from "@/lib/api/server";
import { brandStyle, PLATFORM_BRAND } from "@/lib/brand";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { ServiceWorker } from "@/components/pwa/service-worker";
import "./globals.css";

const kumbh = Kumbh_Sans({ subsets: ["latin"], variable: "--font-kumbh", display: "swap" });
// Only codes, timers and keys use the mono face; the browser fetches it when that text renders.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });
// Subset of Material Symbols Rounded (see scripts/fetch-icons.ts): ~9 KB instead of ~3 MB.
const icons = localFont({ src: "../fonts/material-symbols-rounded.woff2", variable: "--font-icons", display: "block" });

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getContext();
  const name = ctx.ok ? (ctx.data.kind === "PLATFORM" ? "ODeL Platform" : ctx.data.tenant.shortName ?? ctx.data.tenant.name) : "ODeL";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: ctx.ok ? `${ctx.data.tenant.name} open and distance learning portal` : "Open and distance learning portal",
    applicationName: name,
    icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/192" },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const ctx = await getContext();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: ctx.ok ? ctx.data.tenant.primaryColor : PLATFORM_BRAND.primary,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  // The crest starts downloading with the page (a <link rel="preload"> in the head), on every staff, student and console page.
  if (ctx.ok && ctx.data.tenant.logoUrl) preload(ctx.data.tenant.logoUrl, { as: "image", fetchPriority: "high" });
  const primary = ctx.ok ? ctx.data.tenant.primaryColor : PLATFORM_BRAND.primary;
  const accent = ctx.ok ? ctx.data.tenant.accentColor : PLATFORM_BRAND.accent;
  return (
    <html lang="en-NG" className={`${kumbh.variable} ${mono.variable} ${icons.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <style dangerouslySetInnerHTML={{ __html: brandStyle(primary, accent) }} />
        {ctx.ok ? children : <PortalUnavailable unknownHost={ctx.error.error === "unknown_host"} />}
        <ServiceWorker />
      </body>
    </html>
  );
}
