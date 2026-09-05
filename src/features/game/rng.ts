const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const hasOwn = Object.prototype.hasOwnProperty;

function assertDense<T>(items: readonly T[]): void {
  for (let index = 0; index < items.length; index += 1) {
    if (!hasOwn.call(items, index)) {
      throw new TypeError("cannot use sparse list");
    }
  }
}

function hashSeed(seed: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), FNV_PRIME);
  }
  return hash >>> 0;
}

export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be positive");
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("cannot pick from empty list");
    }
    assertDense(items);
    return items[this.int(items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    assertDense(items);
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}

export function scopedRng(seed: string, scope: string): SeededRng {
  return new SeededRng(`${seed}:${scope}`);
}

export function dailySeed(date: Date): string {
  return `run-it-back:daily:${date.toISOString().slice(0, 10)}:v1`;
}
