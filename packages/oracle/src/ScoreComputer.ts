import { WalletHistory, ScoreResult } from "./types.js";

const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;
const MIN_SCORE = 300;
const MAX_SCORE = 850;
const BASE_SCORE = 300;
const MAX_FACTOR_SCORE = 100;

const WEIGHTS = {
  repayment: 0.35,
  stability: 0.25,
  walletAge: 0.15,
  consistency: 0.15,
  diversification: 0.10,
} as const;

const SCALE_FACTOR = 5.5;

function computeRepaymentScore(history: WalletHistory): number {
  const loanCount = Math.max(history.loanCount, 1);
  const base = (history.repaymentCount / loanCount) * MAX_FACTOR_SCORE;
  const penalty = history.defaultCount * 20;
  return Math.max(0, base - penalty);
}

function computeStabilityScore(history: WalletHistory): number {
  const counts = history.dailyTxCounts.map((d) => d.count);
  if (counts.length === 0) return 0;

  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  if (mean === 0) return 0;

  const variance =
    counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  if (cv < 0.3) return 100;
  if (cv <= 0.7) return 60;
  return 20;
}

function computeWalletAgeScore(
  firstTxTimestamp: bigint,
  currentTimestamp: bigint
): number {
  const diffSeconds = Number(currentTimestamp - firstTxTimestamp);
  const daysSinceFirstTx = Math.max(0, diffSeconds / SECONDS_PER_DAY);
  const score = (daysSinceFirstTx / DAYS_PER_YEAR) * MAX_FACTOR_SCORE;
  return Math.min(MAX_FACTOR_SCORE, Math.round(score));
}

function computeConsistencyScore(history: WalletHistory): number {
  if (history.dailyTxCounts.length === 0) return 0;

  const activeDays = history.dailyTxCounts.filter((d) => d.count > 0).length;
  const totalDays = history.dailyTxCounts.length;
  const ratio = activeDays / totalDays;

  if (ratio > 0.6) return 100;
  if (ratio > 0.3) return 60;
  return 20;
}

function computeDiversScore(history: WalletHistory): number {
  const heldTokens = history.tokenBalances.filter((tb) => tb.balance > 0n).length;
  if (heldTokens >= 3) return 100;
  if (heldTokens === 2) return 50;
  if (heldTokens === 1) return 20;
  return 0;
}

function detectWashTrading(history: WalletHistory): boolean {
  if (history.totalTransfers === 0) return false;
  return history.transferCountBetweenLinked / history.totalTransfers > 0.6;
}

function detectHighFrequency(history: WalletHistory): boolean {
  const counts = history.dailyTxCounts.map((d) => d.count);
  let consecutiveStreak = 0;
  for (const c of counts) {
    if (c > 50) {
      consecutiveStreak++;
      if (consecutiveStreak >= 3) return true;
    } else {
      consecutiveStreak = 0;
    }
  }
  return false;
}

export function compute(
  history: WalletHistory,
  currentTimestamp?: bigint
): ScoreResult {
  const now =
    currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const antiGamingFlags: string[] = [];

  const diffSeconds = Number(now - history.firstTxTimestamp);
  const walletAgeDays = diffSeconds / SECONDS_PER_DAY;

  if (walletAgeDays < 7) {
    return {
      score: 350,
      factors: {
        repaymentScore: 0,
        stabilityScore: 0,
        walletAgeScore: 0,
        consistencyScore: 0,
        diversScore: 0,
      },
      antiGamingFlags: ["WALLET_TOO_NEW"],
    };
  }

  let stabilityScore = computeStabilityScore(history);
  let consistencyScore = computeConsistencyScore(history);

  if (detectWashTrading(history)) {
    stabilityScore = 0;
    antiGamingFlags.push("WASH_TRADING_DETECTED");
  }

  if (detectHighFrequency(history)) {
    consistencyScore = Math.round(consistencyScore * 0.5);
    antiGamingFlags.push("HIGH_FREQUENCY_DETECTED");
  }

  const repaymentScore = computeRepaymentScore(history);
  const walletAgeScore = computeWalletAgeScore(
    history.firstTxTimestamp,
    now
  );
  const diversScore = computeDiversScore(history);

  const factors = {
    repaymentScore,
    stabilityScore,
    walletAgeScore,
    consistencyScore,
    diversScore,
  };

  const weightedSum =
    factors.repaymentScore * WEIGHTS.repayment +
    factors.stabilityScore * WEIGHTS.stability +
    factors.walletAgeScore * WEIGHTS.walletAge +
    factors.consistencyScore * WEIGHTS.consistency +
    factors.diversScore * WEIGHTS.diversification;

  const rawScore = BASE_SCORE + weightedSum * SCALE_FACTOR;
  const score = Math.round(Math.max(MIN_SCORE, Math.min(MAX_SCORE, rawScore)));

  return { score, factors, antiGamingFlags };
}
