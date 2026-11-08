import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Client Portal Mini", template: "%s · Client Portal Mini" },
  description:
    "A multi-tenant client portal for agencies: projects, onboarding, secure documents and messaging, with tenant isolation enforced by PostgreSQL row-level security.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={figtree.variable}>
      <body className="min-h-dvh font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
