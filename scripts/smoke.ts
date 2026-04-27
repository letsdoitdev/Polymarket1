import { filterMarkets } from "../src/markets/filter";
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
    id: "fail-band",
    question: "True coin flip on policy outcome",
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
  console.log(`  - ${m.id} :: ${m.question} | ${m.resolvesInDays}d | tags=${m.tags.join(",")}`)
);
console.log(`\nRejected (${rejected.length}):`);
rejected.forEach((r) => console.log(`  - ${r.id}: ${r.reasons.join("; ")}`));

const expectedPass = ["pass-fed", "pass-russia"];
const expectedFail = [
  "fail-band",
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

// Tags must be raw matched keywords (no kw: prefix anymore).
const russia = passing.find((m) => m.id === "pass-russia");
if (!russia || !russia.tags.includes("russia") || russia.tags.some((t) => t.startsWith("kw:"))) {
  console.error("\n[FAIL] tags should be plain keyword(s) without kw: prefix:", russia?.tags);
  ok = false;
}

if (!passing.every((m) => m.resolvesInDays >= 0 && m.resolvesInDays <= 7)) {
  console.error("\n[FAIL] resolvesInDays out of expected range");
  ok = false;
}

if (!ok) process.exit(1);
console.log("\nOK: filter behaves as expected on fixtures.");
