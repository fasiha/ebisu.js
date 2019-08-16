var ebisu = require('./index');

var choo = require('choo');
var html = require('choo/html');

var betarand =
    require('@stdlib/stdlib/lib/node_modules/@stdlib/random/base/beta');

// Histogram plot
function phistogram(ps, bins = 25) {
  var hits = Array.from(Array(bins), () => 0);
  for (let p of ps) {
    hits[Math.floor(p * .9999 * 25)]++;
  }
  return hits;
}

function predictRecallMonteCarlo(prior, tnow, Nsamp = 5000) {
  var [a, b, t] = prior;
  var dt = tnow / t;
  var ps = new Array(Nsamp);
  for (let i = 0; i < ps.length; i++) {
    ps[i] = Math.pow(betarand(a, b), dt);
  }
  return ps;
}

function renderHist(hits, div) {
  var binedges = hits.map((_, i) => i / hits.length);
  var data = [ {x : binedges, y : hits, type : 'bar'} ];
  var layout = {
    title : 'Histogram of recall probability model after elapsed time',
    xaxis : {title : 'Recall probability', range : [ 0, 1 ]},
    yaxis : {title : 'Frequency'}
  };

  Plotly.newPlot(div, data, layout);
}

var betarng = choo();
betarng.use((state, emitter) => {
  state.prior = [ 4, 4, 24 ];
  state.tnow = 24;
  state.locked = false;

  emitter.on('changeAlpha', data => {
    state.prior[0] = data;
    if (state.locked) {
      state.prior[1] = data;
    }
    emitter.emit('render');
  });
  emitter.on('changeBeta', data => {
    state.prior[1] = data;
    emitter.emit('render');
  });
  emitter.on('changeT', data => {
    state.prior[2] = data;
    emitter.emit('render');
  });

  emitter.on('changeTnow', data => {
    state.tnow = data;
    emitter.emit('render');
  });

  emitter.on('lockBToA', data => {
    state.locked = data;
    if (state.locked) {
      state.prior[1] = state.prior[0];
    }
    emitter.emit('render');
  });
});

var betarngMain = function(state, emit) {
  renderHist(phistogram(predictRecallMonteCarlo(state.prior, state.tnow)),
             "betarng-render");

  var [a, b, t] = state.prior;
  return html`<div>
  <ul>
  <li>a: ${a}
  <br><input type="range" min="1.25" max="20" step="0.25" value="${a}"
   oninput=${changeAlpha}/></li>

  <li>b: ${b} (lock to a?
    <input type="checkbox" onclick=${lockBToA} ${
                                                 state.locked ? "checked" : ""
                                               }/>)<br>
  <input type="range" min="1.25" max="20" step="0.25" value="${b}"
   oninput=${changeBeta} ${state.locked ? "disabled" : ""}/>
   </li>

  <li>t: ${t} hour${t !== 1 ? 's' : ''}<br>
  <input class="time-range" type="range" min="0.25" max="100" step="0.25"
   value="${t}" oninput=${changeT}/></li>

  <li>Actual elapsed time: ${state.tnow} hour${state.tnow !== 1 ? 's' : ''}<br>
   <input class="time-range" type="range" min="0" max="100" step="0.25"
   value="${state.tnow}" oninput=${changeTnow}/></li>
  </ul>
  </div>`;

  function changeAlpha(e) { emit('changeAlpha', e.target.value); }
  function changeBeta(e) { emit('changeBeta', e.target.value); }
  function changeT(e) { emit('changeT', e.target.value); }
  function changeTnow(e) { emit('changeTnow', e.target.value); }
  function lockBToA(e) { emit('lockBToA', e.target.checked); }
};
betarng.route('*', betarngMain);
betarng.mount('#betarng-choo');

// Predict plot
function renderPredictions(ts, ps, div) {
  var data = [ {x : ts, y : ps, type : 'scatter', mode : 'lines'} ];
  var layout = {
    title : 'Recall probability decays',
    xaxis : {title : 'Time since last review (hours)'},
    yaxis : {title : 'Recall probability', range : [ 0, 1 ]}
  };

  Plotly.newPlot(div, data, layout);
}

var predict = choo();
predict.use((state, emitter) => {
  state.prior = [ 4, 4, 7 ];

  emitter.on('changeAlpha', data => {
    state.prior[0] = +data;
    emitter.emit('render');
  });
  emitter.on('changeBeta', data => {
    state.prior[1] = +data;
    emitter.emit('render');
  });
  emitter.on('changeT', data => {
    state.prior[2] = +data;
    emitter.emit('render');
  });
});
var predictMain = function(state, emit) {
  var [a, b, t] = state.prior;
  var ts = Array.from(Array(100), (_, i) => i);
  var ps = ts.map(t => ebisu.predictRecall(state.prior, +t, true));

  renderPredictions(ts, ps, 'predict-render');
  return html`<div>
  <ul>
  <li>a: ${a}
  <br><input type="range" min="1.25" max="20" step="0.25" value="${a}"
   oninput=${changeAlpha}/></li>

  <li>b: ${b}<br>
  <input type="range" min="1.25" max="20" step="0.25" value="${b}"
   oninput=${changeBeta}/>
   </li>

  <li>t: ${t} hour${t !== 1 ? 's' : ''}<br>
  <input class="time-range" type="range" min="0.25" max="100" step="0.25"
   value="${t}" oninput=${changeT}/></li>
  </ul>
  </div>`;

  function changeAlpha(e) { emit('changeAlpha', e.target.value); }
  function changeBeta(e) { emit('changeBeta', e.target.value); }
  function changeT(e) { emit('changeT', e.target.value); }
};
predict.route('*', predictMain);
predict.mount('#predict-choo');
