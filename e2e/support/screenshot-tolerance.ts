const STRICT_DIFF_RATIO = 0.01;
const LINUX_DIFF_RATIO = 0.025;
const THREE_TEAM_OFFER_MIN_HEIGHT = 580;

/** Ubuntu substitutes Arial with different metrics, unlike local Windows baselines. */
export function screenshotDiffRatio(platform: NodeJS.Platform = process.platform): number {
  return platform === "linux" ? LINUX_DIFF_RATIO : STRICT_DIFF_RATIO;
}

/** Keep this complete mobile shot dimensionally stable across Arial substitutes. */
export function normalizedMobileClipHeight(snapshotName: string, contentHeight: number): number {
  return snapshotName === "three-team-offer" ? Math.max(contentHeight, THREE_TEAM_OFFER_MIN_HEIGHT) : contentHeight;
}
