type Alpha = number
type Beta = number
type Time = number
type Model = [Alpha, Beta, Time]

/** Model, if you can’t bother to create a 3-array */
export function defaultModel(timeToForget: Time, alpha?: Alpha, beta?: Beta): Model

/**
 * Predicts the current recall probability given a model and the time elapsed since the last review or quiz. If exact, then the returned value is actually a real probability. If exact is false, a final exponential is skipped and the returned value is the log-probability: this is the default because it makes things a bit faster
 * @param model [number, number, number]
 * @param timeElapsed time elapsed since the last review
 * @param exact false by default
 * @returns recall
 */
export function predictRecall(model: Model, timeElapsed: Time, exact?: boolean): number

/**
 * Update the model given a quiz result and time after its last review.
 * As a bonus, you can find the half-life (time for recall probability to decay to 50%)
 * Or actually, any percentile-life (time for recall probability to decay to any percentile)
 * @param model
 * @param result
 * @param timeNow
 * @returns Model
 */
export function updateRecall(model: Model, result: boolean, timeSinceLastReview: Time): Model

/**
 * If coarse is false (the default), the returned value is accurate to within tolerance
 * (i.e., if the true half-life is 1 week, the returned value will be between 0.9999 and 1.0001).
 * If coarse is truthy, the returned value is only roughly within a factor of two of the actual value.
 * @param model
 * @param [percentile]
 * @param [coarse]
 * @param [tolerance]
 * @returns to percentile decay
 */
export function modelToPercentileDecay(model: Model, percentile?: number, coarse?: boolean, tolerance?: number): number
