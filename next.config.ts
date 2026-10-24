import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "panzutti.com" },          // current site's photos (temporary)
      { protocol: "https", hostname: "res.cloudinary.com" },    // current menu photos
      { protocol: "https", hostname: "*.supabase.co" },         // our Supabase storage
    ],
  },
};

export default nextConfig;
