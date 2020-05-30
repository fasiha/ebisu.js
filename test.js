var test = require('tape');
var ebisu = require('./index');
var fs = require('fs');
var ref = JSON.parse(fs.readFileSync('test.json', 'utf8'));

function relerr(dirt, gold) { return (dirt === gold) ? 0 : Math.abs(dirt - gold) / Math.abs(gold); }
function relerrs(dirts, golds) { return Math.max(...dirts.map((d, i) => relerr(d, golds[i]))); }

test('verify halflife', t => {
  const hl = 20;
  t.ok(Math.abs(ebisu.modelToPercentileDecay([2, 2, hl], .5, true) - hl) > 1e-2);
  t.ok(relerr(ebisu.modelToPercentileDecay([2, 2, hl], .5, false, 1e-6), hl) < 1e-3)
  t.throws(() => ebisu.modelToPercentileDecay([2, 2, hl], .5, false, 1e-150), 'unreachable tolerance causes throw');
  t.end();
});

test('compare', (t) => {
  for (let elt of ref) {
    var [operation, prior, args, result] = elt;
    var err;
    if (operation === 'update') {
      var jsres = ebisu.updateRecall(prior, ...args);
      result = result.post
      err = relerrs(jsres, result);
    } else if (operation === 'predict') {
      var jsres = ebisu.predictRecall(prior, ...args, true);
      result = result.mean;
      err = relerr(jsres, result);
    }
    var THRESH = 2e-3; // Should be lower, why not? FIXME
    t.ok(err < THRESH, `err=${err}, actual=${jsres}, expected=${result}`);
  }
  t.end();
});
