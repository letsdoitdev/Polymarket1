/**
 * A market price `p` (in [0, 1]) implies a binary payoff of (1 - p) / p
 * dollars per dollar staked on that outcome. This helper returns true
 * iff that payoff meets the minimum we are willing to consider when
 * recommending a bet. With the default minPayoff of 0.35 the cutoff
 * price is ~0.7407 -- anything trading at or below that clears.
 *
 * Intentionally not used by the market filter; Phase 5 applies it at
 * bet-recommendation time.
 */
export function meetsPayoffThreshold(price: number, minPayoff = 0.35): boolean {
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return false;
  return (1 - price) / price >= minPayoff;
}
