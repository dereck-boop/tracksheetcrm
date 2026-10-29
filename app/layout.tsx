import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
// Typefaces are served from our own build (no font CDN).
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/500.css";
import "@fontsource/arimo/400.css";
import "@fontsource/arimo/500.css";
import "@fontsource/arimo/600.css";
import "@fontsource/arimo/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { ErrorFlash } from "@/components/ErrorFlash";

import { db } from "@/lib/db";

/** Tab titles and link previews read "Invoice INV-1002 · Your Studio", using the studio's name from Settings. */
export async function generateMetadata(): Promise<Metadata> {
  const name = await db.studio.findFirst({ select: { name: true }, orderBy: { createdAt: "asc" } }).then((s) => s?.name).catch(() => null);
  const site = name || "TrackSheet CRM";
  return { title: { default: site, template: `%s · ${site}` }, openGraph: { siteName: site } };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}><ErrorFlash /></Suspense>
        {children}
      </body>
    </html>
  );
}
