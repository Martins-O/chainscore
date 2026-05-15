import { describe, it, expect } from "vitest";
import { compute } from "../src/ScoreComputer.js";
import type { WalletHistory } from "../src/types.js";

const DAY = 86400;
const YEAR = 365 * DAY;
const NOW = BigInt(1800000000); // ~Jan 2027

function makeHistory(overrides: Partial<WalletHistory>): WalletHistory {
  return {
    id: "test",
    firstTxTimestamp: NOW - BigInt(YEAR),
    txCount: 100,
    loanCount: 10,
    repaymentCount: 10,
    defaultCount: 0,
    tokenBalances: [
      { token: "USDC", balance: 1000n },
      { token: "TSLA", balance: 10n },
      { token: "ETH", balance: 5n },
    ],
    dailyTxCounts: Array.from({ length: 365 }, () => ({ date: "", count: 3 })),
    transferCountBetweenLinked: 0,
    totalTransfers: 100,
    ...overrides,
  };
}

describe("ScoreComputer", () => {
  it("perfect wallet scores ~850", () => {
    const r = compute(makeHistory({}), NOW);
    expect(r.score).toBe(850);
    expect(r.factors.repaymentScore).toBe(100);
    expect(r.factors.stabilityScore).toBe(100);
    expect(r.factors.walletAgeScore).toBe(100);
    expect(r.factors.consistencyScore).toBe(100);
    expect(r.factors.diversScore).toBe(100);
    expect(r.antiGamingFlags).toEqual([]);
  });

  it("brand new wallet (<7 days) returns 350 with WALLET_TOO_NEW flag", () => {
    const r = compute(
      makeHistory({ firstTxTimestamp: NOW - BigInt(3 * DAY) }),
      NOW
    );
    expect(r.score).toBe(350);
    expect(r.antiGamingFlags).toContain("WALLET_TOO_NEW");
  });

  it("one default on 5 loans penalizes repaymentScore", () => {
    const r = compute(
      makeHistory({ loanCount: 5, repaymentCount: 4, defaultCount: 1 }),
      NOW
    );
    expect(r.factors.repaymentScore).toBe(60);
  });

  it("single token holder gets diversScore=20", () => {
    const r = compute(
      makeHistory({
        tokenBalances: [{ token: "USDC", balance: 1000n }],
      }),
      NOW
    );
    expect(r.factors.diversScore).toBe(20);
  });

  it("three+ tokens held gets diversScore=100", () => {
    const r = compute(
      makeHistory({
        tokenBalances: [
          { token: "USDC", balance: 1000n },
          { token: "TSLA", balance: 10n },
          { token: "ETH", balance: 5n },
          { token: "BTC", balance: 1n },
        ],
      }),
      NOW
    );
    expect(r.factors.diversScore).toBe(100);
  });

  it("wash trading (>60% linked) zeros stabilityScore and sets flag", () => {
    const r = compute(
      makeHistory({ transferCountBetweenLinked: 70, totalTransfers: 100 }),
      NOW
    );
    expect(r.factors.stabilityScore).toBe(0);
    expect(r.antiGamingFlags).toContain("WASH_TRADING_DETECTED");
  });

  it("high frequency (>50 txs/day for 3+ days) halves consistencyScore", () => {
    const dailyTxCounts = [
      ...Array.from({ length: 100 }, () => ({ date: "", count: 5 })),
      ...Array.from({ length: 5 }, () => ({ date: "", count: 55 })),
    ];
    const r = compute(
      makeHistory({ dailyTxCounts }),
      NOW
    );
    const expectedBase = (() => {
      const activeDays = dailyTxCounts.filter((d) => d.count > 0).length;
      const ratio = activeDays / dailyTxCounts.length;
      return ratio > 0.6 ? 100 : ratio > 0.3 ? 60 : 20;
    })();
    expect(r.factors.consistencyScore).toBe(Math.round(expectedBase * 0.5));
    expect(r.antiGamingFlags).toContain("HIGH_FREQUENCY_DETECTED");
  });

  it("dormant wallet (1 tx/month) gets low consistency score", () => {
    const dailyTxCounts = Array.from({ length: 365 }, (_, i) => ({
      date: `day-${i}`,
      count: i % 30 === 0 ? 1 : 0,
    }));
    const r = compute(
      makeHistory({ dailyTxCounts, txCount: 12 }),
      NOW
    );
    expect(r.factors.consistencyScore).toBe(20);
  });

  it("score always clamped to [300, 850] for 100 random inputs", () => {
    for (let i = 0; i < 100; i++) {
      const randomOld = NOW - BigInt(Math.floor(Math.random() * 3 * YEAR));
      const loanCount = Math.floor(Math.random() * 20);
      const history: WalletHistory = {
        id: `fuzz-${i}`,
        firstTxTimestamp: randomOld,
        txCount: Math.floor(Math.random() * 10000),
        loanCount,
        repaymentCount: Math.floor(Math.random() * (loanCount + 1)),
        defaultCount: Math.floor(Math.random() * 5),
        tokenBalances: Array.from(
          { length: Math.floor(Math.random() * 5) + 1 },
          (_, j) => ({
            token: `T${j}`,
            balance: BigInt(Math.floor(Math.random() * 1000)),
          })
        ),
        dailyTxCounts: Array.from(
          { length: Math.floor(Math.random() * 100) + 1 },
          () => ({ date: "", count: Math.floor(Math.random() * 100) })
        ),
        transferCountBetweenLinked: Math.floor(Math.random() * 100),
        totalTransfers: Math.floor(Math.random() * 100) + 1,
      };
      const r = compute(history, NOW);
      expect(r.score).toBeGreaterThanOrEqual(300);
      expect(r.score).toBeLessThanOrEqual(850);
    }
  });
});
