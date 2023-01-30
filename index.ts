import {fmin} from "./fmin";
import {gamma, gammaln} from "./gamma";
import {logsumexp} from "./logsumexp";

import {type Model} from "./interfaces";

const GAMMALN_CACHE = new Map();
function gammalnCached(x: number) {
  let hit = GAMMALN_CACHE.get(x);
  if (hit !== undefined) { return hit; }
  hit = gammaln(x);
  GAMMALN_CACHE.set(x, hit);
  return hit;
}
function betalnRatio(a1: number, a: number, b: number) {
  return (gammaln(a1) - gammaln(a1 + b) + gammalnCached(a + b) - gammalnCached(a));
}
let betaln = (a: number, b: number) => { return gammalnCached(a) + gammalnCached(b) - gammalnCached(a + b); };
let betafn = (a: number, b: number) => { return (gamma(a) * gamma(b)) / gamma(a + b); };
function binomln(n: number, k: number) { return -betaln(1 + n - k, 1 + k) - Math.log(n + 1); }
export function customizeMath(args: Record<string, any>) {
  const orig = {betaln, betafn};
  if (args.betaln) { betaln = args.betaln; }
  if (args.betafn) { betafn = args.betafn; }
  return orig;
}

function _meanVarToBeta(mean: number, v: number) {
  var tmp = (mean * (1 - mean)) / v - 1;
  var alpha = mean * tmp;
  var beta = (1 - mean) * tmp;
  return [alpha, beta];
}

export function predictRecall(prior: Model, tnow: number, exact = false) {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? Math.exp(ret) : ret;
}

export function updateRecall(prior: Model, successes: number, total: number, tnow: number, rebalance = true,
                             tback: number|undefined = undefined, q0: number|undefined = undefined): Model {
  if (0 > successes || successes > total || total < 1) {
    throw new Error("0 <= successes and successes <= total and 1 <= total must be true");
  }

  if (total === 1) { return _updateRecallSingle(prior, successes, tnow, rebalance, tback, q0); }

  let [alpha, beta, t] = prior;
  let dt = tnow / t;
  let failures = total - successes;
  let binomlns: number[] = [];
  for (let i = 0; i <= failures; i++) { binomlns.push(binomln(failures, i)); }

  function unnormalizedLogMoment(m: number, et: number) {
    let logProbs = [];
    for (let i = 0; i <= failures; i++) {
      logProbs.push(binomlns[i] + betaln(alpha + dt * (successes + i) + m * dt * et, beta));
    }
    let signs = [];
    for (let i = 0; i <= failures; i++) { signs.push(Math.pow(-1, i)); }
    return logsumexp(logProbs, signs)[0];
  }

  let logDenominator = unnormalizedLogMoment(0, 0);

  let et: number;
  if (rebalance) {
    let target = Math.log(0.5);
    let rootfn = function(et: number) { return unnormalizedLogMoment(1, et) - logDenominator - target; };
    const status = {};
    let sol = fmin((x) => Math.abs(rootfn(x)), {}, status);
    if (!("converged" in status) || !status.converged) { throw new Error("failed to converge"); }

    et = sol;
    tback = et * tnow;
  }
  if (tback) {
    et = tback / tnow;
  } else {
    tback = t;
    et = tback / tnow;
  }

  let logMean = unnormalizedLogMoment(1, et) - logDenominator;
  let mean = Math.exp(logMean);
  let m2 = Math.exp(unnormalizedLogMoment(2, et) - logDenominator);

  if (mean <= 0) { throw new Error("negative mean encountered"); }
  if (m2 <= 0) { throw new Error("negative 2nd moment encountered"); }

  let meanSq = Math.exp(2 * logMean);
  let variance = m2 - meanSq;
  if (variance <= 0) { throw new Error("negative variance encountered"); }
  let [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  return [newAlpha, newBeta, tback];
}

function _updateRecallSingle(prior: Model, result: number, tnow: number, rebalance = true, tback?: number,
                             q0?: number): Model {
  let [alpha, beta, t] = prior;

  let z = result > 0.5;
  let q1 = z ? result : 1 - result;
  if (q0 === undefined) { q0 = 1 - q1; }

  let dt = tnow / t;

  let [c, d] = z ? [q1 - q0, q0] : [q0 - q1, 1 - q0];
  if (z === false) {
    c = q0 - q1;
    d = 1 - q0;
  } else {
    c = q1 - q0;
    d = q0;
  }

  let den = c * betafn(alpha + dt, beta) + d * (betafn(alpha, beta) || 0);

  function moment(N: number, et: number) {
    let num = c * betafn(alpha + dt + N * dt * et, beta);
    if (d !== 0) { num += d * betafn(alpha + N * dt * et, beta); }
    return num / den;
  }

  let et: number;
  if (rebalance) {
    const status = {};
    let sol = fmin((et) => Math.abs(moment(1, et) - 0.5), {lowerBound: 0}, status);
    if (!("converged" in status) || !status.converged) { throw new Error("failed to converge"); }
    et = sol;
    tback = et * tnow;
  } else if (tback) {
    et = tback / tnow;
  } else {
    tback = t;
    et = tback / tnow;
  }

  let mean = moment(1, et);
  let secondMoment = moment(2, et);

  let variance = secondMoment - mean * mean;
  let [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  if (newAlpha <= 0 || newBeta <= 0) throw new Error("newAlpha and newBeta must be greater than zero");
  return [newAlpha, newBeta, tback];
}
export function defaultModel(t: number, a = 4.0, b = a) { return [a, b, t]; }

export function modelToPercentileDecay(model: Model, percentile = 0.5, tolerance = 1e-4) {
  if (percentile < 0 || percentile > 1) { throw new Error("percentiles must be between (0, 1) exclusive"); }
  const [alpha, beta, t0] = model;
  const logBab = betaln(alpha, beta);
  const logPercentile = Math.log(percentile);
  function f(delta: number) {
    const logMean = betaln(alpha + delta, beta) - logBab;
    return Math.abs(logMean - logPercentile);
  }
  let status = {};
  const sol = fmin(f, {lowerBound: 0, tolerance}, status);
  if (!("converged" in status) || !status.converged) { throw new Error("failed to converge"); }
  return sol * t0;
}

export function rescaleHalflife(prior: Model, scale = 1): Model {
  let [alpha, beta, t] = prior;
  let oldHalflife = modelToPercentileDecay(prior);
  let dt = oldHalflife / t;

  let logDenominator = betaln(alpha, beta);
  let logm2 = betaln(alpha + 2 * dt, beta) - logDenominator;
  let m2 = Math.exp(logm2);
  let newAlphaBeta = 1 / (8 * m2 - 2) - 0.5;
  if (!(newAlphaBeta > 0)) { throw new Error("Assertion error: newAlphaBeta should be greater than 0"); }
  return [newAlphaBeta, newAlphaBeta, oldHalflife * scale];
}
