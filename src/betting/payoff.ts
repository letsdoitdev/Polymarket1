/**
 * A market price `p` (in [0, 1]) implies a binary payoff of (1 - p) / p
 * dollars per dollar staked on that outcome. This helper returns true
 * iff that payoff meets the minimum we are willing to consider when
 * recommending a bet. With the default minPayoff of 0.35 the cutoff
 * price is ~0.7407 -- anything trading at or below that clears.
 */
export function meetsPayoffThreshold(price: number, minPayoff = 0.35): boolean {
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return false;
  return (1 - price) / price >= minPayoff;
}

export interface SidePayoffs {
  yesPrice: number | null;
  noPrice: number | null;
  // Payoff ratios expressed as percentages (e.g. 100 = 1:1 payoff).
  // Null when the corresponding side is unpriced/invalid.
  yesPayoffPct: number | null;
  noPayoffPct: number | null;
  yesPasses: boolean;
  noPasses: boolean;
  anyPasses: boolean;
}

function isUsablePrice(p: number | undefined): p is number {
  return typeof p === "number" && Number.isFinite(p) && p > 0 && p < 1;
}

function payoffPct(price: number): number {
  return ((1 - price) / price) * 100;
}

/**
 * Compute the YES and NO payoffs for a market from its top-of-book
 * quotes. YES price is the YES ask (what you pay to buy YES). NO price
 * is `1 - bestBid` (the YES bid is the NO ask in a binary market).
 */
export function computeSidePayoffs(
  bestBid: number | undefined,
  bestAsk: number | undefined,
  minPayoff = 0.35
): SidePayoffs {
  const yesPrice = isUsablePrice(bestAsk) ? bestAsk : null;
  const noPrice =
    isUsablePrice(bestBid) && isUsablePrice(1 - bestBid) ? 1 - bestBid : null;

  const yesPayoffPct = yesPrice !== null ? payoffPct(yesPrice) : null;
  const noPayoffPct = noPrice !== null ? payoffPct(noPrice) : null;

  const yesPasses =
    yesPrice !== null ? meetsPayoffThreshold(yesPrice, minPayoff) : false;
  const noPasses =
    noPrice !== null ? meetsPayoffThreshold(noPrice, minPayoff) : false;

  return {
    yesPrice,
    noPrice,
    yesPayoffPct,
    noPayoffPct,
    yesPasses,
    noPasses,
    anyPasses: yesPasses || noPasses,
  };
}
