/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ws'], // socket.send butuh optional deps (bufferutil) — ws tak boleh dibundel Next.
  async redirects() {
    return [
      { source: '/control', destination: '/missions/create', permanent: false },
      { source: '/monitoring', destination: '/tracking', permanent: false },
      { source: '/mapping', destination: '/maps', permanent: false },
    ];
  },
};

export default nextConfig;
