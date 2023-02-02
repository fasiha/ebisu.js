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

/**
  Expected recall log-probability now, given a prior distribution on it.

  `prior` is a tuple representing the prior distribution on recall probability
  after a specific unit of time has elapsed since this fact's last review.
  Specifically,  it's a 3-tuple, `(alpha, beta, t)` where `alpha` and `beta`
  parameterize a Beta distribution that is the prior on recall probability at
  time `t`.

  `tnow` is the *actual* time elapsed since this fact's most recent review. It
  is in units consistent with `t` in your prior model.

  Optional parameter `exact` makes the return value a probability, specifically,
  the expected recall probability `tnow` after the last review: a number between
  0 and 1. If `exact` is falsey, we return the log-probability; pass truthy for
  true linear probability (between 0 and 1).
 */
export function predictRecall(prior: Model, tnow: number, exact = false): number {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? Math.exp(ret) : ret;
}

/**
  Update a prior on recall probability with a quiz result and time.

  `prior` is same as in `ebisu.predictRecall`'s arguments: an array
  representing a prior distribution on recall probability at some specific time
  after a fact's most recent review.

  `successes` is the number of times the user *successfully* exercised this
  memory during this review session, out of `n` attempts. Therefore, `0 <=
  successes <= total` and `1 <= total`.

  If the user was shown this flashcard only once during this review session,
  then `total=1`. If the quiz was a success, then `successes=1`, else
  `successes=0`. (See below for fuzzy quizzes.)

  If the user was shown this flashcard *multiple* times during the review
  session (e.g., Duolingo-style), then `total` can be greater than 1.

  If `total` is 1, `successes` can be a float between 0 and 1 inclusive. This
  implies that while there was some "real" quiz result, we only observed a
  scrambled version of it, which is `successes > 0.5`. A "real" successful quiz
  has a `max(successes, 1 - successes)` chance of being scrambled such that we
  observe a failed quiz `successes > 0.5`. E.g., `successes` of 0.9 *and* 0.1
  imply there was a 10% chance a "real" successful quiz could result in a failed
  quiz.

  This noisy quiz model also allows you to specify the related probability that
  a "real" quiz failure could be scrambled into the successful quiz you observed.
  Consider "Oh no, if you'd asked me that yesterday, I would have forgotten it."
  By default, this probability is `1 - max(successes, 1 - successes)` but doesn't
  need to be that value. Provide `q0` to set this explicitly. See the full Ebisu
  mathematical analysis for details on this model and why this is called "q0".

  `tnow` is the time elapsed between this fact's last review in units consistent
  with `prior`.

  Returns a new array (like `prior`) describing the posterior distribution of
  recall probability at `tback` time after review.

  If `rebalance` is True, the new array represents the updated recall
  probability at *the halflife*, i,e., `tback` such that the expected
  recall probability is is 0.5. This is the default behavior.

  Performance-sensitive users might consider disabling rebalancing. In that
  case, they may pass in the `tback` that the returned model should correspond
  to. If none is provided, the returned model represets recall at the same time
  as the input model.

  N.B. This function is tested for numerical stability for small `total < 5`. It
  may be unstable for much larger `total`.

  N.B.2. This function may throw an assertion error upon numerical instability.
  This can happen if the algorithm is *extremely* surprised by a result; for
  example, if `successes=0` and `total=5` (complete failure) when `tnow` is very
  small compared to the halflife encoded in `prior`. Calling functions are asked
  to call this inside a try-except block and to handle any possible
  `AssertionError`s in a manner consistent with user expectations, for example,
  by faking a more reasonable `tnow`. Please open an issue if you encounter such
  exceptions for cases that you think are reasonable.
 */
export function updateRecall(
    prior: Model,
    successes: number,
    total: number,
    tnow: number,
    q0?: number,
    rebalance = true,
    tback?: number,
    ): Model {
  if (0 > successes || successes > total || total < 1) {
    throw new Error("0 <= successes and successes <= total and 1 <= total must be true");
  }

  if (total === 1) { return _updateRecallSingle(prior, successes, tnow, q0, rebalance, tback); }

  if (!(successes === Math.trunc(successes) && total === Math.trunc(total))) {
    throw new Error('expecting integer successes and total')
  }

  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const failures = total - successes;
  const binomlns: number[] = [];
  for (let i = 0; i <= failures; i++) { binomlns.push(binomln(failures, i)); }

  function unnormalizedLogMoment(m: number, et: number) {
    const logProbs = [];
    for (let i = 0; i <= failures; i++) {
      logProbs.push(binomlns[i] + betaln(alpha + dt * (successes + i) + m * dt * et, beta));
    }
    const signs = [];
    for (let i = 0; i <= failures; i++) { signs.push(Math.pow(-1, i)); }
    return logsumexp(logProbs, signs)[0];
  }

  const logDenominator = unnormalizedLogMoment(0, 0);

  let et: number;
  if (rebalance) {
    const target = Math.log(0.5);
    const rootfn = (et: number) => unnormalizedLogMoment(1, et) - logDenominator - target;
    const status = {};
    const sol = fmin((x) => Math.abs(rootfn(x)), {}, status);
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

  const logMean = unnormalizedLogMoment(1, et) - logDenominator;
  const mean = Math.exp(logMean);
  const m2 = Math.exp(unnormalizedLogMoment(2, et) - logDenominator);

  if (mean <= 0) { throw new Error("negative mean encountered"); }
  if (m2 <= 0) { throw new Error("negative 2nd moment encountered"); }

  const meanSq = Math.exp(2 * logMean);
  const variance = m2 - meanSq;
  if (variance <= 0) { throw new Error("negative variance encountered"); }
  const [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  return [newAlpha, newBeta, tback];
}

function _updateRecallSingle(
    prior: Model,
    result: number,
    tnow: number,
    q0?: number,
    rebalance = true,
    tback?: number,
    ): Model {
  if (!(0 <= result && result <= 1)) { throw new Error('expecting result between 0 and 1 inclusive') }
  const [alpha, beta, t] = prior;

  const z = result > 0.5;
  const q1 = z ? result : 1 - result;
  if (q0 === undefined) { q0 = 1 - q1; }

  const dt = tnow / t;

  let [c, d] = z ? [q1 - q0, q0] : [q0 - q1, 1 - q0];

  const den = c * betafn(alpha + dt, beta) + d * (betafn(alpha, beta) || 0);

  function moment(N: number, et: number) {
    let num = c * betafn(alpha + dt + N * dt * et, beta);
    if (d !== 0) { num += d * betafn(alpha + N * dt * et, beta); }
    return num / den;
  }

  let et: number;
  if (rebalance) {
    const status = {};
    const sol = fmin((et) => Math.abs(moment(1, et) - 0.5), {lowerBound: 0}, status);
    if (!("converged" in status) || !status.converged) { throw new Error("failed to converge"); }
    et = sol;
    tback = et * tnow;
  } else if (tback) {
    et = tback / tnow;
  } else {
    tback = t;
    et = tback / tnow;
  }

  const mean = moment(1, et);
  const secondMoment = moment(2, et);

  const variance = secondMoment - mean * mean;
  const [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  if (newAlpha <= 0 || newBeta <= 0) throw new Error("newAlpha and newBeta must be greater than zero");
  return [newAlpha, newBeta, tback];
}

/**
  Convert recall probability prior's raw parameters into a model object.

  `t` is your guess as to the half-life of any given fact, in units that you
  must be consistent with throughout your use of Ebisu.

  `alpha` and `beta` are the parameters of the Beta distribution that describe
  your beliefs about the recall probability of a fact `t` time units after that
  fact has been studied/reviewed/quizzed. If they are the same, `t` is a true
  half-life, and this is a recommended way to create a default model for all
  newly-learned facts. If `beta` is omitted, it is taken to be the same as
  `alpha`.
 */
export function defaultModel(t: number, a = 4.0, b = a): Model { return [a, b, t]; }

/**
  When will memory decay to a given percentile?

  Given a memory `model` of the kind consumed by `predictRecall`,
  etc., and optionally a `percentile` (defaults to 0.5, the
  half-life), find the time it takes for memory to decay to
  `percentile`.
 */
export function modelToPercentileDecay(model: Model, percentile = 0.5, tolerance = 1e-4): number {
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

/**
  Given any model, return a new model with the original's halflife scaled.
  Use this function to adjust the halflife of a model.

  Perhaps you want to see this flashcard far less, because you *really* know it.
  `newModel = rescaleHalflife(model, 5)` to shift its memory model out to five
  times the old halflife.

  Or if there's a flashcard that suddenly you want to review more frequently,
  perhaps because you've recently learned a confuser flashcard that interferes
  with your memory of the first, `newModel = rescaleHalflife(model, 0.1)` will
  reduce its halflife by a factor of one-tenth.

  Useful tip: the returned model will have matching α = β, where `alpha, beta,
  newHalflife = newModel`. This happens because we first find the old model's
  halflife, then we time-shift its probability density to that halflife. The
  halflife is the time when recall probability is 0.5, which implies α = β.
  That is the distribution this function returns, except at the *scaled*
  halflife.
 */
export function rescaleHalflife(prior: Model, scale = 1): Model {
  const [alpha, beta, t] = prior;
  const oldHalflife = modelToPercentileDecay(prior);
  const dt = oldHalflife / t;

  const logDenominator = betaln(alpha, beta);
  const logm2 = betaln(alpha + 2 * dt, beta) - logDenominator;
  const m2 = Math.exp(logm2);
  const newAlphaBeta = 1 / (8 * m2 - 2) - 0.5;
  if (newAlphaBeta <= 0) { throw new Error("non-positive alpha, beta encountered"); }
  return [newAlphaBeta, newAlphaBeta, oldHalflife * scale];
}
