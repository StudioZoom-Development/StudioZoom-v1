import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  allowedDevOrigins: [
    'localhost:3000',
    '192.168.0.10:3000',
    '192.168.0.10',
    '192.168.0.224:3000',
    '192.168.0.224',
    '192.168.0.105:3000',
    '192.168.0.105',
    '192.168.0.*',
    '192.168.*',
    '192.0.0.2:3000',
    '192.0.0.2',
    '192.0.0.*',
    '192.0.*',
    '192.*',
  ],
};

export default nextConfig;

