(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ebisu = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{"./logsumexp":2,"gamma":3,"minimize-golden-section-1d":4}],2:[function(require,module,exports){
var exp = Math.exp;
var log = Math.log;
var sign = Math.sign;
var max = Math.max;

function logsumexp(a, b) {
  var a_max = max(...a);
  var s = 0;
  for (let i = a.length - 1; i >= 0; i--) { s += b[i] * exp(a[i] - a_max); }
  var sgn = sign(s);
  s *= sgn;
  var out = log(s) + a_max;
  return [out, sgn];
}
module.exports = logsumexp;

},{}],3:[function(require,module,exports){
// transliterated from the python snippet here:
// http://en.wikipedia.org/wiki/Lanczos_approximation

var g = 7;
var p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
];

var g_ln = 607/128;
var p_ln = [
    0.99999999999999709182,
    57.156235665862923517,
    -59.597960355475491248,
    14.136097974741747174,
    -0.49191381609762019978,
    0.33994649984811888699e-4,
    0.46523628927048575665e-4,
    -0.98374475304879564677e-4,
    0.15808870322491248884e-3,
    -0.21026444172410488319e-3,
    0.21743961811521264320e-3,
    -0.16431810653676389022e-3,
    0.84418223983852743293e-4,
    -0.26190838401581408670e-4,
    0.36899182659531622704e-5
];

// Spouge approximation (suitable for large arguments)
function lngamma(z) {

    if(z < 0) return Number('0/0');
    var x = p_ln[0];
    for(var i = p_ln.length - 1; i > 0; --i) x += p_ln[i] / (z + i);
    var t = z + g_ln + 0.5;
    return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x)-Math.log(z);
}

module.exports = function gamma (z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    else if(z > 100) return Math.exp(lngamma(z));
    else {
        z -= 1;
        var x = p[0];
        for (var i = 1; i < g + 2; i++) {
            x += p[i] / (z + i);
        }
        var t = z + g + 0.5;

        return Math.sqrt(2 * Math.PI)
            * Math.pow(t, z + 0.5)
            * Math.exp(-t)
            * x
        ;
    }
};

module.exports.log = lngamma;

},{}],4:[function(require,module,exports){
'use strict';

var goldenSectionMinimize = require('./src/golden-section-minimize');
var bracketMinimum = require('./src/bracket-minimum');

var bounds = [0, 0];

module.exports = function minimize (f, options, status) {
  options = options || {};
  var x0;
  var tolerance = options.tolerance === undefined ? 1e-8 : options.tolerance;
  var dx = options.initialIncrement === undefined ? 1 : options.initialIncrement;
  var xMin = options.lowerBound === undefined ? -Infinity : options.lowerBound;
  var xMax = options.upperBound === undefined ? Infinity : options.upperBound;
  var maxIterations = options.maxIterations === undefined ? 100 : options.maxIterations;

  if (status) {
    status.iterations = 0;
    status.argmin = NaN;
    status.minimum = Infinity;
    status.converged = false;
  }

  if (isFinite(xMax) && isFinite(xMin)) {
    bounds[0] = xMin;
    bounds[1] = xMax;
  } else {
    // Construct the best guess we can:
    if (options.guess === undefined) {
      if (xMin > -Infinity) {
        x0 = xMax < Infinity ? 0.5 * (xMin + xMax) : xMin;
      } else {
        x0 = xMax < Infinity ? xMax : 0;
      }
    } else {
      x0 = options.guess;
    }

    bracketMinimum(bounds, f, x0, dx, xMin, xMax, maxIterations);

    if (isNaN(bounds[0]) || isNaN(bounds[1])) {
      return NaN;
    }
  }

  return goldenSectionMinimize(f, bounds[0], bounds[1], tolerance, maxIterations, status);
};

},{"./src/bracket-minimum":5,"./src/golden-section-minimize":6}],5:[function(require,module,exports){
'use strict';

module.exports = bracketMinimum;

function bracketMinimum (bounds, f, x0, dx, xMin, xMax, maxIter) {
  // If either size is unbounded (=infinite), Expand the guess
  // range until we either bracket a minimum or until we reach the bounds:
  var fU, fL, fMin, n, xL, xU, bounded;
  n = 1;
  xL = x0;
  xU = x0;
  fMin = fL = fU = f(x0);
  while (!bounded && isFinite(dx) && !isNaN(dx)) {
    ++n;
    bounded = true;

    if (fL <= fMin) {
      fMin = fL;
      xL = Math.max(xMin, xL - dx);
      fL = f(xL);
      bounded = false;
    }
    if (fU <= fMin) {
      fMin = fU;
      xU = Math.min(xMax, xU + dx);
      fU = f(xU);
      bounded = false;
    }

    // Track the smallest value seen so far:
    fMin = Math.min(fMin, fL, fU);

    // If either of these is the case, then the function appears
    // to be minimized against one of the bounds, so although we
    // haven't bracketed a minimum, we'll considere the procedure
    // complete because we appear to have bracketed a minimum
    // against a bound:
    if ((fL === fMin && xL === xMin) || (fU === fMin && xU === xMax)) {
      bounded = true;
    }

    // Increase the increment at a very quickly increasing rate to account
    // for the fact that we have *no* idea what floating point magnitude is
    // desirable. In order to avoid this, you should really provide *any
    // reasonable bounds at all* for the variables.
    dx *= n < 4 ? 2 : Math.exp(n * 0.5);

    if (!isFinite(dx)) {
      bounds[0] = -Infinity;
      bounds[1] = Infinity;
      return bounds;
    }
  }

  bounds[0] = xL;
  bounds[1] = xU;
  return bounds;
}

},{}],6:[function(require,module,exports){
'use strict';

var PHI_RATIO = 2 / (1 + Math.sqrt(5));

module.exports = goldenSectionMinimize;

function goldenSectionMinimize (f, xL, xU, tol, maxIterations, status) {
  var xF, fF;
  var iteration = 0;
  var x1 = xU - PHI_RATIO * (xU - xL);
  var x2 = xL + PHI_RATIO * (xU - xL);
  // Initial bounds:
  var f1 = f(x1);
  var f2 = f(x2);

  // Store these values so that we can return these if they're better.
  // This happens when the minimization falls *approaches* but never
  // actually reaches one of the bounds
  var f10 = f(xL);
  var f20 = f(xU);
  var xL0 = xL;
  var xU0 = xU;

  // Simple, robust golden section minimization:
  while (++iteration < maxIterations && Math.abs(xU - xL) > tol) {
    if (f2 > f1) {
      xU = x2;
      x2 = x1;
      f2 = f1;
      x1 = xU - PHI_RATIO * (xU - xL);
      f1 = f(x1);
    } else {
      xL = x1;
      x1 = x2;
      f1 = f2;
      x2 = xL + PHI_RATIO * (xU - xL);
      f2 = f(x2);
    }
  }

  xF = 0.5 * (xU + xL);
  fF = 0.5 * (f1 + f2);

  if (status) {
    status.iterations = iteration;
    status.argmin = xF;
    status.minimum = fF;
    status.converged = true;
  }

  if (isNaN(f2) || isNaN(f1) || iteration === maxIterations) {
    if (status) {
      status.converged = false;
    }
    return NaN;
  }

  if (f10 < fF) {
    return xL0;
  } else if (f20 < fF) {
    return xU0;
  } else {
    return xF;
  }
}

},{}]},{},[1])(1)
});
