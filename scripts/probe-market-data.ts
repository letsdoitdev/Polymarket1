/**
 * Standalone diagnostic for finding a public per-market holders/trades
 * data-api endpoint.
 * Run locally with:  npm run probe:market-data
 *
 * Background: data-api /positions and /activity both require ?user=<wallet>,
 * so they cannot enumerate traders for a given market. CLOB /trades
 * requires HMAC L2 auth and only returns *your* trades. The Polymarket
 * frontend's "Top Holders" and "Trades" tabs must come from somewhere
 * public; this script tries the most likely candidates and prints the
 * URL, HTTP status, and first 800 bytes of each response body so we
 * can see which one (if any) returns market-wide trader data.
 *
 * No auth header is sent on any attempt -- if everything 401s we know
 * the public answer is "no public route" and we'll pivot.
 */
import "dotenv/config";
import axios from "axios";

const CONDITION_ID =
  "0x48fbf70c1713e71a405052bc4641e26dbba435fa557672c4040763c901cbf606";

const BODY_LIMIT = 800;

const CANDIDATES: ReadonlyArray<{ label: string; url: string }> = [
  // data-api with ?market=<conditionId>
  {
    label: "data-api /holders ?market= (limit=20)",
    url: `https://data-api.polymarket.com/holders?market=${CONDITION_ID}&limit=20`,
  },
  {
    label: "data-api /holders ?market= (no limit)",
    url: `https://data-api.polymarket.com/holders?market=${CONDITION_ID}`,
  },
  {
    label: "data-api /trades ?market= (limit=20)",
    url: `https://data-api.polymarket.com/trades?market=${CONDITION_ID}&limit=20`,
  },
  {
    label: "data-api /trades ?market= (no limit)",
    url: `https://data-api.polymarket.com/trades?market=${CONDITION_ID}`,
  },

  // path-style under /markets/<id>
  {
    label: "data-api /markets/<id>/holders",
    url: `https://data-api.polymarket.com/markets/${CONDITION_ID}/holders?limit=20`,
  },
  {
    label: "data-api /markets/<id>/trades",
    url: `https://data-api.polymarket.com/markets/${CONDITION_ID}/trades?limit=20`,
  },

  // singular variant (some Polymarket APIs use /market/<id>)
  {
    label: "data-api /market/<id>/holders",
    url: `https://data-api.polymarket.com/market/${CONDITION_ID}/holders?limit=20`,
  },
  {
    label: "data-api /market/<id>/trades",
    url: `https://data-api.polymarket.com/market/${CONDITION_ID}/trades?limit=20`,
  },

  // gamma-api long shots
  {
    label: "gamma-api /holders ?market= (limit=20)",
    url: `https://gamma-api.polymarket.com/holders?market=${CONDITION_ID}&limit=20`,
  },
  {
    label: "gamma-api /trades ?market= (limit=20)",
    url: `https://gamma-api.polymarket.com/trades?market=${CONDITION_ID}&limit=20`,
  },
];

interface ProbeOutcome {
  label: string;
  url: string;
  status: number | "ERR";
  errorMessage?: string;
}

async function runAttempt(label: string, url: string): Promise<ProbeOutcome> {
  console.log(`\n--- ${label} ---`);
  console.log(`URL:     ${url}`);
  try {
    const res = await axios.get(url, {
      headers: { Accept: "application/json" },
      timeout: 15_000,
      validateStatus: () => true,
      transformResponse: [(data: unknown) => data],
    });
    const body =
      typeof res.data === "string"
        ? res.data
        : res.data === undefined || res.data === null
        ? ""
        : JSON.stringify(res.data);
    console.log(`Status:  ${res.status}`);
    if (body) {
      const snippet =
        body.length > BODY_LIMIT
          ? `${body.slice(0, BODY_LIMIT)}...[truncated, ${body.length} bytes total]`
          : body;
      console.log(`Body:    ${snippet}`);
    } else {
      console.log("Body:    (empty)");
    }
    return { label, url, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Status:  ERR");
    console.log(`Error:   ${msg}`);
    return { label, url, status: "ERR", errorMessage: msg };
  }
}

async function main(): Promise<void> {
  console.log(`Probing public per-market data-api routes for conditionId:`);
  console.log(`  ${CONDITION_ID}`);
  console.log(`(no auth headers sent on any attempt)`);

  const outcomes: ProbeOutcome[] = [];
  for (const c of CANDIDATES) {
    outcomes.push(await runAttempt(c.label, c.url));
  }

  console.log("\n=== summary ===");
  for (const o of outcomes) {
    const tail = o.errorMessage ? `  (${o.errorMessage})` : "";
    console.log(`  ${String(o.status).padStart(3)}  ${o.label}${tail}`);
  }

  const winners = outcomes.filter(
    (o) => typeof o.status === "number" && o.status >= 200 && o.status < 300
  );
  if (winners.length === 0) {
    console.log(
      "\nNo attempt returned 2xx. The public per-market trader data is likely not exposed under these routes. Time to pivot to Phase 3 without smart money."
    );
  } else {
    console.log(
      `\n${winners.length} attempt(s) returned 2xx -- inspect their bodies above to choose the source of truth.`
    );
    for (const w of winners) console.log(`  ✓  ${w.label}: ${w.url}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
