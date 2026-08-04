/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` emits .next/standalone with its own pruned node_modules and a
  // server.js entrypoint. Dockerfile copies that rather than the installed tree,
  // and `CMD ["node", "server.js"]` depends on it existing — without this key the
  // image builds and then fails to start.
  output: "standalone",
};

export default nextConfig;
