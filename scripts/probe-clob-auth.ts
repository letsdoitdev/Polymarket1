/**
 * Standalone diagnostic for the Polymarket CLOB auth flow.
 * Run locally with:  npx ts-node scripts/probe-clob-auth.ts
 *
 * Steps:
 *   1. List the keys present in ./.env (values shown only as set/empty).
 *   2. Hit /trades with five different auth header variations.
 *   3. GET /auth/api-key with no headers (the endpoint that explains
 *      how to get a CLOB key).
 *   4. GET /tick-sizes with no auth as a sanity check that we can
 *      reach the CLOB host at all.
 *
 * Each attempt prints URL, request header keys, HTTP status, and the
 * first 800 bytes of the response body.
 */
import "dotenv/config";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const CONDITION_ID =
  "0x48fbf70c1713e71a405052bc4641e26dbba435fa557672c4040763c901cbf606";

const TRADES_URL = `https://clob.polymarket.com/trades?market=${CONDITION_ID}&limit=5`;
const AUTH_URL = "https://clob.polymarket.com/auth/api-key";
const TICK_URL = "https://clob.polymarket.com/tick-sizes";

const BODY_LIMIT = 800;

function listEnvKeys(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  console.log(`\n=== .env keys at ${envPath} ===`);
  if (!fs.existsSync(envPath)) {
    console.log("(.env file not found)");
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  let printed = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1).trim();
    const value = valueRaw.replace(/^["']|["']$/g, "").trim();
    console.log(`  ${key} = ${value ? "(set)" : "(empty)"}`);
    printed++;
  }
  if (printed === 0) console.log("(no keys found)");
}

interface ProbeAttempt {
  label: string;
  url: string;
  headers: Record<string, string>;
}

interface ProbeOutcome {
  label: string;
  status: number | "ERR";
  errorMessage?: string;
}

function maskHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase();
  const sensitive =
    lower.includes("auth") ||
    lower.includes("key") ||
    lower.includes("token") ||
    lower.includes("secret");
  if (!sensitive || !value) return value;
  if (value.length <= 6) return "*".repeat(value.length);
  return value.slice(0, 3) + "*".repeat(value.length - 6) + value.slice(-3);
}

async function runAttempt(a: ProbeAttempt): Promise<ProbeOutcome> {
  console.log(`\n--- ${a.label} ---`);
  console.log(`URL:     ${a.url}`);
  const headerEntries = Object.entries(a.headers);
  if (headerEntries.length === 0) {
    console.log("Headers: (none)");
  } else {
    for (const [k, v] of headerEntries) {
      console.log(`Headers: ${k}: ${maskHeaderValue(k, v)}`);
    }
  }
  try {
    const res = await axios.get(a.url, {
      headers: a.headers,
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
    return { label: a.label, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Status:  ERR");
    console.log(`Error:   ${msg}`);
    return { label: a.label, status: "ERR", errorMessage: msg };
  }
}

async function main(): Promise<void> {
  listEnvKeys();

  const apiKey = process.env.POLYMARKET_API_KEY ?? "";
  if (!apiKey) {
    console.log(
      "\n[note] POLYMARKET_API_KEY is not set; auth variants will send the empty string in the header value."
    );
  }

  const attempts: ProbeAttempt[] = [
    { label: "trades / no auth header", url: TRADES_URL, headers: {} },
    {
      label: "trades / Authorization: Bearer <key>",
      url: TRADES_URL,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
    {
      label: "trades / Authorization: <key>",
      url: TRADES_URL,
      headers: { Authorization: apiKey },
    },
    {
      label: "trades / POLY-API-KEY: <key>",
      url: TRADES_URL,
      headers: { "POLY-API-KEY": apiKey },
    },
    {
      label: "trades / apiKey: <key>",
      url: TRADES_URL,
      headers: { apiKey: apiKey },
    },
    { label: "auth/api-key (GET, no headers)", url: AUTH_URL, headers: {} },
    { label: "tick-sizes (no auth, sanity check)", url: TICK_URL, headers: {} },
  ];

  const outcomes: ProbeOutcome[] = [];
  for (const a of attempts) {
    outcomes.push(await runAttempt(a));
  }

  console.log("\n=== summary ===");
  for (const o of outcomes) {
    const tail = o.errorMessage ? `  (${o.errorMessage})` : "";
    console.log(`  ${String(o.status).padStart(3)}  ${o.label}${tail}`);
  }
  const anyOk = outcomes.some(
    (o) => typeof o.status === "number" && o.status >= 200 && o.status < 300
  );
  if (!anyOk) {
    console.log(
      "\nNo attempt returned 2xx. Inspect the bodies above for hints (often the error JSON tells you the expected header)."
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
