export const gamma = require("gamma") as ((x: number) => number) & {
  log: (x: number) => number;
};
export const gammaln = gamma.log;
