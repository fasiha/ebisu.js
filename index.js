"use strict";

var gammaln = require(
    '@stdlib/stdlib/lib/node_modules/@stdlib/math/base/special/gammaln');

var lse = require('./logsumexp');

var log;
var exp;
var expm1;
if (false) {
  log = Math.log;
  exp = Math.exp;
  expm1 = Math.expm1;
} else {
  log =
      require('@stdlib/stdlib/lib/node_modules/@stdlib/math/base/special/log');
  exp =
      require('@stdlib/stdlib/lib/node_modules/@stdlib/math/base/special/exp');
  expm1 = require(
      '@stdlib/stdlib/lib/node_modules/@stdlib/math/base/special/expm1');
}

function predictRecall(prior, tnow) {
  var [alpha, beta, t] = prior;
  var dt = tnow / t;
  return exp(gammaln(alpha + dt) - gammaln(alpha + beta + dt) -
             (gammaln(alpha) - gammaln(alpha + beta)));
}

function subtractexp(x, y) {
  var maxval = Math.max(x, y);
  return exp(maxval) * (exp(x - maxval) - exp(y - maxval));
}

function updateRecall(prior, result, tnow) {
  var [alpha, beta, t] = prior
  var dt = tnow / t;
  var mu;
  var v;
  if (result) {
    var same = gammaln(alpha + beta + dt) - gammaln(alpha + dt);
    var muln = gammaln(alpha + 2 * dt) - gammaln(alpha + beta + 2 * dt) + same;
    mu = exp(muln);
    v = subtractexp(same + gammaln(alpha + 3 * dt) -
                        gammaln(alpha + beta + 3 * dt),
                    2 * muln);
  } else {
    var s = Array.from(Array(4), (_, n) => gammaln(alpha + n * dt) -
                                           gammaln(alpha + beta + n * dt));
    mu = expm1(s[2] - s[1]) / -expm1(s[0] - s[1]);

    var n1 = lse([ s[1], s[0] ], [ 1, -1 ]);
    n1[0] += s[3];

    var n2 = lse([ s[0], s[1], s[2] ], [ 1, 1, -1 ]);
    n2[0] += s[2];

    var n3 = [ s[1] * 2, 1. ];

    var d = lse([ s[1], s[0] ], [ 1, -1 ]);
    d[0] *= 2;

    var n = lse([ n1[0], n2[0], n3[0] ], [ n1[1], n2[1], -n3[1] ]);

    v = exp(n[0] - d[0])
  }
  console.log(mu, v);
  var [newAlpha, newBeta] = meanVarToBeta(mu, v);
  return [ newAlpha, newBeta, tnow ];
}

function meanVarToBeta(mean, v) {
  var tmp = mean * (1 - mean) / v - 1;
  var alpha = mean * tmp
  var beta = (1 - mean) * tmp;
  return [ alpha, beta ];
}

function defaultModel(t, a = 4.0, b = a) { return [ a, b, t ]; }

module.exports = {
  updateRecall : updateRecall,
  predictRecall : predictRecall,
  defaultModel : defaultModel
};
