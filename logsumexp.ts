import {kahanSum} from "./math";

// Only works for positive `b`, i.e., doesn't check the sign
export function logsumexp(a: number[], b?: number[]): number {
  const amax = Math.max(...a)
  const s = kahanSum(a.map((a, i) => Math.exp(a - amax) * (b?.[i] ?? 1)))
  if (s < 0) { throw new Error('s must be positive') };
  return Math.log(s) + amax;
}

export function sumexp(a: number[], b?: number[]): number {
  const amax = Math.max(...a)
  const s = kahanSum(a.map((a, i) => Math.exp(a - amax) * (b?.[i] ?? 1)))
  if (s < 0) { throw new Error('s must be positive') };
  return s * Math.exp(amax);
}