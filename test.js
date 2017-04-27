var test = require('tape');
var ebisu = require('./index');
var fs = require('fs');
var ref = JSON.parse(fs.readFileSync('test.json', 'utf8'));

function relerr(dirt, gold) {
  return (dirt === gold) ? 0 : Math.abs(dirt - gold) / Math.abs(gold);
}
function relerrs(dirts, golds) {
  return Math.max(...dirts.map((d, i) => relerr(d, golds[i])));
}

test('compare', (t) => {
  for (let elt of ref) {
    var [operation, prior, args, result] = elt;
    var err;
    if (operation === 'update') {
      var jsres = ebisu.updateRecall(prior, ...args);
      result = result.post
      err = relerrs(jsres, result);
    } else if (operation === 'predict') {
      var jsres = ebisu.predictRecall(prior, ...args);
      result = result.mean;
      err = relerr(jsres, result);
    }
    t.ok(err < 1e-5, `err=${err}, jsres=${jsres}`);
  }
  t.end();
});
