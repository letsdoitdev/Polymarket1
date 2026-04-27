import "dotenv/config";
import { fetchMarkets } from "./markets/client";
import { filterMarkets } from "./markets/filter";
import { Market } from "./markets/types";

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
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
  console.log(`\n[${idx + 1}] ${m.question}`);
  console.log(`    id:         ${m.id}`);
  console.log(`    YES odds:   ${yesPct}%`);
  if (quote) console.log(`    quote:      ${quote}`);
  console.log(`    liquidity:  ${formatUsd(m.liquidity)}`);
  console.log(`    volume:     ${formatUsd(m.volume)}`);
  console.log(`    resolves:   ${m.endDate.slice(0, 10)} (${m.resolvesInDays}d)`);
  console.log(`    tags:       ${m.tags.length ? m.tags.join(", ") : "(none)"}`);
}

async function main(): Promise<void> {
  const minLiquidityUsd = Number(process.env.MIN_LIQUIDITY_USD ?? 10_000);
  const showRejected = process.env.SHOW_REJECTED === "true";
  const debugRaw = process.env.DEBUG_RAW !== "false";

  console.log("Fetching active Polymarket markets from Gamma API...");
  const raws = await fetchMarkets({ active: true, closed: false, limit: 100 });
  console.log(`Fetched ${raws.length} markets.`);

  if (debugRaw && raws.length > 0) {
    console.log("\n=== DEBUG: raw JSON of first 3 markets (pre-parse) ===");
    for (let i = 0; i < Math.min(3, raws.length); i++) {
      console.log(`\n--- raw[${i}] ---`);
      console.log(JSON.stringify(raws[i], null, 2));
    }
    console.log("=== end DEBUG ===\n");
  }

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
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
