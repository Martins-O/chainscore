export interface WalletHistory {
  id: string;
  firstTxTimestamp: bigint;
  txCount: number;
  loanCount: number;
  repaymentCount: number;
  defaultCount: number;
  tokenBalances: TokenBalance[];
  dailyTxCounts: DailyCount[];
  transferCountBetweenLinked: number;
  totalTransfers: number;
}

export interface TokenBalance {
  token: string;
  balance: bigint;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface ScoreFactors {
  repaymentScore: number;
  stabilityScore: number;
  walletAgeScore: number;
  consistencyScore: number;
  diversScore: number;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactors;
  antiGamingFlags: string[];
}
