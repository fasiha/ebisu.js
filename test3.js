var test = require('tape');
var ebisu = require('./index');
var fs = require('fs');
var ref = JSON.parse(fs.readFileSync('test3.json', 'utf8'));

function relerr(dirt, gold) { return (dirt === gold) ? 0 : Math.abs(dirt - gold) / Math.abs(gold); }

/**
 *
 * @param {import('./interfaces').Model3} actual
 * @param {import('./interfaces').Model3} expected
 */
function modelsEqual(actual, expected) {
  const EPS = 1e-6;
  return actual.every((a, i) => {
    const v = [
      relerr(a.alpha, expected[i].alpha),
      relerr(a.beta, expected[i].beta),
      relerr(a.time, expected[i].time),
      relerr(a.log2weight, expected[i].log2weight),
    ];
    if (!v.every(x => x < EPS)) { console.log(v); }
    return v.every(x => x < EPS);
  })
}

test('compare', t => {
  const EPS = 1e-6;
  for (const [type, input, expected] of ref) {
    if (type === 'init') {
      const actual = ebisu.initModel(input);
      t.ok(modelsEqual(actual, expected))
    } else if (type === 'predict') {
      const actual = ebisu.predictRecall(...input)
      t.ok(relerr(actual, expected) < EPS * 1e-5)
    } else if (type === 'update') {
      const actual = ebisu.updateRecall(input)
      const ok = modelsEqual(actual, expected);
      if (!ok) { console.error(JSON.stringify({input, actual, expected}, null, 1)) }
      t.ok(ok)
    } else if (type === 'modelToPercentileDecay') {
    } else {
      t.ok(false, 'unknown type')
    }
  }
  t.end();
});
