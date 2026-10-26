import type { NextConfig } from "next";

// cacheComponents is off: every page depends on the session or live event state.
// allowedDevOrigins: let phones/laptops on the same Wi-Fi (private IPs) load dev JS.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*"],
};

export default nextConfig;
