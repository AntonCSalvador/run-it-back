import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialManualCatalog } from "@/data/champions/manual-data";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, TeamAppearance } from "@/features/game/domain";
import {
  createPlayerDataHandler,
  fileRevision,
  readEditorDocument,
  saveManualCatalog,
} from "./server";

const makeCard = (id: string): PlayerCard => ({
  id,
  playerId: `player-${id}`,
  teamId: "team-2025",
  year: 2025,
  displayHandle: id,
  mapsPlayed: 10,
  eligibleRoles: ["smokes"],
  historicalIgl: false,
  traits: { leadership: 60, firepower: 10, utility: 20, survival: 30, clutch: 40, consistency: 50 },
  sourceIds: ["source"],
});

const temporaryDirectories: string[] = [];

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function makeRepositoryFixture() {
  const directory = await mkdtemp(join(tmpdir(), "run-it-back-player-editor-"));
  temporaryDirectories.push(directory);
  const generatedCards = [makeCard("alpha-team-2025"), makeCard("beta-team-2025")];
  const teams: TeamAppearance[] = [{
    id: "team-2025", name: "Team", shortName: "T", year: 2025, logo: null, sourceIds: ["source"],
  }];
  const evidence: Evidence[] = generatedCards.map(card => ({
    cardId: card.id,
    year: 2025,
    mapsPlayed: 10,
    agentClassMaps: { smokes: 10, duelist: 0, initiator: 0, sentinel: 0 },
    threshold: 2,
    suggestedRoles: ["smokes"],
    finalEligibleRoles: ["smokes"],
    override: null,
    sourceIds: ["source"],
    clutchCoverageMaps: 10,
    clutchWins: 2,
    clutchSourceIds: ["source"],
    performanceAvailableMaps: 10,
  }));
  const manualPath = join(directory, "manual-player-data.json");
  await writeFile(manualPath, `${JSON.stringify(createInitialManualCatalog(generatedCards), null, 2)}\n`, "utf8");
  return { manualPath, generatedCards, teams, evidence };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("player editor repository", () => {
  it("reads manual, generated, evidence, team, weight, and revision data", async () => {
    const fixture = await makeRepositoryFixture();

    const document = await readEditorDocument(fixture);

    expect(document.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(document.cards).toHaveLength(2);
    expect(document.cards[0]).toMatchObject({
      generated: fixture.generatedCards[0],
      manual: { cardId: fixture.generatedCards[0].id },
      evidence: { cardId: fixture.generatedCards[0].id },
      team: fixture.teams[0],
    });
    expect(document.traitWeights.firepower).toBe(0.35);
  });

  it("saves formatted valid data only when the revision matches", async () => {
    const fixture = await makeRepositoryFixture();
    const before = await readFile(fixture.manualPath, "utf8");
    const catalog = createInitialManualCatalog(fixture.generatedCards);
    catalog.cards[0].traits.leadership = 99;

    const result = await saveManualCatalog(fixture, fileRevision(before), catalog);
    const saved = await readFile(fixture.manualPath, "utf8");

    expect(saved).toBe(`${JSON.stringify(catalog, null, 2)}\n`);
    expect(result.revision).toBe(fileRevision(saved));
  });

  it("rejects stale and invalid saves without changing the target", async () => {
    const fixture = await makeRepositoryFixture();
    const before = await readFile(fixture.manualPath, "utf8");
    const invalid = createInitialManualCatalog(fixture.generatedCards);
    invalid.cards[0].traits.firepower = 101;

    await expect(saveManualCatalog(fixture, "0".repeat(64), invalid))
      .rejects.toMatchObject({ status: 409, message: "Player data changed on disk; reload before saving" });
    await expect(saveManualCatalog(fixture, fileRevision(before), invalid)).rejects.toMatchObject({ status: 400 });
    expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
  });

  it("preserves the target when replacement fails", async () => {
    const fixture = await makeRepositoryFixture();
    const before = await readFile(fixture.manualPath, "utf8");

    await expect(saveManualCatalog(fixture, fileRevision(before), createInitialManualCatalog(fixture.generatedCards), {
      replace: async () => { throw new Error("replacement failed"); },
    })).rejects.toThrow("replacement failed");

    expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
    await expect(saveManualCatalog(fixture, fileRevision(before), createInitialManualCatalog(fixture.generatedCards)))
      .resolves.toMatchObject({ revision: fileRevision(before) });
  });

  it("allows only one concurrent same-revision save to replace the catalog", async () => {
    const fixture = await makeRepositoryFixture();
    const before = await readFile(fixture.manualPath, "utf8");
    const firstCatalog = createInitialManualCatalog(fixture.generatedCards);
    firstCatalog.cards[0].traits.leadership = 91;
    const secondCatalog = createInitialManualCatalog(fixture.generatedCards);
    secondCatalog.cards[0].traits.leadership = 92;
    const firstAtReplace = deferred();
    const releaseFirstReplace = deferred();
    let replacements = 0;
    const replace = async (temporaryPath: string, targetPath: string) => {
      replacements += 1;
      if (replacements === 1) {
        firstAtReplace.resolve();
        await releaseFirstReplace.promise;
      }
      await rename(temporaryPath, targetPath);
    };

    const first = saveManualCatalog(fixture, fileRevision(before), firstCatalog, { replace });
    await firstAtReplace.promise;
    const second = saveManualCatalog(fixture, fileRevision(before), secondCatalog, { replace });
    await new Promise<void>(resolve => setImmediate(resolve));
    releaseFirstReplace.resolve();
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect([firstResult, secondResult].filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect([firstResult, secondResult].find(result => result.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const winningCatalog = firstResult.status === "fulfilled" ? firstCatalog : secondCatalog;
    expect(await readFile(fixture.manualPath, "utf8")).toBe(`${JSON.stringify(winningCatalog, null, 2)}\n`);
  });

  it("exposes only GET and PUT on the fixed player-data endpoint", async () => {
    const fixture = await makeRepositoryFixture();
    const handler = createPlayerDataHandler(fixture);

    expect((await handler(new Request("http://localhost/api/player-data"))).status).toBe(200);
    const method = await handler(new Request("http://localhost/api/player-data", { method: "DELETE" }));
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET, PUT");
    expect((await handler(new Request("http://localhost/api/anything-else"))).status).toBe(404);
  });

  it("rejects malformed, oversized, and extra PUT properties without writing", async () => {
    const fixture = await makeRepositoryFixture();
    const handler = createPlayerDataHandler(fixture);
    const before = await readFile(fixture.manualPath, "utf8");
    const cases = [
      "{",
      JSON.stringify({ revision: fileRevision(before), catalog: createInitialManualCatalog(fixture.generatedCards), extra: true }),
      "x".repeat(2 * 1024 * 1024 + 1),
    ];

    for (const body of cases) {
      const response = await handler(new Request("http://localhost/api/player-data", { method: "PUT", body }));
      expect([400, 413]).toContain(response.status);
      expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
    }
  });

  it.each([
    ["revision", { catalog: createInitialManualCatalog([makeCard("alpha-team-2025"), makeCard("beta-team-2025")]) }],
    ["catalog", { revision: "0".repeat(64) }],
  ])("rejects a PUT payload missing %s without writing", async (_, body) => {
    const fixture = await makeRepositoryFixture();
    const handler = createPlayerDataHandler(fixture);
    const before = await readFile(fixture.manualPath, "utf8");

    const response = await handler(new Request("http://localhost/api/player-data", {
      method: "PUT",
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(400);
    expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
  });
});
