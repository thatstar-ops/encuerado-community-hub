import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Event flyer images are pasted by admins as arbitrary external URLs
    // (Encuerado site, Weebly, Vercel Blob, etc.), so we can't pin this down
    // to a specific host allowlist. Optimization still applies; this just
    // lets next/image fetch from any https/http source.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
