/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pdf-parse', 'jspdf'],
  transpilePackages: ['@splinetool/react-spline', '@splinetool/runtime'],
}

export default nextConfig
