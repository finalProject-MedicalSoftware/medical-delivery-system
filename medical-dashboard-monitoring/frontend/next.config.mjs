/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/control', destination: '/missions/create', permanent: false },
      { source: '/monitoring', destination: '/tracking', permanent: false },
      { source: '/mapping', destination: '/maps', permanent: false },
    ];
  },
};

export default nextConfig;
