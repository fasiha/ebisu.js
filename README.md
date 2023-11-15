# Ebisu.js 3.0.0-rc.1 Release Candidate

This is a TypeScript/JavaScript port of the original Python implementation of [Ebisu](https://github.com/fasiha/ebisu), a public-domain library intended for use by quiz apps to intelligently handle scheduling. See [Ebisu’s literate documentation](https://github.com/fasiha/ebisu) for *all* the details! This document just contains a quick guide to how things work for browser and Node.js.

> See also the documentation related to Python version 3's release candidate at https://github.com/fasiha/ebisu/tree/v3-release-candidate#readme

**Table of contents**
- [Ebisu.js 3.0.0-rc.1 Release Candidate](#ebisujs-300-rc1-release-candidate)
  - [Install](#install)
  - [API howto](#api-howto)
    - [Memory model](#memory-model)
    - [Predict current recall probability: `ebisu.predictRecall`](#predict-current-recall-probability-ebisupredictrecall)
    - [Update a recall probability model given a quiz result: `ebisu.updateRecall`](#update-a-recall-probability-model-given-a-quiz-result-ebisuupdaterecall)
    - [Model to halflife: `ebisu.modelToPercentileDecay`](#model-to-halflife-ebisumodeltopercentiledecay)
    - [Manual halflife override: `ebisu.rescaleHalflife`](#manual-halflife-override-ebisurescalehalflife)
  - [Building](#building)
  - [Changelog](#changelog)
  - [Acknowledgements](#acknowledgements)

## Install

As always, we support both Node.js (CommonJS/`require` as well as ES modules/`import`) and browser (ES modules/`import` as well as IIFE for `<script>`).

**Node.js** First,
```sh
$ npm i "https://github.com/fasiha/ebisu.js#v3"   # this will be updated once v3 is published to npm
```
Then, in your code, if you use CommonJS and `require`, simply:
```js
var ebisu = require('ebisu-js');
```

If you use ES modules and `import`, do this instead:
```js
import * as ebisu from 'ebisu-js';
```
If you use TypeScript, the above will just work.

**Browser** Make [`ebisu.min.js`](./dist/ebisu.min.js) available on your webserver and load it in a `script` tag (5.6 KB uncompressed, 3 KB after gzip), then in your HTML:
```html
<script type="text/javascript" src="ebisu.min.js"></script>
```
This makes the `ebisu` object available in the top-level. (I also recommend you include the [sourcemap](./dist/ebisu.min.js.map) to help debugging in the browser.)

If you want to avoid polluting your global namespace with this variable, you can use the minified ES module: make [`ebisu.min.mjs`](./dist/ebisu.min.mjs) available on your webserver (and ideally its [sourcemap](./dist/ebisu.min.mjs.map)), and in your HTML:
```html
<script type="module">
    import * as ebisu from './ebisu.min.mjs';
</script>
```

The above files are ES6+ and support modern browsers, only because I'm lazy and ESbuild only supports ES6+. If you need to support older browsers, please [get in touch](https://github.com/fasiha/ebisu.js/issues) and I'll be happy to make an ES5-compatible build.

## API howto

Let’s start working immediately with code and we’ll explain as we go.

### Memory model

It’s important to know that Ebisu is a very narrowly-scoped library: it aims to answer just two questions:
- given a set of facts that a student is learning, which is the most (or least) likely to be forgotten?
- After the student is quizzed on one of these facts, how does the result get incorporated into Ebisu’s model of that fact’s memory strength?

Ebisu doesn’t concern itself with what these facts are, what they mean, nor does it handle *storing* the results of reviews. The external quiz app, at a minimum, stores a probability *model* with each fact’s memory strength, and it is this *model* that Ebisu transforms into predictions about recall probability or into *new* models after a quiz occurs.

When a student first learns a fact, create a model to represent that fact:
```js
var model = ebisu.initModel({firstHalflife: 24});
console.log(model);
/*
[
  { log2weight: -0.15200309345004, alpha: 2, beta: 2, time: 23.999999999999993 },
  { log2weight: -3.473801293120639, alpha: 2, beta: 2, time: 239.99999999999994 },
  { log2weight: -6.795599492791237, alpha: 2, beta: 2, time: 2399.9999999999995 },
  { log2weight: -10.117397692461836, alpha: 2, beta: 2, time: 24000.00000000002 },
  { log2weight: -13.439195892132435, alpha: 2, beta: 2, time: 240000.00000000017 }
]
*/
```
This is the simplest memory model you can construct in Ebisu. We don't want to get too much into the mathematical apparatus but this reveals that our model contains 5 atoms that together form a weighted ensemble probability. The five atoms are:
1. halflife 24 hours, weight 90%
2. halflife 240 hours (10 days), wieght 9%
3. halflife 2400 hours (100 days), weight 0.9%
4. halflife 1000 days (2 years, 9 months), weight 0.09%
5. halflife 27 years, weight 0.009%.

Note how each halflife and each weight is logarithmically-spaced: this gives us a nice approximation to a power law decay that governs human memory. Each atom hypothesizes that if the student goes for this atom's halflife without reviewing this fact, the probability of recall according to this atom drops to 50% (that's what "halflife" means). You requesting `firstHalflife: 24` initialized the first and most-weighted atom to 24 hours, but the longer-duration and lightly-weighted atoms help Ebisu track your memory as it journeys to maturity.

There are a number of optional parmeters you can pass into `initModel`:
- `lastHalflife`: by default `10_000` times the first halflife;
- `numAtoms`: the number of atoms to create (default 5);
- `firstWeight`: instead of 0.9 (90%), what weight to give the first atom? 
  - The rest of the weights follow from this since they all need to sum to 1. This has to be at least 0.2 because otherwise there's no set of weights that are both logarithmically decreasing and sum to 1.
- `initialAlphaBeta`: each atom is initialized with a `Beta(α, β)` random variable with `α = β = initialAlphaBeta`. This should be greater than 1 and the higher it goes, the more confident you are that the halflife is the *true* halflife, i.e., that the student's probability of recall after not reviewing the fact for the halflife is exactly 50% and unlikely to be 33% or 80%. The default `initialAlphaBeta = 2` is a nice loose prior.

> We use the [Beta distribution](https://en.wikipedia.org/wiki/Beta_distribution), and not some other probability distribution on numbers between 0 and 1, for [statistical reasons](https://en.wikipedia.org/wiki/Conjugate_prior) that are indicated in depth in the [Ebisu math](https://fasiha.github.io/ebisu/#bernoulli-quizzes) writeup.

### Predict current recall probability: `ebisu.predictRecall`

Suppose the student has learned a few flashcards and you've created a few memory models.

You can now ask Ebisu to predict each fact’s recall probability by passing in its model and the currently elapsed time since that fact was last reviewed or quizzed via `ebisu.predictRecall`:
```js
var model = ebisu.initModel({firstHalflife: 24});
var elapsed = 1; // hours elapsed since the fact was last seen
var predictedRecall = ebisu.predictRecall(model, elapsed);
console.log(predictedRecall);
// 0.969
```
This function calculates the *mean* (expected) recall probability. It's just been an hour so we are confident that the student should remember this fact. After two days, however, the expected recall probability has dropped considerably:
```js
console.log(ebisu.predictRecall(model, 48));
// 0.356
```

A quiz app can call this function on each fact to find which fact is most in danger of being forgotten—that’s the one with the lowest predicted recall probability.

### Update a recall probability model given a quiz result: `ebisu.updateRecall`

Suppose your quiz app has chosen a fact to review, and tests the student. It's time to update the model with the quiz results. Ebisu supports a rich set of quiz types:
1. of course we support the binary quiz, i.e., pass/fail.
2. We also support Duolingo-style quizzes where the student gets, e.g., 2 points out of a max of 3. This is called the binomial case (and of course plain binary quizzes are a special case of the binomial with a max of 1 point).
3. The most complex quiz type we support is called the noisy-binary quiz and lets you separate the actual quiz result (a pass/fail) with whether the student *actually* remembers the fact, by specifying two independent numbers:
   1. `Probability(passed quiz | actually remembers)`, or $q_1$ in the derivation below, is the probability that, assuming the student *actually* remembers the fact, they got the quiz right? This should be 1.0 (100%), especially if your app is nice and lets students change their grade (typos, etc.), but might be less if your app doesn’t allow this. Second, you can specify
   2. `Probability(passed quiz | actually forgot)`, or $q_0$ that is, given the student actually forgot the fact, what’s the probability they passed the quiz? This might be greater than zero if, for example, you provided multiple-choice quizzes and the student only remembered the answer because they recognized it in the list of choices. Or consider a foreign language reader app where users can read texts and click on words they don’t remember: imagine they read a sentence without clicking on any words—you’d like to be able to model the situation where, if you actually quizzed them on one of the words, they would fail the quiz, but all you know is they didn’t click on a word to see its definition.

The `updateRecall` function handles all these cases. It wants an Ebisu model (output by `initModel` for example), the number of `successes` out of `total` points, and the `elapsedTime`. Let's illustrate the simple binary case here:
```js
var model = ebisu.initModel({firstHalflife: 24});
var successes = 1;
var total = 1;
var elapsedTime = 10;
var newModel = ebisu.updateRecall({model, successes, total, elapsedTime});
console.log(newModel);
/*
[
  { alpha: 2.011, beta: 2.011, time: 28.264, log2weight: -0.199 },
  { alpha: 2.001, beta: 2.001, time: 244.283, log2weight: -3.110 },
  { alpha: 2.000, beta: 2.000, time: 2404.285, log2weight: -6.387 },
  { alpha: 2.000, beta: 2.000, time: 24004.285, log2weight: -9.704 },
  { alpha: 2.000, beta: 2.000, time: 240004.285, log2weight: -13.025 }
]
*/
```
The new model is similar to the original model, but with each's Beta distribution parameters and weights adjusted according to this quiz result. Notice that each atom's halflife has increased: quite a bit for the shortest ones but barely any for the longer ones—this makes sense because an atom expecting the halflife of years will not be impressed with a successful quiz after only ten hours.

For the plain binary and binomial cases, `successes` is an integer between 0 and `total` (inclusive).

For the noisy-binary case, `total` must be 1 and `successes` can be a float going from 0 to 1 (inclusive).
- If `successes < 0.5`, the quiz is taken as a failure, whereas if `successes > 0.5`, it's taken as a success.
- `Probability(passed quiz | actually remembers)` is called `q1` in the Ebisu [math derivation](https://fasiha.github.io/ebisu/#bonus-soft-binary-quizzes) and is taken to be `max(successes, 1-successes)`. That is, if `successes` is =0.1 or 0.9, this conditional probability `q1` is the same, 0.9.
- The other probability `Probability(passed quiz | actually forgot)` is called `q0` in the Ebisu derivation and defaults to `1-q1`, but can be customized: it's passed in as another argument after the elapsed time.

The following code snippet illustrates how to use the default `q0` and how to specify it, for a quiz that happens three days after the student last reviewed this fact:
```js
var model = ebisu.initModel({firstHalflife: 24});
var successes = 0.95;
var total = 1;
var elapsedTime = 96;
var updated1 = ebisu.updateRecall({model, successes, total, elapsedTime}); // default q0

var q0 = 0.2;
var updated2 = ebisu.updateRecall({model, successes, total, elapsedTime, q0});

// compare halflives of these two cases
console.log([updated1, updated2].map(m => ebisu.modelToPercentileDecay(m)))
// [ 82.06755294961737, 48.72178919241523 ]
```
Both updates model a successful quiz with `q1` = 0.95. But the first defaulted  `q0` to the complement of `q1`, i.e., 0.05, as plausible. The second explicitly set a higher `q0`. The result can be seen in the halflife of the resultant models: 82 hours versus 48 hours.

There are two advanced arguments we have not discussed:
- `updateThreshold` and 
- `weightThreshold`

and these specify how to handle the inevitable early failures when it comes to long-duration halflives. We expect some quiz failures but it wouldn't make sense to update a one-year-halflife atom with a quiz failure after a day: we want that long-halflife atom to continue providing a little bit of probability that this fact's memory will grow so strong. The details of what these parameters do are omitted here and will be available in the Python v3-release-candidate docs: https://github.com/fasiha/ebisu/tree/v3-release-candidate#readme

The code snippet above also illustrates another function in the API, which we look at next.

### Model to halflife: `ebisu.modelToPercentileDecay`
Sometimes it's useful to find what delay makes an Ebisu model decay to 70%, 60%, 50% probability of recall. Some apps, for example, schedule a review for when a fact drops below some threshold. `ebisu.modelToPercentileDecay` accepts a model and optionally a percentile, and uses a golden section root finder to find the time needed for the model's recall probability to decay to that percentile:
```js
var model = ebisu.initModel({firstHalflife: 24});
console.log(ebisu.modelToPercentileDecay(model));
// 28.105893555287135
console.log(ebisu.modelToPercentileDecay(model, 0.1));
// 211.34206599189068
console.log(ebisu.modelToPercentileDecay(model, 0.9));
// 3.4566882903035907
```

Note how the halflife of a freshly-initialized model is a little bit more than the `firstHalflife` you provided—28 hours versus 24 hours. This is because, while the first atom has the bulk of the weight, the longer-duration atoms do contribute a little bit to the halflife (and therefore the probability of recall).

### Manual halflife override: `ebisu.rescaleHalflife`
It happens. You initialized a model and you updated it with some quizzes, but your initial halflife was just wrong. Your student tells your quiz app that it's just not the right halflife, and they want to see this fact more or less frequently. Ebisu gives you a function to accurately deal with this: `ebisu.rescaleHalflife` takes a model and a `scale` argument, a positive number, and returns a new model with the same probability distribution on recall probability but scaled to `t * scale`.

The following two code snippets let you say "I want to see this fact twice as often" versus "I'm seeing this fact ten times too often":
```js
var model = ebisu.defaultModel(24);

// I forgot this fact! Its halflife is half what I thought:
var newModel = ebisu.rescaleHalflife(model, 0.5);

// I know this fact! Its halflife is ten times what you think
var newModel2 = ebisu.rescaleHalflife(model, 10);
```

## Building

This is a TypeScript library. For a one-shot compile, run `npm run compile`. You can also run the TypeScript compiler in watch mode with `npm run compile-watch`.

We use `tape` for tests: after compiling, run `npm test`. This consumes `test.json` and `test3.json`, which came from the [Ebisu Python reference implementation](https://fasiha.github.io/ebisu/).

We use ESbuild to create CommonJS (for Node `require`), ES modules (for Node and browsers' `import`), and an IIFE (for browsers' `<script>` tag). `npm run build` will generate all three.

## Changelog
The version of this repo matches the Python reference’s version up to minor rev (i.e., Python Ebisu 1.0.x will match Ebisu.js 1.0.y). See the Python Ebisu [changelog](https://github.com/fasiha/ebisu/blob/gh-pages/CHANGELOG.md).

- JavaScript Ebisu version 3-rc.1 moves us from a single atom to an ensemble. This will give us much more accurate `predictRecall` predictions.
- JavaScript Ebisu version 2.1 added soft-binary quizzes, `rescaleHalflife`, and changes to `updateRecall` so that it always rebalances from the Python version.

## Acknowledgements

I use [gamma.js](https://github.com/substack/gamma.js), one of substack’s very lightweight and very useful modules.

We also use this fine [golden section minimization](https://github.com/scijs/minimize-golden-section-1d) routine from the wonderful Scijs package.

I’m super-grateful for, and happily acknowledge, the hard work of Athan Reines and collaborators on [Stdlib.js](https://github.com/stdlib-js/stdlib), which promises to be the math library JavaScript so badly needs. It is used here only for testing purposes but I can recommend it.

