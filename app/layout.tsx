import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Ripple", template: "%s · Ripple" },
  description:
    "Ripple links separate reports of harassment on campus into one fast, joined-up response. A HudHackHer 2026 demo using fictional data.",
  appleWebApp: { capable: true, title: "Ripple", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#6B3F94",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
