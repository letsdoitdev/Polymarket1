import { Market, RawGammaMarket, ScoreResult } from "./types";

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

// Gamma does not return usable tag fields, so the question text is the
// only signal we have for topical relevance. A market must contain at
// least one of these to qualify.
const QUESTION_TOPIC_KEYWORDS = [
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
    const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i");
    if (re.test(q)) return w;
  }
  return null;
}

function matchedTopicKeywords(question: string): string[] {
  const q = question.toLowerCase();
  const hits: string[] = [];
  for (const w of QUESTION_TOPIC_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i");
    if (re.test(q)) hits.push(w);
  }
  return hits;
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

  const tags = matchedTopicKeywords(question);
  if (tags.length === 0) {
    reasons.push("no on-topic keyword found in question text");
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
