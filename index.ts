import * as ebisu2 from './ebisu2'
import {fmin, type Status} from "./fmin";
import type {Model} from './interfaces';

export function predictRecall(model: Model, elapsedTime: number, exact?: boolean): number {
  const l = Math.log2(1 + elapsedTime / model[2]);
  return ebisu2.predictRecall(model, l * model[2], exact);
}

export function updateRecall(model: Model, successes: number, total: number, elapsedTime: number, q0?: number): Model {
  const l = Math.log2(1 + elapsedTime / model[2]);
  return ebisu2.updateRecall(model, successes, total, l * model[2], q0, false); // never rebalance
}

export function modelToPercentileDecay(model: Model, percentile = 0.5, tolerance?: number): number {
  if (!(0 < percentile && percentile < 1)) { throw new Error('percentile ∈ (0, 1)'); }
  const lp = Math.log(percentile);
  const fminStatus = {};
  const res =
      fmin(h => Math.abs(lp - predictRecall(model, h)), {lowerBound: 1e-14, guess: model[2], tolerance}, fminStatus);
  if (!(fminStatus as Status).converged) { throw new Error('failed to converge') }
  return res;
}

export function defaultModel(t: number, a = 2.0, b = a): Model { return [a, b, t]; }
