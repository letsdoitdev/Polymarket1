import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { THE_QUANT } from "./agents/prompts";
import { callAgentWithUsage } from "./agents/caller";
import { fetchMarkets } from "./markets/client";
import { filterMarkets } from "./markets/filter";
import { Market, WalletPosition } from "./markets/types";
import { fetchHolders, fetchTrades } from "./wallets/client";
import { buildSmartMoneySignal } from "./wallets/signal";

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

async function attachSmartMoney(passing: Market[]): Promise<void> {
  if (passing.length === 0) return;

  console.log(`\n=== Fetching smart money for ${passing.length} markets ===`);
  await Promise.all(
    passing.map(async (m) => {
      if (!m.conditionId) {
        console.warn(`[warn] ${m.id}: no conditionId; skipping smart money`);
        return;
      }
      try {
        const [holdersRaw, tradesRaw] = await Promise.all([
          fetchHolders(m.conditionId, 20),
          fetchTrades(m.conditionId, 20),
        ]);
        const signal = buildSmartMoneySignal(holdersRaw, tradesRaw);
        m.smartMoneySignal = signal;
        const positions: WalletPosition[] = [
          ...signal.topYesHolders,
          ...signal.topNoHolders,
        ].map((h) => ({
          address: h.address,
          pseudonym: h.pseudonym || undefined,
          size: h.size,
          side: h.side,
        }));
        m.topPositions = positions;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[warn] smart money fetch failed for ${m.id}: ${msg}`);
      }
    })
  );
}

function printSmartMoney(passing: Market[]): void {
  const withSignal = passing.filter((m) => m.smartMoneySignal);
  if (withSignal.length === 0) return;

  console.log(`\n=== Smart money signals ===`);
  for (const m of withSignal) {
    console.log(`\n--- ${m.question} ---`);
    console.log(m.smartMoneySignal!.asText);
  }
}

async function runQuantOnFirstMarket(passing: Market[]): Promise<void> {
  if (passing.length === 0) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "\n[warn] ANTHROPIC_API_KEY not set; skipping agent test call."
    );
    return;
  }

  const target = passing[0];
  const smartMoneyText =
    target.smartMoneySignal?.asText ?? "(smart money signal unavailable)";

  console.log(`\n=== ${THE_QUANT.name} (test call on first passing market) ===`);
  console.log(`Market: ${target.question}`);

  try {
    const { text, usage } = await callAgentWithUsage(
      THE_QUANT.name,
      THE_QUANT.systemPrompt,
      target,
      smartMoneyText,
      [],
      false
    );
    console.log(`\n[${THE_QUANT.name}]\n${text}\n`);
    console.log(
      `tokens: in=${usage.inputTokens}, out=${usage.outputTokens}, ` +
        `cache_write=${usage.cacheCreationInputTokens}, cache_read=${usage.cacheReadInputTokens}`
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(
        `[error] Anthropic API ${err.status}: ${err.message}`
      );
    } else {
      console.error(
        "[error] Agent call failed:",
        err instanceof Error ? err.message : err
      );
    }
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
    passing.sort((a, b) => a.resolvesInDays - b.resolvesInDays);
    passing.forEach((m, i) => printMarket(m, i));
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

  await attachSmartMoney(passing);
  printSmartMoney(passing);
  await runQuantOnFirstMarket(passing);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
