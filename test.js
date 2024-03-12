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
  for (const total of [1, 2]) {
    const allowedSuccesses = [0, 1, 2].filter(s => s <= total);
    for (const successes of allowedSuccesses) {
      t.ok(ebisu.updateRecall([4, 4, 0.0607], successes, total, 3.56))
      t.ok(ebisu.updateRecall([4, 4, 0.24], successes, total, 14.39))

      t.ok(ebisu.updateRecall([4, 4, 1], successes, total, 1_000))
      t.ok(ebisu.updateRecall([4, 4, 1], successes, total, 10_000))
      t.ok(ebisu.updateRecall([4, 4, 1], successes, total, 100_000))

      t.ok(ebisu.updateRecall([2, 2, 10], successes, total, 10000))
      t.ok(ebisu.updateRecall([2, 2, 10], successes, total, 1000))
      t.ok(ebisu.updateRecall([2, 2, 10], successes, total, 100))
    }
  }

  // even more extreme, see https://github.com/fasiha/ebisu.js/issues/20#issuecomment-1989133935
  t.throws(() => ebisu.updateRecall([4, 4, 1e9], 1, 1, 1.5));
  t.ok(ebisu.updateRecall([4, 4, 1e9], 1, 1, 1.5, undefined, undefined, undefined, {tolerance: 1e-6}));

  t.end();
});
