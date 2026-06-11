import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exerciseie",
  description: "Your exercise library, built from social media videos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <Link href="/" className="text-2xl font-bold tracking-tight">
                🏋️ Exerciseie
              </Link>
              <span className="hidden text-sm text-zinc-400 sm:inline">
                your exercise library, built from social videos
              </span>
            </div>
            <nav className="flex gap-2 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Library
              </Link>
              <Link
                href="/import"
                className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500"
              >
                + Import video
              </Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
