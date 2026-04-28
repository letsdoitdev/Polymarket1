import "dotenv/config";
import { fetchMarkets } from "./markets/client";
import { filterMarkets } from "./markets/filter";
import { Market } from "./markets/types";
import { fetchPositions } from "./wallets/client";

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtSide(label: string, pct: number | null, passes: boolean): string {
  if (pct === null) return `${label} n/a`;
  return `${label} ${pct.toFixed(0)}% ${passes ? "✓" : "✗"}`;
}

function printMarket(m: Market, idx: number): void {
  const yesPct = (m.currentYesProbability * 100).toFixed(1);
  const quote = [
    m.bestBid !== undefined ? `bid ${m.bestBid.toFixed(3)}` : null,
    m.bestAsk !== undefined ? `ask ${m.bestAsk.toFixed(3)}` : null,
    m.lastTradePrice !== undefined ? `last ${m.lastTradePrice.toFixed(3)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const sp = m.sidePayoffs;
  const payoff = `${fmtSide("YES", sp.yesPayoffPct, sp.yesPasses)} | ${fmtSide("NO", sp.noPayoffPct, sp.noPasses)}`;
  console.log(`\n[${idx + 1}] ${m.question}`);
  console.log(`    id:         ${m.id}`);
  if (m.conditionId) console.log(`    condition:  ${m.conditionId}`);
  console.log(`    YES odds:   ${yesPct}%`);
  if (quote) console.log(`    quote:      ${quote}`);
  console.log(`    payoff:     ${payoff}`);
  console.log(`    liquidity:  ${formatUsd(m.liquidity)}`);
  console.log(`    volume:     ${formatUsd(m.volume)}`);
  console.log(`    resolves:   ${m.endDate.slice(0, 10)} (${m.resolvesInDays}d)`);
  console.log(`    tags:       ${m.tags.length ? m.tags.join(", ") : "(none)"}`);
}

async function probeFirstMarketPositions(passing: Market[]): Promise<void> {
  if (passing.length === 0) {
    console.warn("\n[warn] No passing markets to probe positions for.");
    return;
  }

  const target = passing[0];
  if (!target.conditionId) {
    console.warn(
      `\n[warn] First passing market has no conditionId; cannot probe positions.`
    );
    return;
  }

  const apiKey = process.env.POLYMARKET_API_KEY;

  console.log(`\n=== CLOB positions probe (first passing market) ===`);
  console.log(`market:      ${target.question}`);
  console.log(`conditionId: ${target.conditionId}`);
  if (!apiKey) {
    console.log(
      `(POLYMARKET_API_KEY not set -- only attempting public requests)`
    );
  }
  console.log("\nWalking candidate endpoints...");

  const result = await fetchPositions(target.conditionId, apiKey, 20);

  for (const a of result.attempts) {
    const auth = a.authMode === "bearer" ? "with auth" : "no auth  ";
    const statusStr = a.status === 0 ? "ERR" : a.status.toString();
    const trailer = a.errorMessage ? `  [error: ${a.errorMessage}]` : "";
    console.log(`  ${auth} | HTTP ${statusStr.padStart(3)} | ${a.url}${trailer}`);
  }

  if (result.winningUrl) {
    console.log(
      `\n✓ Working endpoint (${result.winningAuthMode}): ${result.winningUrl}`
    );
    console.log("\n--- raw response ---");
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.warn(`\n[warn] No candidate endpoint returned 2xx.`);
  }
}

async function main(): Promise<void> {
  const minLiquidityUsd = Number(process.env.MIN_LIQUIDITY_USD ?? 10_000);
  const showRejected = process.env.SHOW_REJECTED === "true";

  console.log("Fetching active Polymarket markets from Gamma API...");
  const raws = await fetchMarkets({ active: true, closed: false, limit: 100 });
  console.log(`Fetched ${raws.length} markets.`);

  const { passing, rejected } = filterMarkets(raws, { minLiquidityUsd });

  console.log(
    `\n=== ${passing.length} markets passed filter (of ${raws.length}) ===`
  );

  if (passing.length === 0) {
    console.log("No qualifying markets right now.");
  } else {
    passing
      .sort((a, b) => a.resolvesInDays - b.resolvesInDays)
      .forEach((m, i) => printMarket(m, i));
  }

  if (showRejected) {
    console.log(`\n--- ${rejected.length} rejected markets ---`);
    for (const r of rejected.slice(0, 25)) {
      console.log(`- ${r.question}`);
      r.reasons.forEach((reason) => console.log(`    · ${reason}`));
    }
    if (rejected.length > 25) {
      console.log(`  ...and ${rejected.length - 25} more`);
    }
  }

  await probeFirstMarketPositions(passing);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
