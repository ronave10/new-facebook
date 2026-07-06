/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@campaignos/shared"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
