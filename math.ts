import {gammaln} from "./gamma";

export function sum(v: number[]): number { return v.reduce((p, c) => p + c, 0) }

// https://rosettacode.org/wiki/Kahan_summation#C GNU Free Document License 1.3
export function kahanSum(v: number[]|IterableIterator<number>): number {
  let sum = 0, c = 0;
  for (const x of v) {
    const y = x - c;
    const t = sum + y;
    c = (t - sum) - y;
    sum = t;
  }
  return sum;
}

// https://github.com/compute-io/logspace/blob/master/lib/index.js MIT licensed
export function logspace(a: number, b: number, len: number): number[] {
  // Calculate the increment:
  const end = len - 1;
  const d = (b - a) / end;

  // Build the output array...
  const arr = new Array(len);
  let tmp = a;
  arr[0] = 10 ** tmp;
  for (var i = 1; i < end; i++) {
    tmp += d;
    arr[i] = 10 ** tmp;
  }
  arr[end] = 10 ** b;
  return arr;
}

export function logNChooseK(n: number, k: number): number {
  return gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1)
}

export function exceedsThresholdLeft(v: number[], threshold: number): boolean[] {
  const res: boolean[] = [];
  let sum = 0;
  for (let i = v.length - 1; i >= 0; --i) {
    sum += v[i];
    res.push(sum > threshold);
  }
  res.reverse();
  return res;
}