"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/minimize-golden-section-1d/src/golden-section-minimize.js
var require_golden_section_minimize = __commonJS({
  "node_modules/minimize-golden-section-1d/src/golden-section-minimize.js"(exports, module2) {
    "use strict";
    var PHI_RATIO = 2 / (1 + Math.sqrt(5));
    module2.exports = goldenSectionMinimize;
    function goldenSectionMinimize(f, xL, xU, tol, maxIterations, status) {
      var xF, fF;
      var iteration = 0;
      var x1 = xU - PHI_RATIO * (xU - xL);
      var x2 = xL + PHI_RATIO * (xU - xL);
      var f1 = f(x1);
      var f2 = f(x2);
      var f10 = f(xL);
      var f20 = f(xU);
      var xL0 = xL;
      var xU0 = xU;
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
  }
});

// node_modules/minimize-golden-section-1d/src/bracket-minimum.js
var require_bracket_minimum = __commonJS({
  "node_modules/minimize-golden-section-1d/src/bracket-minimum.js"(exports, module2) {
    "use strict";
    module2.exports = bracketMinimum;
    function bracketMinimum(bounds, f, x0, dx, xMin, xMax, maxIter) {
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
        fMin = Math.min(fMin, fL, fU);
        if (fL === fMin && xL === xMin || fU === fMin && xU === xMax) {
          bounded = true;
        }
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
  }
});

// node_modules/minimize-golden-section-1d/index.js
var require_minimize_golden_section_1d = __commonJS({
  "node_modules/minimize-golden-section-1d/index.js"(exports, module2) {
    "use strict";
    var goldenSectionMinimize = require_golden_section_minimize();
    var bracketMinimum = require_bracket_minimum();
    var bounds = [0, 0];
    module2.exports = function minimize(f, options, status) {
      options = options || {};
      var x0;
      var tolerance = options.tolerance === void 0 ? 1e-8 : options.tolerance;
      var dx = options.initialIncrement === void 0 ? 1 : options.initialIncrement;
      var xMin = options.lowerBound === void 0 ? -Infinity : options.lowerBound;
      var xMax = options.upperBound === void 0 ? Infinity : options.upperBound;
      var maxIterations = options.maxIterations === void 0 ? 100 : options.maxIterations;
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
        if (options.guess === void 0) {
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
  }
});

// node_modules/gamma/index.js
var require_gamma = __commonJS({
  "node_modules/gamma/index.js"(exports, module2) {
    var g = 7;
    var p = [
      0.9999999999998099,
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9984369578019572e-21,
      15056327351493116e-23
    ];
    var g_ln = 607 / 128;
    var p_ln = [
      0.9999999999999971,
      57.15623566586292,
      -59.59796035547549,
      14.136097974741746,
      -0.4919138160976202,
      3399464998481189e-20,
      4652362892704858e-20,
      -9837447530487956e-20,
      1580887032249125e-19,
      -21026444172410488e-20,
      21743961811521265e-20,
      -1643181065367639e-19,
      8441822398385275e-20,
      -26190838401581408e-21,
      36899182659531625e-22
    ];
    function lngamma(z) {
      if (z < 0)
        return Number("0/0");
      var x = p_ln[0];
      for (var i = p_ln.length - 1; i > 0; --i)
        x += p_ln[i] / (z + i);
      var t = z + g_ln + 0.5;
      return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x) - Math.log(z);
    }
    module2.exports = function gamma2(z) {
      if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma2(1 - z));
      } else if (z > 100)
        return Math.exp(lngamma(z));
      else {
        z -= 1;
        var x = p[0];
        for (var i = 1; i < g + 2; i++) {
          x += p[i] / (z + i);
        }
        var t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
      }
    };
    module2.exports.log = lngamma;
  }
});

// index.ts
var ebisu_exports = {};
__export(ebisu_exports, {
  customizeMath: () => customizeMath,
  defaultModel: () => defaultModel,
  modelToPercentileDecay: () => modelToPercentileDecay,
  predictRecall: () => predictRecall,
  rescaleHalflife: () => rescaleHalflife,
  updateRecall: () => updateRecall
});
module.exports = __toCommonJS(ebisu_exports);

// fmin.ts
var fmin = require_minimize_golden_section_1d();

// gamma.ts
var gamma = require_gamma();
var gammaln = gamma.log;

// logsumexp.ts
var exp = Math.exp;
var log = Math.log;
var sign = Math.sign;
var max = Math.max;
function logsumexp(a, b) {
  const a_max = max(...a);
  let s = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    s += b[i] * exp(a[i] - a_max);
  }
  const sgn = sign(s);
  s *= sgn;
  const out = log(s) + a_max;
  return [out, sgn];
}

// index.ts
var GAMMALN_CACHE = /* @__PURE__ */ new Map();
function gammalnCached(x) {
  let hit = GAMMALN_CACHE.get(x);
  if (hit !== void 0) {
    return hit;
  }
  hit = gammaln(x);
  GAMMALN_CACHE.set(x, hit);
  return hit;
}
function betalnRatio(a1, a, b) {
  return gammaln(a1) - gammaln(a1 + b) + gammalnCached(a + b) - gammalnCached(a);
}
var betaln = (a, b) => {
  return gammalnCached(a) + gammalnCached(b) - gammalnCached(a + b);
};
var betafn = (a, b) => {
  return gamma(a) * gamma(b) / gamma(a + b);
};
function binomln(n, k) {
  return -betaln(1 + n - k, 1 + k) - Math.log(n + 1);
}
function customizeMath(args) {
  const orig = { betaln, betafn };
  if (args.betaln) {
    betaln = args.betaln;
  }
  if (args.betafn) {
    betafn = args.betafn;
  }
  return orig;
}
function _meanVarToBeta(mean, v) {
  var tmp = mean * (1 - mean) / v - 1;
  var alpha = mean * tmp;
  var beta = (1 - mean) * tmp;
  return [alpha, beta];
}
function predictRecall(prior, tnow, exact = false) {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const ret = betalnRatio(alpha + dt, alpha, beta);
  return exact ? Math.exp(ret) : ret;
}
function updateRecall(prior, successes, total, tnow, q0, rebalance = true, tback) {
  if (0 > successes || successes > total || total < 1) {
    throw new Error("0 <= successes and successes <= total and 1 <= total must be true");
  }
  if (total === 1) {
    return _updateRecallSingle(prior, successes, tnow, q0, rebalance, tback);
  }
  if (!(successes === Math.trunc(successes) && total === Math.trunc(total))) {
    throw new Error("expecting integer successes and total");
  }
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const failures = total - successes;
  const binomlns = [];
  for (let i = 0; i <= failures; i++) {
    binomlns.push(binomln(failures, i));
  }
  function unnormalizedLogMoment(m, et2) {
    const logProbs = [];
    for (let i = 0; i <= failures; i++) {
      logProbs.push(binomlns[i] + betaln(alpha + dt * (successes + i) + m * dt * et2, beta));
    }
    const signs = [];
    for (let i = 0; i <= failures; i++) {
      signs.push(Math.pow(-1, i));
    }
    return logsumexp(logProbs, signs)[0];
  }
  const logDenominator = unnormalizedLogMoment(0, 0);
  let et;
  if (rebalance) {
    const target = Math.log(0.5);
    const rootfn = (et2) => unnormalizedLogMoment(1, et2) - logDenominator - target;
    const status = {};
    const sol = fmin((x) => Math.abs(rootfn(x)), {}, status);
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
  const logMean = unnormalizedLogMoment(1, et) - logDenominator;
  const mean = Math.exp(logMean);
  const m2 = Math.exp(unnormalizedLogMoment(2, et) - logDenominator);
  if (mean <= 0) {
    throw new Error("negative mean encountered");
  }
  if (m2 <= 0) {
    throw new Error("negative 2nd moment encountered");
  }
  const meanSq = Math.exp(2 * logMean);
  const variance = m2 - meanSq;
  if (variance <= 0) {
    throw new Error("negative variance encountered");
  }
  const [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  return [newAlpha, newBeta, tback];
}
function _updateRecallSingle(prior, result, tnow, q0, rebalance = true, tback) {
  if (!(0 <= result && result <= 1)) {
    throw new Error("expecting result between 0 and 1 inclusive");
  }
  const [alpha, beta, t] = prior;
  const z = result > 0.5;
  const q1 = z ? result : 1 - result;
  if (q0 === void 0) {
    q0 = 1 - q1;
  }
  const dt = tnow / t;
  let [c, d] = z ? [q1 - q0, q0] : [q0 - q1, 1 - q0];
  const den = c * betafn(alpha + dt, beta) + d * (betafn(alpha, beta) || 0);
  function moment(N, et2) {
    let num = c * betafn(alpha + dt + N * dt * et2, beta);
    if (d !== 0) {
      num += d * betafn(alpha + N * dt * et2, beta);
    }
    return num / den;
  }
  let et;
  if (rebalance) {
    const status = {};
    const sol = fmin((et2) => Math.abs(moment(1, et2) - 0.5), { lowerBound: 0 }, status);
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
  const mean = moment(1, et);
  const secondMoment = moment(2, et);
  const variance = secondMoment - mean * mean;
  const [newAlpha, newBeta] = _meanVarToBeta(mean, variance);
  if (newAlpha <= 0 || newBeta <= 0)
    throw new Error("newAlpha and newBeta must be greater than zero");
  return [newAlpha, newBeta, tback];
}
function defaultModel(t, a = 4, b = a) {
  return [a, b, t];
}
function modelToPercentileDecay(model, percentile = 0.5, tolerance = 1e-4) {
  if (percentile < 0 || percentile > 1) {
    throw new Error("percentiles must be between (0, 1) exclusive");
  }
  const [alpha, beta, t0] = model;
  const logBab = betaln(alpha, beta);
  const logPercentile = Math.log(percentile);
  function f(delta) {
    const logMean = betaln(alpha + delta, beta) - logBab;
    return Math.abs(logMean - logPercentile);
  }
  let status = {};
  const sol = fmin(f, { lowerBound: 0, tolerance }, status);
  if (!("converged" in status) || !status.converged) {
    throw new Error("failed to converge");
  }
  return sol * t0;
}
function rescaleHalflife(prior, scale = 1) {
  const [alpha, beta, t] = prior;
  const oldHalflife = modelToPercentileDecay(prior);
  const dt = oldHalflife / t;
  const logDenominator = betaln(alpha, beta);
  const logm2 = betaln(alpha + 2 * dt, beta) - logDenominator;
  const m2 = Math.exp(logm2);
  const newAlphaBeta = 1 / (8 * m2 - 2) - 0.5;
  if (newAlphaBeta <= 0) {
    throw new Error("non-positive alpha, beta encountered");
  }
  return [newAlphaBeta, newAlphaBeta, oldHalflife * scale];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  customizeMath,
  defaultModel,
  modelToPercentileDecay,
  predictRecall,
  rescaleHalflife,
  updateRecall
});
