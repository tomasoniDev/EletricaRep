import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Assistência Tomasoni",
  title: "Assistência Tomasoni",
  description: "Aplicação corporativa para registros de atendimento técnico.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": -1,
      "max-image-preview": "none",
      "max-video-preview": -1
    }
  },
  other: {
    robots: "noindex, nofollow, noarchive, nosnippet, noimageindex"
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon-192-v2.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}


