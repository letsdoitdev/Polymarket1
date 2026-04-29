/**
 * Shapes returned by the public data-api.polymarket.com endpoints
 * `/holders` and `/trades`. Verified against a live response on
 * conditionId 0x48fbf...c606 ("Will Trump visit China by April 30?").
 *
 * outcomeIndex follows the Gamma market's `outcomes` array order, which
 * for binary YES/NO markets is ["Yes", "No"] -- so 0 == YES, 1 == NO.
 */

export interface RawHolder {
  proxyWallet: string;
  asset: string;
  pseudonym?: string;
  name?: string;
  amount: number;
  outcomeIndex: number;
  bio?: string;
  verified?: boolean;
  displayUsernamePublic?: boolean;
  profileImage?: string;
  profileImageOptimized?: string;
}

export interface RawHoldersResponse {
  token: string;
  holders: RawHolder[];
}

export interface RawTrade {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  outcome: string;
  outcomeIndex: number;
  pseudonym?: string;
  name?: string;
  transactionHash?: string;
  title?: string;
  slug?: string;
  eventSlug?: string;
}

export interface SmartMoneyHolder {
  address: string;
  pseudonym: string;
  side: "YES" | "NO";
  size: number;
}

export interface SmartMoneySignal {
  topYesHolders: SmartMoneyHolder[];
  topNoHolders: SmartMoneyHolder[];
  yesWalletCount: number;
  noWalletCount: number;
  yesTotal: number;
  noTotal: number;
  netLean: "YES" | "NO" | "NEUTRAL";
  recentTradeCount: number;
  recentBuyDirection: "YES" | "NO" | "MIXED";
  recentYesBuyCount: number;
  recentNoBuyCount: number;
  // Pre-rendered text block intended to be dropped into agent context.
  asText: string;
}
