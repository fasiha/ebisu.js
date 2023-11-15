import * as ebisu2 from './ebisu2'
import {fmin, Status} from "./fmin";
import {Model3} from "./interfaces";
import {logsumexp, sumexp} from './logsumexp';
import {exceedsThresholdLeft, kahanSum, logNChooseK, logspace} from "./math";

export interface InitModelArgs {
  firstHalflife: number;
  lastHalflife?: number;
  firstWeight?: number;
  numAtoms?: number;
  initialAlphaBeta?: number;
}
export function initModel(
    {firstHalflife, lastHalflife = 10e3 * firstHalflife, firstWeight = 0.9, numAtoms = 5, initialAlphaBeta = 2}:
        InitModelArgs): Model3 {
  if (!(isFinite(firstHalflife) && firstHalflife > 0)) { throw new Error('expecting positive firstHalflife'); }
  const fminStatus = {};
  const solution = fmin((d) => {
    let sum = 0
    for (let i = 0; i < numAtoms; i++) { sum += firstWeight * d ** i; }
    return Math.abs(sum - 1);
  }, {lowerBound: 1e-3, guess: 0.5, tolerance: 1e-10, maxIterations: 1000}, fminStatus);
  if (!((fminStatus as Status).converged && isFinite(solution) && 0 < solution && solution < 1)) {
    throw new Error('unable to initialize: ' + fminStatus)
  }

  const weights: number[] = [];
  for (let i = 0; i < numAtoms; i++) { weights.push(firstWeight * solution ** i); }
  const wsum = kahanSum(weights); // this is constructed to be very close to 1 but just make sure

  const halflives = logspace(Math.log10(firstHalflife), Math.log10(lastHalflife), numAtoms);

  return weights.map(
      (w, i) =>
          ({log2weight: Math.log2(w / wsum), alpha: initialAlphaBeta, beta: initialAlphaBeta, time: halflives[i]}))
}

const LN2 = Math.log(2);
export function predictRecall(model: Model3, elapsedTime: number): number {
  const logps = model.map(m => LN2 * m.log2weight + ebisu2.predictRecall([m.alpha, m.beta, m.time], elapsedTime))
  const result = sumexp(logps)
  if (!(isFinite(result) && 0 <= result && result <= 1)) { throw new Error('unexpected result') }
  return result
}

export function predictRecallApproximate(model: Model3, elapsedTime: number): number {
  return sumexp(model.map(m => LN2 * (m.log2weight - elapsedTime / m.time)))
}

export function modelToPercentileDecay(model: Model3, percentile = 0.5): number {
  if (!(0 < percentile && percentile < 1)) { throw new Error('percentile ∈ (0, 1)'); }

  const fminStatus = {};
  const res =
      fmin(h => Math.abs(percentile - predictRecall(model, h)), {lowerBound: 0.01, guess: model[0].time}, fminStatus);
  if (!(fminStatus as Status).converged) { throw new Error('failed to converge') }
  return res;
}

function _noisyLogProbability(result: number, q1: number, q0: number, p: number): number {
  const z = result >= .5;
  return Math.log(z ? ((q1 - q0) * p + q0) : (q0 - q1) * p + (1 - q0))
}

function _binomialLogProbability(successes: number, total: number, p: number): number {
  return logNChooseK(total, successes) + successes * Math.log(p) + (total - successes) * Math.log(1 - p);
}

export interface UpdateRecallArgs {
  model: Model3;
  successes: number;
  total?: number;
  elapsedTime: number;
  q0?: number;
  updateThreshold?: number;
  weightThreshold?: number
}
export function updateRecall({
  model,
  successes,
  total = 1,
  elapsedTime,
  q0 = 1 - Math.max(successes, 1 - successes),
  updateThreshold = .9,
  weightThreshold = .9,
}: UpdateRecallArgs): Model3 {
  if (!(total === Math.floor(total) && total >= 1 && 0 <= successes && successes <= total)) {
    throw new Error('total must be positive integer and successes ∈ [0, total]');
  }

  const updatedModels =
      model.map(m => ebisu2.updateRecall([m.alpha, m.beta, m.time], successes, total, elapsedTime, q0));
  const pRecalls = model.map(m => ebisu2.predictRecall([m.alpha, m.beta, m.time], elapsedTime, true));

  let individualLogProbabilities: number[];
  if (total === 1) {
    const q1 = Math.max(successes, 1 - successes)
    individualLogProbabilities = pRecalls.map(p => _noisyLogProbability(successes, q1, q0, p))
  } else {
    if (successes !== Math.floor(successes)) { throw new Error('total>1 implies successes is integer') }
    individualLogProbabilities = pRecalls.map(p => _binomialLogProbability(successes, total, p));
  }

  if (!individualLogProbabilities.every(x => x < 0)) { throw new Error('all log-probabilities must be negative'); }

  const newAtoms: Model3 = []

      const exceedsWeight = exceedsThresholdLeft(model.map(m => 2 ** m.log2weight), weightThreshold);
  for (const [idx, oldAtom] of model.entries()) {
    const updatedAtom = updatedModels[idx];
    const exceeds = exceedsWeight[idx];
    const lp = individualLogProbabilities[idx];

    const oldHl = oldAtom.time;
    const newHl = updatedAtom[2];
    const scal = newHl / oldHl;

    const newLog2Weight = oldAtom.log2weight + lp / LN2;

    if (scal > updateThreshold || exceeds) {
      newAtoms.push({alpha: updatedAtom[0], beta: updatedAtom[1], time: updatedAtom[2], log2weight: newLog2Weight})
    } else {
      newAtoms.push({...oldAtom, log2weight: newLog2Weight})
    }
  }

  const log2WeightSum = logsumexp(newAtoms.map(m => m.log2weight * LN2)) / LN2
  for (const atom of newAtoms) { atom.log2weight -= log2WeightSum; }

  return newAtoms;
}

export function rescaleHalflife(model: Model3, scale: number, tolerance?: number): Model3 {
  if (scale <= 0) { throw new Error('scale > 0'); }
  return model.map(m => {
    const scaled = ebisu2.rescaleHalflife([m.alpha, m.beta, m.time], scale, tolerance);
    return { alpha: scaled[0], beta: scaled[1], time: scaled[2], log2weight: m.log2weight }
  });
}

export * as ebisu2 from './ebisu2';
export * from './interfaces';
export * as math from './math';
export * as logsumexp from './logsumexp';
// these are common-js
export * as fmin from './fmin';
export * as gamma from './gamma';