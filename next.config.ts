import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vercel's image optimizer quota ran out (402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED, 2026-11-19),
    // so serve the files as they are. Local photos are already .webp; remote ones come from Cloudinary/Supabase.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },    // menu photos for items without a local /public/menu copy
      { protocol: "https", hostname: "*.supabase.co" },         // our Supabase storage
    ],
  },
};

export default nextConfig;
