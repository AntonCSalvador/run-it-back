const STRICT_DIFF_RATIO = 0.01;
const LINUX_DIFF_RATIO = 0.025;

/** Ubuntu substitutes Arial with different metrics, unlike local Windows baselines. */
export function screenshotDiffRatio(platform: NodeJS.Platform = process.platform): number {
  return platform === "linux" ? LINUX_DIFF_RATIO : STRICT_DIFF_RATIO;
}
