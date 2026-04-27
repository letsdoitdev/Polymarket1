import { filterMarkets } from "../src/markets/filter";
import { RawGammaMarket } from "../src/markets/types";

const future = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const fixtures: RawGammaMarket[] = [
  {
    id: "pass-1",
    question: "Will the Fed cut rates by July?",
    description: "FOMC decision.",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.72","0.28"]',
    liquidityNum: 250_000,
    volumeNum: 1_500_000,
    endDate: future(60),
    active: true,
    closed: false,
    tags: [{ slug: "economics", label: "Economics" }],
  },
  {
    id: "fail-band",
    question: "50/50 coin flip market",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.50","0.50"]',
    liquidityNum: 250_000,
    endDate: future(30),
    active: true,
    tags: [{ slug: "politics" }],
  },
  {
    id: "fail-liquidity",
    question: "Low liquidity market",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 10_000,
    endDate: future(30),
    active: true,
    tags: [{ slug: "politics" }],
  },
  {
    id: "fail-horizon",
    question: "Resolves in 2027",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 250_000,
    endDate: future(400),
    active: true,
    tags: [{ slug: "politics" }],
  },
  {
    id: "fail-tag",
    question: "Sports market",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.80","0.20"]',
    liquidityNum: 250_000,
    endDate: future(30),
    active: true,
    tags: [{ slug: "sports" }],
  },
  {
    id: "fail-binary",
    question: "Multi-outcome market",
    outcomes: '["A","B","C"]',
    outcomePrices: '["0.4","0.4","0.2"]',
    liquidityNum: 250_000,
    endDate: future(30),
    active: true,
    tags: [{ slug: "politics" }],
  },
];

const { passing, rejected } = filterMarkets(fixtures, { minLiquidityUsd: 50_000 });

console.log(`Passing (${passing.length}):`);
passing.forEach((m) => console.log(`  - ${m.id} :: ${m.question}`));
console.log(`\nRejected (${rejected.length}):`);
rejected.forEach((r) => console.log(`  - ${r.id}: ${r.reasons.join("; ")}`));

const expectedPass = ["pass-1"];
const expectedFail = ["fail-band", "fail-liquidity", "fail-horizon", "fail-tag", "fail-binary"];

const passIds = passing.map((m) => m.id).sort();
const failIds = rejected.map((r) => r.id).sort();

if (JSON.stringify(passIds) !== JSON.stringify(expectedPass.sort())) {
  console.error("\n[FAIL] passing set mismatch", passIds);
  process.exit(1);
}
if (JSON.stringify(failIds) !== JSON.stringify(expectedFail.sort())) {
  console.error("\n[FAIL] rejected set mismatch", failIds);
  process.exit(1);
}
console.log("\nOK: filter behaves as expected on fixtures.");
