"use strict";
var gammaln = require('gamma').log;
const logsumexp = require('./logsumexp');
const exp = Math.exp;
const log = Math.log;

const GAMMALN_CACHE = new Map();
function gammalnCached(x) {
  let hit = GAMMALN_CACHE.get(x);
  if (hit) { return hit; }
  hit = gammaln(x);
  GAMMALN_CACHE.set(x, hit);
  return hit;
}
function betalnRatio(a1, a, b) { return gammaln(a1) - gammaln(a1 + b) + gammalnCached(a + b) - gammalnCached(a); }
function betaln(a, b) { return gammalnCached(a) + gammalnCached(b) - gammalnCached(a + b); }

/**
 * Expected recall probability now, given a prior distribution on it.
 *
 * `prior` is a tuple representing the prior distribution on recall probability
 * after a specific unit of time has elapsed since this fact's last review.
 * Specifically,  it's a 3-tuple, `(alpha, beta, t)` where `alpha` and `beta`
 * parameterize a Beta distribution that is the prior on recall probability at
 * time `t`.
 *
 * `tnow` is the *actual* time elapsed since this fact's most recent review.
 *
 * Optional keyword parameter `exact` makes the return value a probability,
 * specifically, the expected recall probability `tnow` after the last review: a
 * number between 0 and 1. If `exact` is false (the default), some calculations
 * are skipped and the return value won't be a probability, but can still be
 * compared against other values returned by this function. That is, if
 *
 * > predictRecall(prior1, tnow1, True) < predictRecall(prior2, tnow2, True)
 *
 * then it is guaranteed that
 *
 * > predictRecall(prior1, tnow1, False) < predictRecall(prior2, tnow2, False)
 *
 * The default is set to false for computational efficiency.
 *
 * @param model
 * @param tnow
 * @param exact
 */
function predictRecall(prior, tnow, exact = false) {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? exp(ret) : ret;
}

function binomln(n, k) { return -betaln(1 + n - k, 1 + k) - Math.log(n + 1); }

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
function updateRecall(prior, successes, total, tnow, rebalance = true, tback = undefined) {
  const [alpha, beta, t] = prior
  tback = tback || t
  const dt = tnow / t;
  const et = tback / tnow;

  const binomlns = Array.from(Array(total - successes + 1), (_, i) => binomln(total - successes, i));
  const [logDenominator, logMeanNum, logM2Num] = [0, 1, 2].map(m => {
    const a = Array.from(Array(total - successes + 1),
                         (_, i) => binomlns[i] + betaln(beta, alpha + dt * (successes + i) + m * dt * et));
    const b = Array.from(Array(total - successes + 1), (_, i) => Math.pow(-1, i));
    return logsumexp(a, b)[0]
  });

  const mean = Math.exp(logMeanNum - logDenominator)
  const m2 = Math.exp(logM2Num - logDenominator)
  const meanSq = Math.exp(2 * (logMeanNum - logDenominator));
  const sig2 = m2 - meanSq;

  if (![mean, m2, sig2].every(x => isFinite(x) && x >= 0)) {
    throw new Error(JSON.stringify({prior, successes, total, tnow, rebalance, tback, mean, m2, sig2}));
  }

  const [newAlpha, newBeta] = _meanVarToBeta(mean, sig2)
  const proposed = [newAlpha, newBeta, tback];
  return rebalance ? _rebalance(prior, successes, total, tnow, proposed) : proposed;
}

function _rebalance(prior, k, n, tnow, proposed) {
  const [newAlpha, newBeta, _] = proposed;
  if (newAlpha > 2 * newBeta || newBeta > 2 * newAlpha) {
    const roughHalflife = modelToPercentileDecay(proposed, 0.5, true);
    return updateRecall(prior, k, n, tnow, false, roughHalflife);
  }
  return proposed;
}

function _meanVarToBeta(mean, v) {
  var tmp = mean * (1 - mean) / v - 1;
  var alpha = mean * tmp
  var beta = (1 - mean) * tmp;
  return [alpha, beta];
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
function defaultModel(t, a = 4.0, b = a) { return [a, b, t]; }

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
function modelToPercentileDecay(model, percentile = 0.5, coarse = false, tolerance = 1e-4) {
  if (percentile < 0 || percentile > 1) { throw new Error('percentiles must be between (0, 1) exclusive'); }
  const [alpha, beta, t0] = model;
  const logBab = betaln(alpha, beta);
  const logPercentile = log(percentile);
  function f(lndelta) {
    const logMean = betaln(alpha + exp(lndelta), beta) - logBab;
    return logMean - logPercentile;
  }
  const bracket_width = coarse ? 1 : 6;
  let blow = -bracket_width / 2.0
  let bhigh = bracket_width / 2.0
  let flow = f(blow)
  let fhigh = f(bhigh)
  while (flow > 0 && fhigh > 0) {
    // Move the bracket up.
    blow = bhigh
    flow = fhigh
    bhigh += bracket_width
    fhigh = f(bhigh)
  }
  while (flow < 0 && fhigh < 0) {
    // Move the bracket down.
    bhigh = blow
    fhigh = flow
    blow -= bracket_width
    flow = f(blow)
  }

  if (!(flow > 0 && fhigh < 0)) { throw new Error('failed to bracket') }
  if (coarse) { return (exp(blow) + exp(bhigh)) / 2 * t0; }
  const fmin = require('minimize-golden-section-1d');
  let status = {};
  const sol = fmin(x => Math.abs(f(x)), {lowerBound: blow, upperBound: bhigh, tolerance}, status)
  if (!status.converged) { throw new Error('failed to converge'); }
  return exp(sol) * t0;
}

module.exports = {
  updateRecall,
  predictRecall,
  defaultModel,
  modelToPercentileDecay,
};
