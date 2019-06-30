var test = require('tape');
var ebisu = require('./index');
var fs = require('fs');
var ref = JSON.parse(fs.readFileSync('test.json', 'utf8'));

test('verify halflife', t => {
  console.log(ebisu.modelToPercentileDecay([2, 2, 1], .5, true));
  console.log(ebisu.modelToPercentileDecay([2, 2, 1], .5, false));
  t.end();
})

function relerr(dirt, gold) { return (dirt === gold) ? 0 : Math.abs(dirt - gold) / Math.abs(gold); }
function relerrs(dirts, golds) { return Math.max(...dirts.map((d, i) => relerr(d, golds[i]))); }

test('compare', (t) => {
  let n = 0;
  for (let elt of ref) {
    // if (++n > 15) { break; }
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
    var THRESH = 1e-3; // Should be lower, why not? FIXME
    t.ok(err < THRESH, `err=${err}, jsres=${jsres}, elt=${JSON.stringify(elt)}`);
  }
  t.end();
});
