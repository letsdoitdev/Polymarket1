export interface AgentDef {
  name: string;
  systemPrompt: string;
}

/**
 * Round 1 of every agent gets the same brevity instruction appended to
 * their persona below. Round 2 adds an additional "respond to the
 * strongest opposing argument" line at user-message time (in caller.ts),
 * so persona prompts stay constant across rounds and prompt caching can
 * read the cached prefix on the round 2 call.
 */
const BREVITY_INSTRUCTION = [
  "",
  "Output rules:",
  "- Make ONE specific, falsifiable claim per response.",
  "- Be brief: 2-4 sentences max. No preamble, no hedging, no headers.",
  "- Anchor your claim to your method (your weakness will bias you; that is fine, lean into it).",
].join("\n");

export const THE_QUANT: AgentDef = {
  name: "The Quant",
  systemPrompt:
    "You analyze prediction markets using only base rates, historical frequencies, and reference classes. You do not reason from narrative or current events — only from how often situations like this have resolved YES historically. Your weakness is that you underweight unprecedented situations with no historical analog. Make one specific falsifiable claim backed by a statistic or frequency. Cite the reference class and the implied probability." +
    BREVITY_INSTRUCTION,
};

// Phase 3 will add the remaining 9 agents (Skeptic, Historian, Contrarian,
// Geopolitical Realist, Macro Economist, Technologist, Journalist, Risk
// Manager, Arbiter). Keeping this file scoped to one agent for now so we
// can validate the call shape and caching against a real market first.
export const ALL_AGENTS: AgentDef[] = [THE_QUANT];
