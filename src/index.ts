import "dotenv/config";
import { fetchMarkets } from "./markets/client";
import { filterMarkets } from "./markets/filter";
import { Market } from "./markets/types";
import { fetchMarketActivity } from "./wallets/client";

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

async function probeFirstMarketActivity(passing: Market[]): Promise<void> {
  if (passing.length === 0) {
    console.warn("\n[warn] No passing markets to probe activity for.");
    return;
  }

  const target = passing[0];
  if (!target.conditionId) {
    console.warn(
      `\n[warn] First passing market has no conditionId; cannot probe activity.`
    );
    return;
  }

  console.log(`\n=== Trades/activity probe (first passing market) ===`);
  console.log(`market:      ${target.question}`);
  console.log(`conditionId: ${target.conditionId}`);

  const result = await fetchMarketActivity(target.conditionId, 20);

  for (const a of result.attempts) {
    const statusStr = a.status === 0 ? "ERR" : a.status.toString();
    console.log(`\n--- HTTP ${statusStr} ${a.url} ---`);
    if (a.errorMessage) {
      console.log(`(error: ${a.errorMessage})`);
    }
    if (a.body) {
      const snippet =
        a.body.length > 500
          ? `${a.body.slice(0, 500)}...[truncated, ${a.body.length} bytes total]`
          : a.body;
      console.log(snippet);
    } else if (!a.errorMessage) {
      console.log("(empty body)");
    }
  }

  if (result.winningUrl) {
    console.log(`\n✓ First 2xx endpoint: ${result.winningUrl}`);
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

  await probeFirstMarketActivity(passing);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
