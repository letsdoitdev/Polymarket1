import { filterMarkets } from "../src/markets/filter";
import { meetsPayoffThreshold, computeSidePayoffs } from "../src/betting/payoff";
import { RawGammaMarket } from "../src/markets/types";

const future = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const fixtures: RawGammaMarket[] = [
  {
    id: "pass-fed",
    question: "Will the Fed cut rates by July?",
    description: "FOMC decision.",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.72","0.28"]',
    bestBid: "0.71",
    bestAsk: "0.73",
    lastTradePrice: 0.72,
    liquidityNum: 50_000,
    volumeNum: 1_500_000,
    endDate: future(5),
    active: true,
    closed: false,
  },
  {
    id: "pass-russia",
    question: "Will Russia and Ukraine sign a ceasefire deal this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.30","0.70"]',
    bestBid: "0.29",
    bestAsk: "0.31",
    liquidityNum: 25_000,
    endDate: future(4),
    active: true,
  },
  {
    id: "pass-coinflip",
    // 50/50 with band removed -- both sides have ~100% payoff, both pass.
    question: "Will Trump be indicted again this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.50","0.50"]',
    bestBid: "0.49",
    bestAsk: "0.51",
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-liquidity",
    question: "Low liquidity policy market",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    bestBid: "0.79",
    bestAsk: "0.81",
    liquidityNum: 5_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-horizon",
    question: "Policy market resolving next year",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    bestBid: "0.79",
    bestAsk: "0.81",
    liquidityNum: 50_000,
    endDate: future(60),
    active: true,
  },
  {
    id: "fail-past",
    // Server occasionally returns markets that already resolved. The new
    // hard client-side clamp should reject them.
    question: "Will Trump appoint a new minister last week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.20","0.80"]',
    bestBid: "0.19",
    bestAsk: "0.21",
    liquidityNum: 50_000,
    endDate: future(-2),
    active: true,
  },
  {
    id: "fail-no-keyword",
    question: "Sports outcome between two teams",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    bestBid: "0.79",
    bestAsk: "0.81",
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-binary",
    question: "Multi-outcome election market",
    outcomes: '["A","B","C"]',
    outcomePrices: '["0.4","0.4","0.2"]',
    bestBid: "0.39",
    bestAsk: "0.41",
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-payoff-both",
    // Tight quote near the middle is fine; this fixture is a tight quote
    // far enough on one side that NEITHER side clears the payoff threshold.
    // bestAsk = 0.85 -> YES payoff = 17.6%. bestBid = 0.85 -> NO price =
    // 0.15 -> NO payoff = 0.85/0.15 = 567% (passes). So we need a band
    // where YES fails AND NO fails. That requires bestAsk > 0.7407 AND
    // 1 - bestBid > 0.7407 -> bestBid < 0.2593. Impossible (bid > ask).
    // Use bid > ask is invalid; instead simulate a one-sided book where
    // bestBid is missing entirely and bestAsk fails the threshold.
    question: "Will the senate pass the appropriations bill this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.95","0.05"]',
    bestAsk: "0.95",
    // bestBid intentionally missing -> NO side unpriced -> fails by default
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-crypto-bitcoin",
    question: "Will Bitcoin hit $200k this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.20","0.80"]',
    bestBid: "0.19",
    bestAsk: "0.21",
    liquidityNum: 1_000_000,
    endDate: future(3),
    active: true,
  },
];

const { passing, rejected } = filterMarkets(fixtures, { minLiquidityUsd: 10_000 });

console.log(`Passing (${passing.length}):`);
passing.forEach((m) => {
  const sp = m.sidePayoffs;
  const ypct = sp.yesPayoffPct !== null ? `${sp.yesPayoffPct.toFixed(0)}%` : "n/a";
  const npct = sp.noPayoffPct !== null ? `${sp.noPayoffPct.toFixed(0)}%` : "n/a";
  console.log(
    `  - ${m.id} :: ${m.question} | ${m.resolvesInDays}d | ` +
      `YES ${ypct} ${sp.yesPasses ? "Y" : "N"} | NO ${npct} ${sp.noPasses ? "Y" : "N"}`
  );
});
console.log(`\nRejected (${rejected.length}):`);
rejected.forEach((r) => console.log(`  - ${r.id}: ${r.reasons.join("; ")}`));

const expectedPass = ["pass-fed", "pass-russia", "pass-coinflip"];
const expectedFail = [
  "fail-liquidity",
  "fail-horizon",
  "fail-past",
  "fail-no-keyword",
  "fail-binary",
  "fail-payoff-both",
  "fail-crypto-bitcoin",
];

const passIds = passing.map((m) => m.id).sort();
const failIds = rejected.map((r) => r.id).sort();

let ok = true;

if (JSON.stringify(passIds) !== JSON.stringify(expectedPass.sort())) {
  console.error("\n[FAIL] passing set mismatch", passIds);
  ok = false;
}
if (JSON.stringify(failIds) !== JSON.stringify(expectedFail.sort())) {
  console.error("\n[FAIL] rejected set mismatch", failIds);
  ok = false;
}

const past = rejected.find((r) => r.id === "fail-past");
if (!past || !past.reasons.some((x) => x.includes("resolvesInDays"))) {
  console.error("\n[FAIL] past-date market not rejected by clamp:", past?.reasons);
  ok = false;
}

const payoffBoth = rejected.find((r) => r.id === "fail-payoff-both");
if (!payoffBoth || !payoffBoth.reasons.some((x) => x.includes("payoff fails on both sides"))) {
  console.error("\n[FAIL] payoff-both-sides-fail not rejected:", payoffBoth?.reasons);
  ok = false;
}

const fed = passing.find((m) => m.id === "pass-fed");
if (
  !fed ||
  fed.bestBid !== 0.71 ||
  fed.bestAsk !== 0.73 ||
  fed.lastTradePrice !== 0.72
) {
  console.error("\n[FAIL] price fields not parsed:", {
    bid: fed?.bestBid,
    ask: fed?.bestAsk,
    last: fed?.lastTradePrice,
  });
  ok = false;
}

// pass-fed: YES ask 0.73 -> payoff 27/73 = 36.99% (passes); NO 1-0.71 = 0.29 -> 71/29 = 244.8% (passes).
if (!fed?.sidePayoffs.yesPasses || !fed?.sidePayoffs.noPasses) {
  console.error("\n[FAIL] pass-fed should have both sides passing:", fed?.sidePayoffs);
  ok = false;
}

// meetsPayoffThreshold. Exact cutoff is 1 / 1.35 ~= 0.74074.
const payoffCases: Array<[number, number | undefined, boolean]> = [
  [0.5, undefined, true],
  [0.74, undefined, true],
  [0.7407, undefined, true],
  [0.741, undefined, false],
  [0.9, undefined, false],
  [0.5, 1.0, true],
  [0.6, 1.0, false],
  [0, undefined, false],
  [1, undefined, false],
  [-0.1, undefined, false],
  [Number.NaN, undefined, false],
];
for (const [price, minPayoff, expected] of payoffCases) {
  const got =
    minPayoff === undefined
      ? meetsPayoffThreshold(price)
      : meetsPayoffThreshold(price, minPayoff);
  if (got !== expected) {
    console.error(
      `\n[FAIL] meetsPayoffThreshold(${price}, ${minPayoff ?? "default"}) -> ${got}, expected ${expected}`
    );
    ok = false;
  }
}

// computeSidePayoffs spot-checks.
const sp1 = computeSidePayoffs(0.71, 0.73);
if (!sp1.yesPasses || !sp1.noPasses || !sp1.anyPasses) {
  console.error("\n[FAIL] computeSidePayoffs(0.71, 0.73) should pass both:", sp1);
  ok = false;
}
const sp2 = computeSidePayoffs(undefined, 0.95);
if (sp2.yesPasses || sp2.noPasses || sp2.anyPasses) {
  console.error("\n[FAIL] computeSidePayoffs(undef, 0.95) should fail both:", sp2);
  ok = false;
}
const sp3 = computeSidePayoffs(0.10, 0.90);
// YES 0.90 -> 11.1% fails; NO 1-0.10=0.90 -> 11.1% fails.
if (sp3.yesPasses || sp3.noPasses || sp3.anyPasses) {
  console.error("\n[FAIL] computeSidePayoffs(0.10, 0.90) should fail both:", sp3);
  ok = false;
}

if (!ok) process.exit(1);
console.log("\nOK: filter behaves as expected on fixtures.");
