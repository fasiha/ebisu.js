const exp = Math.exp;
const log = Math.log;
const sign = Math.sign;
const max = Math.max;

export function logsumexp(a: number[], b: number[]) {
  const a_max = max(...a);
  let s = 0;
  for (let i = a.length - 1; i >= 0; i--) { s += b[i] * exp(a[i] - a_max); }
  const sgn = sign(s);
  s *= sgn;
  const out = log(s) + a_max;
  return [out, sgn];
}
