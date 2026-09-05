import { describe, expect, it } from "vitest";
import { dailySeed, scopedRng, SeededRng } from "./rng";

describe("seeded randomness", () => {
  it("produces equal sequences for equal seed and scope", () => {
    const first = scopedRng("seed", "scope");
    const second = scopedRng("seed", "scope");
    expect(Array.from({ length: 10 }, () => first.next())).toEqual(
      Array.from({ length: 10 }, () => second.next()),
    );
  });

  it("produces different sequences for different scopes", () => {
    const first = scopedRng("seed", "one");
    const second = scopedRng("seed", "two");
    expect(Array.from({ length: 10 }, () => first.next())).not.toEqual(
      Array.from({ length: 10 }, () => second.next()),
    );
  });

  it("pins the release algorithm for an ASCII seed and scope", () => {
    const rng = scopedRng("alpha", "arena");
    const values = Array.from({ length: 5 }, () => Math.floor(rng.next() * 4294967296));
    expect(values).toEqual([3012113987, 732834591, 3753724533, 2940309389, 4253879317]);
  });

  it("pins UTF-16 hashing and the release algorithm for an astral seed", () => {
    const rng = new SeededRng("😀");
    const values = Array.from({ length: 5 }, () => Math.floor(rng.next() * 4294967296));
    expect(values).toEqual([3949134190, 2278450477, 1786177236, 281350428, 4170881302]);
  });

  it("returns integers in the requested range", () => {
    const rng = new SeededRng("range");
    const values = Array.from({ length: 1_000 }, () => rng.int(3));
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < 3)).toBe(true);
  });

  it("picks a member from a list", () => {
    const values = ["a", "b", "c"] as const;
    expect(values).toContain(new SeededRng("pick").pick(values));
  });

  it("rejects sparse arrays for pick", () => {
    expect(() => new SeededRng("sparse").pick(Array<number>(1))).toThrow(
      new TypeError("cannot use sparse list"),
    );
  });

  it("rejects sparse arrays for shuffle", () => {
    const sparse = [1, , 3] as number[];
    expect(() => new SeededRng("sparse").shuffle(sparse)).toThrow(
      new TypeError("cannot use sparse list"),
    );
  });

  it("accepts dense arrays containing explicit undefined", () => {
    const values: Array<number | undefined> = [undefined, 1];
    const rng = new SeededRng("undefined");
    expect(values).toContain(rng.pick(values));
    expect(rng.shuffle(values)).toHaveLength(values.length);
  });

  it("shuffles without mutating input and returns a permutation", () => {
    const input = [1, 2, 3, 4, 5];
    const original = [...input];
    const shuffled = new SeededRng("shuffle").shuffle(input);
    expect(input).toEqual(original);
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort()).toEqual(original);
  });

  it("formats a daily seed in UTC", () => {
    expect(dailySeed(new Date("2026-09-04T23:59:00Z"))).toBe("run-it-back:daily:2026-09-04:v1");
  });

  it("rejects invalid integer limits", () => {
    const rng = new SeededRng("invalid");
    expect(() => rng.int(0)).toThrow(new RangeError("maxExclusive must be positive"));
    expect(() => rng.int(-1)).toThrow(new RangeError("maxExclusive must be positive"));
    expect(() => rng.int(1.5)).toThrow(new RangeError("maxExclusive must be positive"));
  });

  it("rejects empty pick lists", () => {
    expect(() => new SeededRng("empty").pick([])).toThrow(new RangeError("cannot pick from empty list"));
  });
});
