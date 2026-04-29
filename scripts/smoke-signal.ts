/**
 * Offline smoke test for buildSmartMoneySignal. Fixture mirrors the
 * actual data-api /holders and /trades response shape verified against
 * conditionId 0x48fbf...c606 ("Will Trump visit China by April 30?").
 */
import { buildSmartMoneySignal } from "../src/wallets/signal";
import { RawHoldersResponse, RawTrade } from "../src/wallets/types";

const holders: RawHoldersResponse[] = [
  {
    token: "111111",
    holders: [
      { proxyWallet: "0xaaa1", asset: "111111", pseudonym: "yes-whale", name: "wA", amount: 50_000, outcomeIndex: 0 },
      { proxyWallet: "0xaaa2", asset: "111111", pseudonym: "yes-2", name: "wB", amount: 12_000, outcomeIndex: 0 },
      { proxyWallet: "0xaaa3", asset: "111111", pseudonym: "yes-3", name: "wC", amount: 5_000, outcomeIndex: 0 },
    ],
  },
  {
    token: "222222",
    holders: [
      { proxyWallet: "0xbbb1", asset: "222222", pseudonym: "no-whale", name: "wD", amount: 200_000, outcomeIndex: 1 },
      { proxyWallet: "0xbbb2", asset: "222222", pseudonym: "no-2", name: "wE", amount: 80_000, outcomeIndex: 1 },
      { proxyWallet: "0xbbb3", asset: "222222", pseudonym: "no-3", name: "wF", amount: 30_000, outcomeIndex: 1 },
      { proxyWallet: "0xbbb4", asset: "222222", pseudonym: "no-4", name: "wG", amount: 10_000, outcomeIndex: 1 },
    ],
  },
];

const trades: RawTrade[] = [
  ...Array(14).fill(0).map((_, i) => ({
    proxyWallet: `0xt${i}`, side: "BUY" as const, asset: "222222", conditionId: "0xCID",
    size: 100, price: 0.99, timestamp: 1700000000 + i, outcome: "No", outcomeIndex: 1,
    pseudonym: "trader",
  })),
  ...Array(2).fill(0).map((_, i) => ({
    proxyWallet: `0xy${i}`, side: "BUY" as const, asset: "111111", conditionId: "0xCID",
    size: 100, price: 0.01, timestamp: 1700000000 + i, outcome: "Yes", outcomeIndex: 0,
    pseudonym: "trader",
  })),
  ...Array(4).fill(0).map((_, i) => ({
    proxyWallet: `0xs${i}`, side: "SELL" as const, asset: "222222", conditionId: "0xCID",
    size: 100, price: 0.99, timestamp: 1700000000 + i, outcome: "No", outcomeIndex: 1,
    pseudonym: "trader",
  })),
];

const sig = buildSmartMoneySignal(holders, trades);

console.log(sig.asText);
console.log("\n---");
console.log({
  yesWalletCount: sig.yesWalletCount,
  noWalletCount: sig.noWalletCount,
  yesTotal: sig.yesTotal,
  noTotal: sig.noTotal,
  netLean: sig.netLean,
  recentBuyDirection: sig.recentBuyDirection,
  recentYesBuyCount: sig.recentYesBuyCount,
  recentNoBuyCount: sig.recentNoBuyCount,
});

let ok = true;

if (sig.yesWalletCount !== 3 || sig.noWalletCount !== 4) {
  console.error("[FAIL] wallet counts"); ok = false;
}
if (sig.yesTotal !== 67_000) {
  console.error("[FAIL] yesTotal:", sig.yesTotal); ok = false;
}
if (sig.noTotal !== 320_000) {
  console.error("[FAIL] noTotal:", sig.noTotal); ok = false;
}
if (sig.netLean !== "NO") {
  console.error("[FAIL] netLean should be NO:", sig.netLean); ok = false;
}
if (sig.recentBuyDirection !== "NO") {
  console.error("[FAIL] recentBuyDirection should be NO:", sig.recentBuyDirection); ok = false;
}
if (sig.recentYesBuyCount !== 2 || sig.recentNoBuyCount !== 14) {
  console.error("[FAIL] recent buy counts"); ok = false;
}
if (sig.topNoHolders[0]?.address !== "0xbbb1") {
  console.error("[FAIL] top NO holder should be 0xbbb1:", sig.topNoHolders[0]); ok = false;
}
if (sig.topYesHolders[0]?.address !== "0xaaa1") {
  console.error("[FAIL] top YES holder should be 0xaaa1:", sig.topYesHolders[0]); ok = false;
}
if (!sig.asText.includes("Net smart money lean: NO")) {
  console.error("[FAIL] asText missing lean line"); ok = false;
}

// Coin-flip case: equal totals -> NEUTRAL
const flat = buildSmartMoneySignal(
  [
    { token: "1", holders: [{ proxyWallet: "0x1", asset: "1", pseudonym: "", amount: 100, outcomeIndex: 0 }] },
    { token: "2", holders: [{ proxyWallet: "0x2", asset: "2", pseudonym: "", amount: 100, outcomeIndex: 1 }] },
  ],
  []
);
if (flat.netLean !== "NEUTRAL") { console.error("[FAIL] equal totals should be NEUTRAL:", flat.netLean); ok = false; }
if (flat.recentBuyDirection !== "MIXED") { console.error("[FAIL] no trades should be MIXED:", flat.recentBuyDirection); ok = false; }

if (!ok) process.exit(1);
console.log("\nOK: smart money signal builds correctly.");
