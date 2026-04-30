import Anthropic from "@anthropic-ai/sdk";
import { Market } from "../markets/types";

// User-specified model. NOTE: claude-sonnet-4-20250514 is a legacy ID
// (Sonnet 4, May 2024) and is deprecated -- retires June 15, 2026. The
// current recommended Sonnet is claude-sonnet-4-6. Leaving as-specified.
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 600;

export interface AgentMessage {
  agent: string;
  content: string;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * The shared context block injected into every agent's user message.
 * Identical bytes across every agent in a debate AND across both rounds
 * for a given agent, so it sits at the front of the user message with a
 * cache_control breakpoint -- round 2 reads the cache written in round 1.
 */
function buildSharedContext(market: Market, smartMoneyText: string): string {
  const yesPct = (market.currentYesProbability * 100).toFixed(1);
  const liqStr = `$${Math.round(market.liquidity).toLocaleString()}`;
  const desc = market.description?.trim() || "(no description provided)";
  return [
    `MARKET: ${market.question}`,
    `CURRENT YES ODDS: ${yesPct}%`,
    `LIQUIDITY: ${liqStr}`,
    `RESOLVES: ${market.endDate.slice(0, 10)} (${market.resolvesInDays} day${market.resolvesInDays === 1 ? "" : "s"} from now)`,
    `DESCRIPTION: ${desc}`,
    "",
    "SMART MONEY SIGNAL:",
    smartMoneyText,
  ].join("\n");
}

function formatPriorArguments(prior: AgentMessage[]): string {
  if (prior.length === 0) return "(no prior arguments yet — you are speaking first)";
  return prior.map((m) => `[${m.agent}]\n${m.content.trim()}`).join("\n\n");
}

/**
 * Call one agent and return its argument as a plain string.
 *
 * Caching: cache_control breakpoints sit on (1) the agent's system prompt
 * and (2) the shared market context user block. Within one debate, an
 * agent is called twice (round 1, round 2) with identical system + shared
 * context bytes; round 2 reads from cache. The variable suffix (prior
 * arguments, round instruction) sits in a separate user-content block
 * with no cache_control so it doesn't invalidate the cached prefix.
 */
export async function callAgent(
  agentName: string,
  systemPrompt: string,
  market: Market,
  smartMoneySignalText: string,
  priorMessages: AgentMessage[],
  isRound2: boolean
): Promise<string> {
  const sharedContext = buildSharedContext(market, smartMoneySignalText);
  const priorArgs = formatPriorArguments(priorMessages);

  const roundLine = isRound2
    ? "ROUND 2 — read the prior arguments, identify the strongest case AGAINST your position, and respond to it. Sharpen, narrow, or revise your claim accordingly."
    : "ROUND 1 — make your opening argument.";

  const variableSuffix = [
    "",
    "PRIOR ARGUMENTS IN THIS DEBATE:",
    priorArgs,
    "",
    roundLine,
    "",
    `You are ${agentName}. Output your argument now.`,
  ].join("\n");

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: sharedContext,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: variableSuffix,
          },
        ],
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Surface usage counters from the most recent call for the test harness. */
export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export async function callAgentWithUsage(
  agentName: string,
  systemPrompt: string,
  market: Market,
  smartMoneySignalText: string,
  priorMessages: AgentMessage[],
  isRound2: boolean
): Promise<{ text: string; usage: CallUsage }> {
  const sharedContext = buildSharedContext(market, smartMoneySignalText);
  const priorArgs = formatPriorArguments(priorMessages);
  const roundLine = isRound2
    ? "ROUND 2 — read the prior arguments, identify the strongest case AGAINST your position, and respond to it. Sharpen, narrow, or revise your claim accordingly."
    : "ROUND 1 — make your opening argument.";
  const variableSuffix = [
    "",
    "PRIOR ARGUMENTS IN THIS DEBATE:",
    priorArgs,
    "",
    roundLine,
    "",
    `You are ${agentName}. Output your argument now.`,
  ].join("\n");

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: sharedContext, cache_control: { type: "ephemeral" } },
          { type: "text", text: variableSuffix },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
