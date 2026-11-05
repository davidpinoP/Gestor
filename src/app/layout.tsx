import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Wealth OS", template: "%s · Wealth OS" },
  description: "CFO personal: patrimonio, liquidez, negocios y decisiones.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
