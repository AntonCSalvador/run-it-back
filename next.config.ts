import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "run-it-back";
const basePath = isGitHubPages ? `/${repository}` : "";
// This value is substituted at build time. Normal production builds receive "disabled",
// so the Playwright-only query parsing branch is dead-code eliminated from their bundles.
const playwrightTestBuild = process.env.PLAYWRIGHT_TEST_BUILD === "1";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_PLAYWRIGHT_TEST_BUILD: playwrightTestBuild ? "enabled" : "disabled" },
  images: { unoptimized: true },
};

export default nextConfig;
