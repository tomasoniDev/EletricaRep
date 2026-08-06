import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com",
      "frame-src 'self' blob:",
      "connect-src 'self' https://servicodados.ibge.gov.br https://nominatim.openstreetmap.org",
      "font-src 'self' data:",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" }
        ]
      }
    ];
  }
};

export default nextConfig;
