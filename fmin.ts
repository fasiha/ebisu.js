export const fmin = require("minimize-golden-section-1d") as (
  objective: (x: number) => number,
  options: Partial<Options>,
  status: undefined | {} | Status
) => number;

export interface Options {
  tolerance: number;
  lowerBound: number;
  upperBound: number;
  maxIterations: number;
  guess: number;
  initialIncrement: number;
}

export interface Status {
  converged: boolean;
  iterations: number;
  minimum: number;
  argmin: number;
}
