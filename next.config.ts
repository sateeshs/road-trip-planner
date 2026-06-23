import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // ESM packages must be transpiled so Next.js can bundle them properly
  transpilePackages: ['react-leaflet', '@react-leaflet/core', 'react-leaflet-cluster'],
}

export default nextConfig
