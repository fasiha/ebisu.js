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

function predictRecall(prior, tnow, exact = false) {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? exp(ret) : ret;
}

function binomln(n, k) { return -betaln(1 + n - k, 1 + k) - Math.log(n + 1); }

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

function defaultModel(t, a = 4.0, b = a) { return [a, b, t]; }

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
