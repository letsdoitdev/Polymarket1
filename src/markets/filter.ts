import { Market, RawGammaMarket, ScoreResult } from "./types";

const ALLOWED_TAGS = new Set([
  "politics",
  "economics",
  "technology",
  "tech",
  "science",
  "business",
  "crypto",
  "climate",
  "regulation",
  "geopolitics",
]);

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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

function extractTags(raw: RawGammaMarket): string[] {
  const out = new Set<string>();
  const pushTag = (t: { label?: string; slug?: string } | string | undefined) => {
    if (!t) return;
    if (typeof t === "string") {
      out.add(t.toLowerCase());
    } else {
      if (t.slug) out.add(t.slug.toLowerCase());
      if (t.label) out.add(t.label.toLowerCase());
    }
  };
  raw.tags?.forEach(pushTag);
  raw.events?.forEach((e) => e.tags?.forEach(pushTag));
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

function tagsMatchAllowed(tags: string[]): boolean {
  return tags.some((t) => ALLOWED_TAGS.has(t));
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

  if (raw.closed === true || raw.archived === true || raw.active === false) {
    reasons.push("market is not active");
    return { result: { passed: false, reasons }, market: null };
  }

  if (!isBinaryYesNo(raw)) {
    reasons.push("not a binary YES/NO market");
  }

  const yesProb = getYesProbability(raw);
  if (yesProb === null) {
    reasons.push("could not parse YES probability");
  } else if (yesProb >= 0.35 && yesProb <= 0.65) {
    reasons.push(
      `YES probability ${(yesProb * 100).toFixed(1)}% is inside 35-65% no-lean band`
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
  if (!endDate || Number.isNaN(endDate.getTime())) {
    reasons.push("missing or invalid endDate");
  } else {
    const delta = endDate.getTime() - now.getTime();
    if (delta <= 0) {
      reasons.push("endDate is in the past");
    } else if (delta > NINETY_DAYS_MS) {
      reasons.push(
        `resolves in ${Math.round(delta / (24 * 60 * 60 * 1000))} days, > 90`
      );
    }
  }

  const tags = extractTags(raw);
  if (!tagsMatchAllowed(tags)) {
    reasons.push(
      `no allowed tag (have: ${tags.length ? tags.join(", ") : "none"})`
    );
  }

  if (reasons.length > 0) {
    return { result: { passed: false, reasons }, market: null };
  }

  const market: Market = {
    id: String(raw.id),
    question: raw.question ?? "",
    description: raw.description ?? "",
    currentYesProbability: yesProb!,
    volume: toNumber(raw.volumeNum ?? raw.volume),
    liquidity,
    endDate: endDate!.toISOString(),
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
