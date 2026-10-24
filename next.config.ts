import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },    // menu photos for items without a local /public/menu copy
      { protocol: "https", hostname: "*.supabase.co" },         // our Supabase storage
    ],
  },
};

export default nextConfig;
