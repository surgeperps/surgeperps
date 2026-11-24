// Why: Next.js build settings for the Surge app.
// How: keeps defaults; only pins the workspace root so Next doesn't pick up
//      lockfiles from the parent folders.
import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  turbopack: { root: path.join(__dirname) },
};
export default config;
