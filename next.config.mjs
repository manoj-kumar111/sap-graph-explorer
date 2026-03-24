/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensures the native SQLite binary is packaged correctly for Serverless
    serverComponentsExternalPackages: ['better-sqlite3'],
    // Ensures your generated database file is copied to the serverless function
    outputFileTracingIncludes: {
      '/api/**/*': ['./sap_graph.db'],
    },
  },
};

export default nextConfig;
