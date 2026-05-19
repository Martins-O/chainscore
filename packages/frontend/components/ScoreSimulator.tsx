"use client";

import { useState } from "react";

const WEIGHTS = {
  repayment: 0.35,
  stability: 0.25,
  walletAge: 0.15,
  consistency: 0.15,
  diversification: 0.10,
};

function computeProjected(base: BaseFactors, adjustments: Adjustments): number {
  const repaymentScore = Math.min(100, base.repaymentScore + adjustments.moreRepayments * 20);
  const walletAgeScore = Math.min(100, base.walletAgeScore + adjustments.moreDays * 0.5);
  const diversScore = Math.min(100, base.diversScore + adjustments.moreTokens * 25);

  const weightedSum =
    repaymentScore * WEIGHTS.repayment +
    base.stabilityScore * WEIGHTS.stability +
    walletAgeScore * WEIGHTS.walletAge +
    base.consistencyScore * WEIGHTS.consistency +
    diversScore * WEIGHTS.diversification;

  return Math.round(Math.min(850, Math.max(300, 300 + weightedSum * 5.5)));
}

interface BaseFactors {
  repaymentScore: number;
  stabilityScore: number;
  walletAgeScore: number;
  consistencyScore: number;
  diversScore: number;
}

interface Adjustments {
  moreRepayments: number;
  moreDays: number;
  moreTokens: number;
}

interface Props {
  currentScore: number;
  factors?: Record<string, number>;
}

export default function ScoreSimulator({ currentScore, factors }: Props) {
  const [adj, setAdj] = useState<Adjustments>({
    moreRepayments: 0,
    moreDays: 0,
    moreTokens: 0,
  });

  const base: BaseFactors = {
    repaymentScore: factors?.repaymentScore ?? 50,
    stabilityScore: factors?.stabilityScore ?? 50,
    walletAgeScore: factors?.walletAgeScore ?? 50,
    consistencyScore: factors?.consistencyScore ?? 50,
    diversScore: factors?.diversScore ?? 50,
  };

  const projected = computeProjected(base, adj);

  const btn = (key: keyof Adjustments, delta: number) => (
    <button
      onClick={() => setAdj((p) => ({ ...p, [key]: Math.max(0, p[key] + delta) }))}
      className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-xs font-black text-slate-400 transition hover:bg-slate-850 hover:text-white"
    >
      {delta > 0 ? "+" : "-"}
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-6 backdrop-blur-md">
      <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-slate-500">
        Score Simulator Widget
      </h3>

      <div className="space-y-4 mb-6">
        {[
          { key: "moreRepayments" as const, label: "Simulate On-Time Repayments", value: adj.moreRepayments, icon: "🔄" },
          { key: "moreDays" as const, label: "Simulate Position Hold Days", value: adj.moreDays, icon: "📅" },
          { key: "moreTokens" as const, label: "Simulate Held Whitelisted Stocks", value: adj.moreTokens, icon: "📊" },
        ].map(({ key, label, value, icon }) => (
          <div key={key} className="flex items-center justify-between py-1.5 border-b border-slate-900/40 last:border-b-0">
            <span className="text-sm text-slate-300 font-semibold flex items-center gap-2">
              <span className="text-base shrink-0">{icon}</span>
              {label}
            </span>
            <div className="flex items-center gap-3">
              {btn(key, -1)}
              <span className="w-6 text-center text-sm font-black font-mono text-white">{value}</span>
              {btn(key, 1)}
            </div>
          </div>
        ))}
      </div>

      {/* Simulated Result Container */}
      <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-4 text-center relative overflow-hidden group">
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 blur-[20px]" />
        
        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">PROJECTED CREDIT RATING</p>
        <p className="text-3xl font-black text-cyan-400 mt-1.5 tracking-tight font-mono">{projected}</p>
        
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Current: {currentScore} &middot; Estimated Change:{" "}
          <span className={`font-bold font-mono ${projected >= currentScore ? "text-emerald-400" : "text-red-400"}`}>
            {projected >= currentScore ? "+" : ""}
            {projected - currentScore}
          </span>
        </p>
      </div>

      <p className="mt-4 text-[9px] font-medium text-slate-600 text-center leading-relaxed">
        * Pure local javascript simulation based on scoring logic. Actual scores are audited and updated every 6 hours by the on-chain oracle service.
      </p>
    </div>
  );
}
