import { filterMarkets } from "../src/markets/filter";
import { meetsPayoffThreshold } from "../src/betting/payoff";
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
    liquidityNum: 25_000,
    endDate: future(4),
    active: true,
  },
  {
    id: "pass-coinflip",
    // 50/50 odds used to be rejected. Now the band is gone, so this passes.
    question: "Will Trump be indicted again this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.50","0.50"]',
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-liquidity",
    question: "Low liquidity policy market",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 5_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-horizon",
    question: "Policy market resolving next year",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 50_000,
    endDate: future(60),
    active: true,
  },
  {
    id: "fail-no-keyword",
    question: "Sports outcome between two teams",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-binary",
    question: "Multi-outcome election market",
    outcomes: '["A","B","C"]',
    outcomePrices: '["0.4","0.4","0.2"]',
    liquidityNum: 50_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-crypto-bitcoin",
    question: "Will Bitcoin hit $200k this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.20","0.80"]',
    liquidityNum: 1_000_000,
    endDate: future(3),
    active: true,
  },
  {
    id: "fail-crypto-eth",
    question: "Will an ETH ETF launch this week?",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.30","0.70"]',
    liquidityNum: 1_000_000,
    endDate: future(3),
    active: true,
  },
];

const { passing, rejected } = filterMarkets(fixtures, { minLiquidityUsd: 10_000 });

console.log(`Passing (${passing.length}):`);
passing.forEach((m) =>
  console.log(
    `  - ${m.id} :: ${m.question} | ${m.resolvesInDays}d | tags=${m.tags.join(",")}` +
      ` | bid=${m.bestBid ?? "-"} ask=${m.bestAsk ?? "-"} last=${m.lastTradePrice ?? "-"}`
  )
);
console.log(`\nRejected (${rejected.length}):`);
rejected.forEach((r) => console.log(`  - ${r.id}: ${r.reasons.join("; ")}`));

const expectedPass = ["pass-fed", "pass-russia", "pass-coinflip"];
const expectedFail = [
  "fail-liquidity",
  "fail-horizon",
  "fail-no-keyword",
  "fail-binary",
  "fail-crypto-bitcoin",
  "fail-crypto-eth",
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

const btc = rejected.find((r) => r.id === "fail-crypto-bitcoin");
if (!btc || btc.reasons.length !== 1 || !btc.reasons[0].includes("crypto keyword")) {
  console.error("\n[FAIL] crypto blocklist did not short-circuit:", btc?.reasons);
  ok = false;
}

const russia = passing.find((m) => m.id === "pass-russia");
if (!russia || !russia.tags.includes("russia") || russia.tags.some((t) => t.startsWith("kw:"))) {
  console.error("\n[FAIL] tags should be plain keywords:", russia?.tags);
  ok = false;
}

const coinflip = passing.find((m) => m.id === "pass-coinflip");
if (!coinflip) {
  console.error("\n[FAIL] 50/50 market should now pass with the band removed");
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

if (!passing.every((m) => m.resolvesInDays >= 0 && m.resolvesInDays <= 7)) {
  console.error("\n[FAIL] resolvesInDays out of expected range");
  ok = false;
}

// meetsPayoffThreshold. Exact cutoff is 1 / 1.35 ~= 0.74074.
const payoffCases: Array<[number, number | undefined, boolean]> = [
  [0.5, undefined, true],     // payoff = 1.0
  [0.74, undefined, true],    // 0.26/0.74 ~= 0.351 -> passes
  [0.7407, undefined, true],  // just inside the cutoff
  [0.741, undefined, false],  // just outside the cutoff
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

if (!ok) process.exit(1);
console.log("\nOK: filter behaves as expected on fixtures.");
