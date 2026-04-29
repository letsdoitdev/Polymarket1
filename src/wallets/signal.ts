import {
  RawHoldersResponse,
  RawTrade,
  SmartMoneyHolder,
  SmartMoneySignal,
} from "./types";

const LEAN_MARGIN = 1.2; // YES total must exceed NO by 20% (or vice versa) to call a lean
const RECENT_DIR_MARGIN = 2; // recent BUY direction needs a 2x margin to call

function sideFromOutcomeIndex(idx: number): "YES" | "NO" | null {
  if (idx === 0) return "YES";
  if (idx === 1) return "NO";
  return null;
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function formatTopList(holders: SmartMoneyHolder[], take = 5): string {
  if (holders.length === 0) return "  (none)";
  const lines = holders.slice(0, take).map((h) => {
    const tag = h.pseudonym ? `${h.pseudonym} (${shortAddr(h.address)})` : shortAddr(h.address);
    return `  - ${tag}: ${formatMoney(h.size)}`;
  });
  if (holders.length > take) {
    const tail = holders.slice(take);
    const tailTotal = tail.reduce((s, h) => s + h.size, 0);
    lines.push(`  - +${tail.length} more: ${formatMoney(tailTotal)}`);
  }
  return lines.join("\n");
}

export function buildSmartMoneySignal(
  holders: RawHoldersResponse[],
  trades: RawTrade[]
): SmartMoneySignal {
  const flat: SmartMoneyHolder[] = [];
  for (const tokenGroup of holders) {
    for (const h of tokenGroup.holders) {
      const side = sideFromOutcomeIndex(h.outcomeIndex);
      if (!side) continue; // skip unrecognized outcomeIndex (multi-outcome shouldn't reach here)
      flat.push({
        address: h.proxyWallet,
        pseudonym: h.pseudonym ?? h.name ?? "",
        side,
        size: h.amount,
      });
    }
  }

  const yes = flat
    .filter((p) => p.side === "YES")
    .sort((a, b) => b.size - a.size);
  const no = flat
    .filter((p) => p.side === "NO")
    .sort((a, b) => b.size - a.size);
  const yesTotal = yes.reduce((s, p) => s + p.size, 0);
  const noTotal = no.reduce((s, p) => s + p.size, 0);

  let netLean: "YES" | "NO" | "NEUTRAL" = "NEUTRAL";
  let leanRatio = 1;
  if (yesTotal > 0 && yesTotal > noTotal * LEAN_MARGIN) {
    netLean = "YES";
    leanRatio = noTotal === 0 ? Infinity : yesTotal / noTotal;
  } else if (noTotal > 0 && noTotal > yesTotal * LEAN_MARGIN) {
    netLean = "NO";
    leanRatio = yesTotal === 0 ? Infinity : noTotal / yesTotal;
  }

  const recentYesBuyCount = trades.filter(
    (t) => t.side === "BUY" && t.outcomeIndex === 0
  ).length;
  const recentNoBuyCount = trades.filter(
    (t) => t.side === "BUY" && t.outcomeIndex === 1
  ).length;
  let recentBuyDirection: "YES" | "NO" | "MIXED" = "MIXED";
  if (recentYesBuyCount > recentNoBuyCount * RECENT_DIR_MARGIN)
    recentBuyDirection = "YES";
  else if (recentNoBuyCount > recentYesBuyCount * RECENT_DIR_MARGIN)
    recentBuyDirection = "NO";

  const leanText =
    netLean === "NEUTRAL"
      ? "NEUTRAL (no clear lean)"
      : `${netLean} (${leanRatio === Infinity ? "all" : `~${leanRatio.toFixed(1)}x`} heavier than the other side)`;

  const asText = [
    `Top YES holders (${yes.length} wallets, ${formatMoney(yesTotal)} total exposure):`,
    formatTopList(yes),
    `Top NO holders (${no.length} wallets, ${formatMoney(noTotal)} total exposure):`,
    formatTopList(no),
    `Net smart money lean: ${leanText}`,
    `Recent ${trades.length}-trade BUY direction: ${recentBuyDirection} (YES BUYs: ${recentYesBuyCount}, NO BUYs: ${recentNoBuyCount})`,
    `(NOTE: per-wallet accuracy/ROI/specialization not yet computed; signal is position size + recent flow only.)`,
  ].join("\n");

  return {
    topYesHolders: yes.slice(0, 10),
    topNoHolders: no.slice(0, 10),
    yesWalletCount: yes.length,
    noWalletCount: no.length,
    yesTotal,
    noTotal,
    netLean,
    recentTradeCount: trades.length,
    recentBuyDirection,
    recentYesBuyCount,
    recentNoBuyCount,
    asText,
  };
}
