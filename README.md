# Ebisu.js

This is a JavaScript port of the original Python implementation of [Ebisu](https://github.com/fasiha/ebisu), a public-domain library intended for use by quiz apps to intelligently handle scheduling. See [Ebisu’s literate documentation](https://github.com/fasiha/ebisu) for *all* the details! This document just contains a quick guide to how things work.

Browse this library’s [GitHub repo](https://github.com/fasiha/ebisu.js). Read this [document in HTML](https://fasiha.github.io/ebisu.js/) (cool interactive demos!).

## Install

**Node.js** First,
```
$ yarn add ebisu-js
# or
$ npm install --save ebisu-js
```
Then, in your code,
```js
var ebisu = require('ebisu-js');
```

**Browser** Download [`dist/ebisu.min.js`](https://raw.githubusercontent.com/fasiha/ebisu.js/gh-pages/dist/ebisu.min.js) for the browser, then in your HTML:
```html
<script type="text/javascript" src="ebisu.min.js"></script>
```

## API howto

Let’s start working immediately with code and we’ll explain as we go.

First, in Node, e.g.,
```js
var ebisu = require('ebisu');
```
or if you’re developing in this repo,
```js
var ebisu = require('./index');
```

(The `ebisu` module is loaded in this webpage. Pop open your JavaScript console to try it out.)

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
var predictedRecall = ebisu.predictRecall(model, elapsed);
console.log(predictedRecall);
```
This function efficiently calculates the *mean* of the histogram of recall probabilities in the interactive demo above (it uses math, not histograms!). Below you can see what this function would return for different models.
<div id="predict-choo"></div>
<div id="predict-render"></div>

A quiz app can call this function on each fact to find which fact is most in danger of being forgotten—that’s the one with the lowest predicted recall probability.

> If your quiz app starts having thousands of facts, and it becomes computationally-burdensome to evaluate this function over and over again, you can build a look-up table containing a range of elapsed times and their predicted recall probabilities, then linearly-interpolate into it.

### Update a recall probability model given a quiz result: `ebisu.updateRecall`

Suppose your quiz app has chosen a fact to quiz and the result is in, either success or failure.
```js
var model = defaultModel;
var result = true;
var elapsed = 10;
var newModel = ebisu.updateRecall(model, result, elapsed);
console.log(newModel);
```
The new model is a new 3-array with a new `[a, b, t]`. The Bayesian update magic happens inside here: see here for [the gory math details](https://fasiha.github.io/ebisu/#updating-the-posterior-with-quiz-results).

### Summary

That’s it! That’s the entire API:
- `ebisu.defaultModel(t, [a, [b]]) -> model` if you can’t bother to create a 3-array,
- `ebisu.predictRecall(model, tnow) -> number` predicts the current recall probability given a model and the time elapsed since the last review or quiz, and
- `ebisu.updateRecall(model, result, tnow) -> model` to update the model given a quiz result and time after its last review.

## Building

I use [yarn](https://yarnpkg.com), but you don’t have to.

We use `tape` for tests: run `yarn test` (or `npm test`). This consumes `test.json`, which came from the [Ebisu Python reference implementation](https://fasiha.github.io/ebisu/).

The version of this repo matches the Python reference’s.

We use Browserify followed by Google Closure Compiler to minify Ebisu for the browser (and the interactive components of the website). `Makefile` coordinates the builds—I prefer `make` to yarn scripts because Google Closure Compiler takes a few seconds to run, and `make` easily ensures it’s only run when it needs to.

## Acknowledgements

I’m super-grateful for, and happily acknowledge, the hard work of Athan Reines and collaborators on [Stdlib.js](https://github.com/stdlib-js/stdlib), which promises to be the math library JavaScript so badly needs.

The interactive website uses [Choo](https://choo.io), which is, as advertised, quite cute.

It’s generated from Markdown via [Pandoc](http://pandoc.org), and styled with John Otander’s [Modest CSS](http://markdowncss.github.io/modest/).

The plots are rendered using [Plotly.js](https://github.com/plotly/plotly.js/).
