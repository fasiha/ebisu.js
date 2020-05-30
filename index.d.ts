type Alpha = number
type Beta = number
type Time = number
type Model = [Alpha, Beta, Time];

/**
 * Convert recall probability prior's raw parameters into a model object.
 *
 * `t` is your guess as to the half-life of any given fact, in units that you
 * must be consistent with throughout your use of Ebisu.
 *
 * `alpha` and `beta` are the parameters of the Beta distribution that describe
 * your beliefs about the recall probability of a fact `t` time units after that
 * fact has been studied/reviewed/quizzed. If they are the same, `t` is a true
 * half-life, and this is a recommended way to create a default model for all
 * newly-learned facts. If `beta` is omitted, it is taken to be the same as
 * `alpha`.
 *
 * @param t
 * @param alpha
 * @param beta
 */
export function defaultModel(t: Time, alpha?: Alpha, beta?: Beta): Model

/**
 * Expected recall probability now, given a prior distribution on it.
 *
 * `prior` is a tuple representing the prior distribution on recall probability
 * after a specific unit of time has elapsed since this fact's last review.
 * Specifically,  it's a 3-tuple, `(alpha, beta, t)` where `alpha` and `beta`
 * parameterize a Beta distribution that is the prior on recall probability at
 * time `t`.
 *
 * `tnow` is the *actual* time elapsed since this fact's most recent review.
 *
 * Optional keyword parameter `exact` makes the return value a probability,
 * specifically, the expected recall probability `tnow` after the last review: a
 * number between 0 and 1. If `exact` is false (the default), some calculations
 * are skipped and the return value won't be a probability, but can still be
 * compared against other values returned by this function. That is, if
 *
 * > predictRecall(prior1, tnow1, True) < predictRecall(prior2, tnow2, True)
 *
 * then it is guaranteed that
 *
 * > predictRecall(prior1, tnow1, False) < predictRecall(prior2, tnow2, False)
 *
 * The default is set to false for computational efficiency.
 *
 * @param model
 * @param tnow
 * @param exact
 */
export function predictRecall(prior: Model, tnow: Time, exact?: boolean): number

/**
 * Update a prior on recall probability with a quiz result and time.
 *
 * `prior` is same as in `ebisu.predictRecall`'s arguments: an object
 * representing a prior distribution on recall probability at some specific time
 * after a fact's most recent review.
 *
 * `successes` is the number of times the user *successfully* exercised this
 * memory during this review session, out of `total` attempts. Therefore, `0 <=
 * successes <= total` and `1 <= total`.
 *
 * If the user was shown this flashcard only once during this review session,
 * then `total=1`. If the quiz was a success, then `successes=1`, else
 * `successes=0`.
 *
 * If the user was shown this flashcard *multiple* times during the review
 * session (e.g., Duolingo-style), then `total` can be greater than 1.
 *
 * `tnow` is the time elapsed between this fact's last review and the review
 * being used to update.
 *
 * Returns a new object (like `prior`) describing the posterior distribution of
 * recall probability after update.
 *
 * N.B. This function is tested for numerical stability for small `total < 5`. It
 * may be unstable for much larger `total`.
 *
 * N.B.2. This function may throw an assertion error upon numerical instability.
 * This can happen if the algorithm is *extremely* surprised by a result; for
 * example, if `successes=0` and `total=5` (complete failure) when `tnow` is very
 * small compared to the halflife encoded in `prior`. Calling functions are asked
 * to call this inside a try-except block and to handle any possible
 * `AssertionError`s in a manner consistent with user expectations, for example,
 * by faking a more reasonable `tnow`. Please open an issue if you encounter such
 * exceptions for cases that you think are reasonable.
 * @param prior
 * @param successes
 * @param total
 * @param tnow
 */
export function updateRecall(prior: Model, successes: number, total: number, tnow: Time): Model

/**
 * When will memory decay to a given percentile?
 *
 * Given a memory `model` of the kind consumed by `predictRecall`,
 * etc., and optionally a `percentile` (defaults to 0.5, the
 * half-life), find the time it takes for memory to decay to
 * `percentile`. If `coarse`, the returned time (in the same units as
 * `model`) is approximate. Use `tolerance` to tune how fine you want
 * the search to be.
 * @param model
 * @param percentile
 * @param coarse
 * @param tolerance
 */
export function modelToPercentileDecay(model: Model, percentile?: number, coarse?: boolean, tolerance?: number): number
