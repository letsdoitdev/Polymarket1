import { Market, RawGammaMarket, ScoreResult } from "./types";

const ALLOWED_TAGS = new Set([
  "politics",
  "economics",
  "economy",
  "technology",
  "tech",
  "science",
  "business",
  "crypto",
  "climate",
  "regulation",
  "geopolitics",
  "world",
  "us-politics",
  "elections",
  "election",
  "policy",
  "finance",
  "ai",
]);

// Hard blocklist applied to the question text before any other check.
const CRYPTO_QUESTION_BLOCKLIST = [
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "crypto",
  "solana",
  "doge",
  "xrp",
  "token",
  "blockchain",
  "nft",
  "defi",
  "altcoin",
  "binance",
  "coinbase",
];

// Secondary safety net: if no Gamma tags map to ALLOWED_TAGS, scan the
// question text for any of these keywords and treat it as on-topic.
const QUESTION_KEYWORD_FALLBACK = [
  "russia",
  "ukraine",
  "china",
  "taiwan",
  "fed",
  "inflation",
  "election",
  "regulation",
  "trade",
  "tariff",
  "gdp",
  "president",
  "congress",
  "senate",
  "war",
  "sanction",
  "policy",
  "rate",
  "recession",
  "bank",
  "oil",
  "energy",
  "dollar",
  "debt",
  "deficit",
  "treaty",
  "nato",
  "agreement",
  "deal",
  "vote",
  "referendum",
  "court",
  "ruling",
  "law",
  "bill",
  "hack",
  "breach",
  "launch",
  "ipo",
  "merger",
  "acquisition",
  "bankruptcy",
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function parseJsonField<T>(value: unknown): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pushTag(out: Set<string>, t: { label?: string; slug?: string } | string | undefined): void {
  if (!t) return;
  if (typeof t === "string") {
    out.add(t.toLowerCase());
    return;
  }
  if (t.slug) out.add(t.slug.toLowerCase());
  if (t.label) out.add(t.label.toLowerCase());
}

function extractTags(raw: RawGammaMarket): string[] {
  const out = new Set<string>();
  raw.tags?.forEach((t) => pushTag(out, t));
  raw.categories?.forEach((c) => pushTag(out, c));
  if (raw.category) out.add(String(raw.category).toLowerCase());
  raw.events?.forEach((e) => {
    e.tags?.forEach((t) => pushTag(out, t));
    if (e.category) out.add(String(e.category).toLowerCase());
  });
  return Array.from(out);
}

function isBinaryYesNo(raw: RawGammaMarket): boolean {
  const outcomes = parseJsonField<string[]>(raw.outcomes);
  if (!Array.isArray(outcomes) || outcomes.length !== 2) return false;
  const lowered = outcomes.map((o) => String(o).trim().toLowerCase()).sort();
  return lowered[0] === "no" && lowered[1] === "yes";
}

function getYesProbability(raw: RawGammaMarket): number | null {
  const outcomes = parseJsonField<string[]>(raw.outcomes);
  const prices = parseJsonField<string[]>(raw.outcomePrices);
  if (!Array.isArray(outcomes) || !Array.isArray(prices)) return null;
  if (outcomes.length !== prices.length) return null;
  const yesIdx = outcomes.findIndex(
    (o) => String(o).trim().toLowerCase() === "yes"
  );
  if (yesIdx === -1) return null;
  const p = Number(prices[yesIdx]);
  if (!Number.isFinite(p)) return null;
  return p;
}

function questionContainsAny(question: string, words: string[]): string | null {
  const q = question.toLowerCase();
  for (const w of words) {
    // Word-ish boundary: avoid matching "btc" inside "abtchain" by requiring
    // a non-letter on both sides. Cheap regex; fine at 100 markets.
    const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i");
    if (re.test(q)) return w;
  }
  return null;
}

export interface ScoreContext {
  minLiquidityUsd: number;
  now?: Date;
}

export function scoreMarket(
  raw: RawGammaMarket,
  ctx: ScoreContext
): { result: ScoreResult; market: Market | null } {
  const reasons: string[] = [];
  const now = ctx.now ?? new Date();
  const question = raw.question ?? "";

  // Always-on hard exclusions first.
  if (raw.closed === true || raw.archived === true || raw.active === false) {
    reasons.push("market is not active");
    return { result: { passed: false, reasons }, market: null };
  }

  const cryptoHit = questionContainsAny(question, CRYPTO_QUESTION_BLOCKLIST);
  if (cryptoHit) {
    reasons.push(`question contains blocklisted crypto keyword "${cryptoHit}"`);
    return { result: { passed: false, reasons }, market: null };
  }

  if (!isBinaryYesNo(raw)) {
    reasons.push("not a binary YES/NO market");
  }

  const yesProb = getYesProbability(raw);
  if (yesProb === null) {
    reasons.push("could not parse YES probability");
  } else if (yesProb >= 0.45 && yesProb <= 0.55) {
    reasons.push(
      `YES probability ${(yesProb * 100).toFixed(1)}% is inside 45-55% no-lean band`
    );
  }

  const liquidity = toNumber(raw.liquidityNum ?? raw.liquidity);
  if (liquidity < ctx.minLiquidityUsd) {
    reasons.push(
      `liquidity $${liquidity.toLocaleString()} below minimum $${ctx.minLiquidityUsd.toLocaleString()}`
    );
  }

  const endDateStr = raw.endDate ?? raw.endDateIso;
  const endDate = endDateStr ? new Date(endDateStr) : null;
  let resolvesInDays = -1;
  if (!endDate || Number.isNaN(endDate.getTime())) {
    reasons.push("missing or invalid endDate");
  } else {
    const delta = endDate.getTime() - now.getTime();
    resolvesInDays = Math.round(delta / (24 * 60 * 60 * 1000));
    if (delta <= 0) {
      reasons.push("endDate is in the past");
    } else if (delta > SEVEN_DAYS_MS) {
      reasons.push(`resolves in ${resolvesInDays} days, > 7`);
    }
  }

  const gammaTags = extractTags(raw);
  let tags = gammaTags;
  let tagSource: "gamma" | "keyword-fallback" | "none" =
    gammaTags.length > 0 ? "gamma" : "none";
  let hasAllowedTag = gammaTags.some((t) => ALLOWED_TAGS.has(t));

  if (!hasAllowedTag) {
    const kw = questionContainsAny(question, QUESTION_KEYWORD_FALLBACK);
    if (kw) {
      tags = Array.from(new Set([...gammaTags, `kw:${kw}`]));
      tagSource = "keyword-fallback";
      hasAllowedTag = true;
    }
  }

  if (!hasAllowedTag) {
    reasons.push(
      `no allowed tag and no keyword fallback hit (gamma tags: ${
        gammaTags.length ? gammaTags.join(", ") : "none"
      })`
    );
  }

  if (reasons.length > 0) {
    return { result: { passed: false, reasons }, market: null };
  }

  const market: Market = {
    id: String(raw.id),
    question,
    description: raw.description ?? "",
    currentYesProbability: yesProb!,
    volume: toNumber(raw.volumeNum ?? raw.volume),
    liquidity,
    endDate: endDate!.toISOString(),
    resolvesInDays,
    tags,
    topPositions: [],
  };

  // tagSource is informational; surfaced through tags array via the kw: prefix.
  void tagSource;

  return { result: { passed: true, reasons: [] }, market };
}

export function filterMarkets(
  raws: RawGammaMarket[],
  ctx: ScoreContext
): { passing: Market[]; rejected: Array<{ id: string; question: string; reasons: string[] }> } {
  const passing: Market[] = [];
  const rejected: Array<{ id: string; question: string; reasons: string[] }> = [];

  for (const raw of raws) {
    const { result, market } = scoreMarket(raw, ctx);
    if (result.passed && market) {
      passing.push(market);
    } else {
      rejected.push({
        id: String(raw.id),
        question: raw.question ?? "(no question)",
        reasons: result.reasons,
      });
    }
  }

  return { passing, rejected };
}
