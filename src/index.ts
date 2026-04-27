import "dotenv/config";
import { fetchMarkets } from "./markets/client";
import { filterMarkets } from "./markets/filter";
import { Market } from "./markets/types";

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function printMarket(m: Market, idx: number): void {
  const yesPct = (m.currentYesProbability * 100).toFixed(1);
  console.log(`\n[${idx + 1}] ${m.question}`);
  console.log(`    id:        ${m.id}`);
  console.log(`    YES odds:  ${yesPct}%`);
  console.log(`    liquidity: ${formatUsd(m.liquidity)}`);
  console.log(`    volume:    ${formatUsd(m.volume)}`);
  console.log(`    resolves:  ${m.endDate.slice(0, 10)} (${daysUntil(m.endDate)}d)`);
  console.log(`    tags:      ${m.tags.join(", ")}`);
}

async function main(): Promise<void> {
  const minLiquidityUsd = Number(process.env.MIN_LIQUIDITY_USD ?? 50_000);
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
      .sort((a, b) => b.liquidity - a.liquidity)
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
