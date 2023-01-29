import { fmin } from "./fmin";
import { gammaln, gamma } from "./gamma";
import { logsumexp } from "./logsumexp";

import { type Model } from "./interfaces";

const exp = Math.exp;
const log = Math.log;

const GAMMALN_CACHE = new Map();
function gammalnCached(x: number) {
  let hit = GAMMALN_CACHE.get(x);
  if (hit !== undefined) {
    return hit;
  }
  hit = gammaln(x);
  GAMMALN_CACHE.set(x, hit);
  return hit;
}
function betalnRatio(a1: number, a: number, b: number) {
  return (
    gammaln(a1) - gammaln(a1 + b) + gammalnCached(a + b) - gammalnCached(a)
  );
}
function betaln(a: number, b: number) {
  return gammalnCached(a) + gammalnCached(b) - gammalnCached(a + b);
}
function betafn(a: number, b: number) {
  return (gamma(a) * gamma(b)) / gamma(a + b);
}

export function predictRecall(prior: Model, tnow: number, exact = false) {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? exp(ret) : ret;
}

function binomln(n: number, k: number) {
  return -betaln(1 + n - k, 1 + k) - log(n + 1);
}

/**
 * Update a prior on recall probability with a quiz result and time.
 *
 * `prior` is same as in `ebisu.predictRecall`'s arguments: an object
 * representing a prior distribution on recall probability at some specific time
 * after a fact's most recent review.
 *
 * `successes` is the number of times the user *successfully* exercised this
 * memory during this review session, out of `total` attempts. Therefore, `0 <=
 * successes <= total` and `1 <= total`.
 *
 * If the user was shown this flashcard only once during this review session,
 * then `total=1`. If the quiz was a success, then `successes=1`, else
 * `successes=0`.
 *
 * If the user was shown this flashcard *multiple* times during the review
 * session (e.g., Duolingo-style), then `total` can be greater than 1.
 *
 * `tnow` is the time elapsed between this fact's last review and the review
 * being used to update.
 *
 * Returns a new object (like `prior`) describing the posterior distribution of
 * recall probability after update.
 *
 * N.B. This function is tested for numerical stability for small `total < 5`. It
 * may be unstable for much larger `total`.
 *
 * N.B.2. This function may throw an assertion error upon numerical instability.
 * This can happen if the algorithm is *extremely* surprised by a result; for
 * example, if `successes=0` and `total=5` (complete failure) when `tnow` is very
 * small compared to the halflife encoded in `prior`. Calling functions are asked
 * to call this inside a try-except block and to handle any possible
 * `AssertionError`s in a manner consistent with user expectations, for example,
 * by faking a more reasonable `tnow`. Please open an issue if you encounter such
 * exceptions for cases that you think are reasonable.
 * @param prior
 * @param successes
 * @param total
 * @param tnow
 */
export function updateRecall(
  prior: Model,
  successes: number,
  total: number,
  tnow: number,
  rebalance = true,
  tback: number | undefined = undefined,
  q0: number | undefined = undefined
): Model {
  if (0 > successes || successes > total || total < 1) {
    throw new Error(
      "0 <= successes and successes <= total and 1 <= total must be true"
    );
  }

  if (total === 1) {
    return _updateRecallSingle(prior, successes, tnow, rebalance, tback, q0);
  }

  let [alpha, beta, t] = prior;
  let dt = tnow / t;
  let failures = total - successes;
  let binomlns: number[] = [];
  for (let i = 0; i <= failures; i++) {
    binomlns.push(binomln(failures, i));
  }

  function unnormalizedLogMoment(m: number, et: number) {
    let logProbs = [];
    for (let i = 0; i <= failures; i++) {
      logProbs.push(
        binomlns[i] + betaln(alpha + dt * (successes + i) + m * dt * et, beta)
      );
    }
    let signs = [];
    for (let i = 0; i <= failures; i++) {
      signs.push(Math.pow(-1, i));
    }
    return logsumexp(logProbs, signs)[0];
  }

  let logDenominator = unnormalizedLogMoment(0, 0);

  let et: number;
  if (rebalance) {
    let target = Math.log(0.5);
    let rootfn = function (et: number) {
      return unnormalizedLogMoment(1, et) - logDenominator - target;
    };
    const status = {};
    let sol = fmin((x) => Math.abs(rootfn(x)), {}, status);
    if (!("converged" in status) || !status.converged) {
      throw new Error("failed to converge");
    }

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

  if (mean <= 0) {
    throw new Error("negative mean encountered");
  }
  if (m2 <= 0) {
    throw new Error("negative 2nd moment encountered");
  }

  let meanSq = Math.exp(2 * logMean);
  let variance = m2 - meanSq;
  if (variance <= 0) {
    throw new Error("negative variance encountered");
  }
  let [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  return [newAlpha, newBeta, tback];
}

function _meanVarToBeta(mean: number, v: number) {
  var tmp = (mean * (1 - mean)) / v - 1;
  var alpha = mean * tmp;
  var beta = (1 - mean) * tmp;
  return [alpha, beta];
}

function _updateRecallSingle(
  prior: Model,
  result: number,
  tnow: number,
  rebalance = true,
  tback?: number,
  q0?: number
): Model {
  let [alpha, beta, t] = prior;

  let z = result > 0.5;
  let q1 = z ? result : 1 - result;
  if (q0 === undefined) {
    q0 = 1 - q1;
  }

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
    if (d !== 0) {
      num += d * betafn(alpha + N * dt * et, beta);
    }
    return num / den;
  }

  let et: number;
  if (rebalance) {
    let rootfn = (et: number) => moment(1, et) - 0.5;
    const status = {};
    let sol = fmin(
      (x) => Math.abs(rootfn(x)),
      _findBracket(rootfn, 1 / dt),
      status
    );
    if (!("converged" in status) || !status.converged) {
      throw new Error("failed to converge");
    }
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
  if (newAlpha <= 0 || newBeta <= 0)
    throw new Error("newAlpha and newBeta must be greater than zero");
  return [newAlpha, newBeta, tback];
}

/**
 * Convert recall probability prior's raw parameters into a model object.
 *
 * `t` is your guess as to the half-life of any given fact, in units that you
 * must be consistent with throughout your use of Ebisu.
 *
 * `alpha` and `beta` are the parameters of the Beta distribution that describe
 * your beliefs about the recall probability of a fact `t` time units after that
 * fact has been studied/reviewed/quizzed. If they are the same, `t` is a true
 * half-life, and this is a recommended way to create a default model for all
 * newly-learned facts. If `beta` is omitted, it is taken to be the same as
 * `alpha`.
 *
 * @param t
 * @param alpha
 * @param beta
 */
export function defaultModel(t: number, a = 4.0, b = a) {
  return [a, b, t];
}

/**
 * When will memory decay to a given percentile?
 *
 * Given a memory `model` of the kind consumed by `predictRecall`,
 * etc., and optionally a `percentile` (defaults to 0.5, the
 * half-life), find the time it takes for memory to decay to
 * `percentile`. If `coarse`, the returned time (in the same units as
 * `model`) is approximate. Use `tolerance` to tune how fine you want
 * the search to be.
 * @param model
 * @param percentile
 * @param coarse
 * @param tolerance
 */
export function modelToPercentileDecay(
  model: Model,
  percentile = 0.5,
  tolerance = 1e-4
) {
  if (percentile < 0 || percentile > 1) {
    throw new Error("percentiles must be between (0, 1) exclusive");
  }
  const [alpha, beta, t0] = model;
  const logBab = betaln(alpha, beta);
  const logPercentile = log(percentile);
  function f(delta: number) {
    const logMean = betaln(alpha + delta, beta) - logBab;
    return logMean - logPercentile;
  }
  let status = {};
  const sol = fmin((x) => Math.abs(f(x)), { lowerBound: 0, tolerance }, status);
  if (!("converged" in status) || !status.converged) {
    throw new Error("failed to converge");
  }
  return sol * t0;
}

function _findBracket(
  f: (x: number) => number,
  init = 1,
  growfactor = 2
): { lowerBound: number; upperBound: number } {
  let factorhigh = growfactor;
  let factorlow = 1 / factorhigh;
  let blow = factorlow * init;
  let bhigh = factorhigh * init;
  let flow = f(blow);
  let fhigh = f(bhigh);
  while (flow > 0 && fhigh > 0) {
    blow = bhigh;
    flow = fhigh;
    bhigh *= factorhigh;
    fhigh = f(bhigh);
  }
  while (flow < 0 && fhigh < 0) {
    bhigh = blow;
    fhigh = flow;
    blow *= factorlow;
    flow = f(blow);
  }

  if (!(flow > 0 && fhigh < 0))
    throw new Error("assertion failed: flow > 0 and fhigh < 0");
  return { lowerBound: blow, upperBound: bhigh };
}

export function rescaleHalflife(prior: Model, scale = 1): Model {
  let [alpha, beta, t] = prior;
  let oldHalflife = modelToPercentileDecay(prior);
  let dt = oldHalflife / t;

  let logDenominator = betaln(alpha, beta);
  let logm2 = betaln(alpha + 2 * dt, beta) - logDenominator;
  let m2 = Math.exp(logm2);
  let newAlphaBeta = 1 / (8 * m2 - 2) - 0.5;
  if (!(newAlphaBeta > 0)) {
    throw new Error("Assertion error: newAlphaBeta should be greater than 0");
  }
  return [newAlphaBeta, newAlphaBeta, oldHalflife * scale];
}
