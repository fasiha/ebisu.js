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
