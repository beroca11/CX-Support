import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "EES — Executive Escalation System",
  description: "Investigate, draft, and resolve executive escalations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <header className="nav">
            <Link href="/" className="nav-brand" aria-label="EES home">
              EES <span>Model</span>
            </Link>
            <nav className="nav-links" aria-label="Primary">
              <Link href="/">Cases</Link>
              <Link href="/cases/new">New case</Link>
              <Link href="/picklists">Picklists</Link>
              <Link href="/settings">Settings</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
