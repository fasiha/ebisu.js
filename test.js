var test = require('tape');
var ebisu = require('./index');
var fs = require('fs');
var ref = JSON.parse(fs.readFileSync('test.json', 'utf8'));

var std = require('@stdlib/math');
var stdlibEbisu = {betaln: std.base.special.betaln, betafn: std.base.special.beta};
var substackEbisu = ebisu.customizeMath(stdlibEbisu);

function relerr(dirt, gold) { return (dirt === gold) ? 0 : Math.abs(dirt - gold) / Math.abs(gold); }
function relerrs(dirts, golds) { return Math.max(...dirts.map((d, i) => relerr(d, golds[i]))); }

test('verify halflife', t => {
  const hl = 20;
  t.ok(relerr(ebisu.modelToPercentileDecay([2, 2, hl], .5, 1e-6), hl) < 1e-3)
  t.throws(() => ebisu.modelToPercentileDecay([2, 2, hl], .5, 1e-150), 'unreachable tolerance causes throw');
  t.end();
});

test('compare', (t) => {
  var STDLIB_THRESH = 3e-3;
  var SUBSTACK_THRESH = 3e-2;
  for (const useSubstack of [true, false]) {
    var THRESH = useSubstack ? SUBSTACK_THRESH : STDLIB_THRESH;
    if (useSubstack) {
      ebisu.customizeMath(substackEbisu)
    } else {
      ebisu.customizeMath(stdlibEbisu)
    }
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
      t.ok(err < THRESH, `err=${err}, actual=${jsres}, expected=${result}`);
    }
  }
  t.end();
});

// Fixes #20
test("super-long t", (t) => {
  ebisu.customizeMath(substackEbisu);
  t.ok(ebisu.updateRecall([4, 4, 0.0607], 1, 1, 3.56))
  t.ok(ebisu.updateRecall([4, 4, 0.24], 1, 1, 14.39))

  t.ok(ebisu.updateRecall([4, 4, 1], 1, 1, 1_000))
  t.ok(ebisu.updateRecall([4, 4, 1], 1, 1, 10_000))
  t.ok(ebisu.updateRecall([4, 4, 1], 1, 1, 100_000))

  t.ok(ebisu.updateRecall([2, 2, 10], 1, 1, 10000))
  t.ok(ebisu.updateRecall([2, 2, 10], 1, 1, 1000))
  t.ok(ebisu.updateRecall([2, 2, 10], 1, 1, 100))
  t.end();
});
