# Ebisu.js

This is a JavaScript port of the original Python implementation of [Ebisu](https://github.com/fasiha/ebisu), a public-domain library intended for use by quiz apps to intelligently handle scheduling. See [Ebisu’s literate documentation](https://github.com/fasiha/ebisu) for *all* the details! This document just contains a quick guide to how things work.

Browse this library’s [GitHub repo](https://github.com/fasiha/ebisu.js). Read this [document in HTML](https://fasiha.github.io/ebisu.js/) (cool interactive demos!).

## Install

**Node.js** First,
```
$ npm install --save ebisu-js
```
Then, in your code,
```js
var ebisu = require('ebisu-js');
```

**Browser** Two choices. For maximal compatibility, download the ES5-compatible [`dist/ebisu.min.js`](https://raw.githubusercontent.com/fasiha/ebisu.js/gh-pages/dist/ebisu.min.js) for the browser (13 KB uncompressed, 5 KB after gzip), then in your HTML:
```html
<script type="text/javascript" src="ebisu.min.js"></script>
```

If you want to target ES6-compatible browsers only, download and use [`dist/ebisu.min.es6.js`](https://raw.githubusercontent.com/fasiha/ebisu.js/gh-pages/dist/ebisu.min.es6.js). This is 5 KB uncompressed, 2.5 KB after gzip.

## API howto

Let’s start working immediately with code and we’ll explain as we go.

First, in Node, e.g.,
```js
var ebisu = require('ebisu-js');
```
or if you’re developing in this repo,
```js
var ebisu = require('./index');
```

(The `ebisu` module is loaded in [this webpage](https://fasiha.github.io/ebisu.js). Pop open your JavaScript console to try it out.)

### Memory model

Now, it’s important to know that Ebisu is a very narrowly-scoped library: it aims to answer just two questions:
- given a set of facts that a student is learning, which is the most (or least) likely to be forgotten?
- After the student is quizzed on one of these facts, how does the result get incorporated into Ebisu’s model of that fact’s memory strength?

Ebisu doesn’t concern itself with what these facts are, what they mean, nor does it handle *storing* the results of reviews. The external quiz app, at a minimum, stores a probability *model* with each fact’s memory strength, and it is this *model* that Ebisu transforms into predictions about recall probability or into *new* models after a quiz occurs.

Create a *default* model to assign newly-learned facts:
```js
var defaultModel = ebisu.defaultModel(24);
// Also ok: `ebisu.defaultModel(24, 4)` or even `ebisu.defaultModel(24, 4, 4)`.
console.log(defaultModel);
```
This returns a three-element array of numbers: we’ll call them `[a, b, t]`.

These three numbers describe the probability distribution on a fact’s recall probability. Specifically, they say that, `24` hours after review, we believe this fact’s recall probability will have a `Beta(a, b)` distribution, whose histogram looks like this, for a few thousand samples:
<div id="betarng-choo"></div>
<div id="betarng-render"></div>
In the interactive graph above, that **fourth** slider above lets you say how much time has *actually* elapsed since this fact was last reviewed. If you move it to be *more* or *less* than 24 hours, you’ll see the bulk of the histogram move *left* or *right*, since the less time elapsed, the more likely the student remembers this fact.

You can also move the sliders for `a` and `b`. Move the two time sliders back to 24 hours and notice that when `a = b`, the distribution is centered around 0.5. In this case, `t` is a half-life, i.e., the length of time it takes for recall probability to drop to 50%. If this `a = b` is high, the histogram tightly clusters around 0.5. For small `a = b`, the histogram is very diffuse around 0.5.

> We use the [Beta distribution](https://en.wikipedia.org/wiki/Beta_distribution), and not some other probability distribution on numbers between 0 and 1, for [statistical reasons](https://en.wikipedia.org/wiki/Conjugate_prior) that are indicated in depth in the [Ebisu math](https://fasiha.github.io/ebisu/#bernoulli-quizzes) writeup.

This should give you some insight into what those three numbers, `[4, 4, 24]` mean, and why you might want to customize them—you might want the half-life to be just two hours instead of a whole day, in which case you’d set `defaultModel` to `ebisu.defaultModel(2)`.

### Predict current recall probability: `ebisu.predictRecall`

Given a set of models for facts that the student has learned, you can ask Ebisu to predict each fact’s recall probability by passing in its model and the currently elapsed time since that fact was last reviewed or quizzed via `ebisu.predictRecall`:
```js
var model = defaultModel;
var elapsed = 1;
var predictedRecall = ebisu.predictRecall(model, elapsed, true);
console.log(predictedRecall);
```
This function efficiently calculates the *mean* of the histogram of recall probabilities in the interactive demo above (it uses math, not histograms!). Below you can see what this function would return for different models.
<div id="predict-choo"></div>
<div id="predict-render"></div>

A quiz app can call this function on each fact to find which fact is most in danger of being forgotten—that’s the one with the lowest predicted recall probability.

> N.B. In your app, you should omit the third argument, i.e., use `predictRecall(model, elapsed)`, which skips a final exponential and saves some runtime. (See the full API below.)
>
> If your quiz app starts having thousands of facts, and it becomes computationally-burdensome to evaluate this function over and over again, you can build a look-up table containing a range of elapsed times and their predicted recall probabilities, then linearly-interpolate into it.

### Update a recall probability model given a quiz result: `ebisu.updateRecall`

Suppose your quiz app has chosen a fact to review, and tests the student. Out of a `total` number of trials, the student gets `successes` of them correct. 

> Version 1 of Ebisu required `total=1`, i.e., binary quizzes. Version 2 relaxed this so `total` can be an integer greater than one, which models the case where each trial is a statistically-independent review of the fact under test. Note that this doesn’t mean you just ask the same fact multiple times!, since then the trials become highly dependent. Having `total` greater than 1 may make sense if, for example, the student is reviewing a verb conjugation, and conjugates the same verb in different sentences.

```js
var model = defaultModel;
var successes = 1;
var total = 1;
var elapsed = 10;
var newModel = ebisu.updateRecall(model, successes, total, elapsed);
console.log(newModel);
```
The new model is a new 3-array with a new `[a, b, t]`. The Bayesian update magic happens inside here: see here for [the gory math details](https://fasiha.github.io/ebisu/#updating-the-posterior-with-quiz-results).

### API summary

That’s it! That’s the entire API:
- `ebisu.defaultModel(t, [a, [b]]) -> model` if you can’t bother to create a 3-array.
- `ebisu.predictRecall(model, elapsed, exact = false) -> number` predicts the current recall probability given a model and the time elapsed since the last review or quiz. If `exact`, then the returned value is actually a real probability. If `exact` is falsey, a final exponential is skipped and the returned value is the log-probability: this is the default because it makes things a bit faster.
- `ebisu.updateRecall(model, successes, total, elapsed) -> model` to update the model after a quiz session with `successes` out of `total` statistically-independent trials exercising the fact, and time after its last review.

As a bonus, you can find the half-life (time for recall probability to decay to 50%), or actually, any percentile-life (time for recall probability to decay to any percentile):
- `ebisu.modelToPercentileDecay(model, percentile = 0.5, coarse = false, tolerance = 1e-4) -> number`, where, if `coarse` is falsey (the default), the returned value is accurate to within `tolerance` (i.e., if the true half-life is 1 week, the returned value will be between 0.9999 and 1.0001). If `coarse` is truthy, the returned value is only roughly within a factor of two of the actual value.

## Building

We use `tape` for tests: run `npm test`. This consumes `test.json`, which came from the [Ebisu Python reference implementation](https://fasiha.github.io/ebisu/).

The version of this repo matches the Python reference’s version up to minor rev (i.e., Python Ebisu 1.0.x will match Ebisu.js 1.0.y).

We use Browserify followed by Google Closure Compiler to minify Ebisu for the browser (and the interactive components of the website). `Makefile` coordinates the builds—I prefer `make` to npm scripts because Google Closure Compiler takes a few seconds to run, and `make` easily ensures it’s only run when it needs to.

## Acknowledgements

I use [gamma.js](https://github.com/substack/gamma.js), one of substack’s very lightweight and very useful modules.

I’m super-grateful for, and happily acknowledge, the hard work of Athan Reines and collaborators on [Stdlib.js](https://github.com/stdlib-js/stdlib), which promises to be the math library JavaScript so badly needs. It is used here only for visualization purposes but I can recommend it.

The interactive website uses [Choo](https://choo.io), which is, as advertised, quite cute.

It’s generated from Markdown via [Pandoc](http://pandoc.org), and styled with John Otander’s [Modest CSS](http://markdowncss.github.io/modest/).

The plots are rendered using [Plotly.js](https://github.com/plotly/plotly.js/).
