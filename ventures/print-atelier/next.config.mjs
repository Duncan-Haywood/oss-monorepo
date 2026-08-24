/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud-agent and curl checks hit 127.0.0.1; without this, Next 16 blocks
  // dev JS chunks as cross-origin and the checkout cart never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
