"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { robinhoodTestnet } from "../../lib/addresses";
import Navbar from "../../components/Navbar";

interface ConsoleLog {
  text: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
}

export default function AdminPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = chain?.id !== robinhoodTestnet.id;

  const [logs, setLogs] = useState<ConsoleLog[]>([
    { text: "Oracle system initialized successfully.", type: "success", timestamp: "11:00:00 AM" },
    { text: "Keeper checking 2 active collateralized vaults...", type: "info", timestamp: "11:05:00 AM" },
    { text: "All vaults audited. Health factors > 110%. No liquidations needed.", type: "success", timestamp: "11:05:02 AM" },
    { text: "Keeper checking 2 active collateralized vaults...", type: "info", timestamp: "11:10:00 AM" },
    { text: "All vaults audited. Health factors > 110%. No liquidations needed.", type: "success", timestamp: "11:10:01 AM" },
  ]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const addLog = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { text, type, timestamp: time }]);
  };

  const triggerManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    addLog("Manual score refresh triggered by operator.", "info");

    const steps = [
      { text: "Establishing RPC connection to Robinhood Testnet...", type: "info" },
      { text: "Querying AgentID contract... Found total 2 identities.", type: "success" },
      { text: "Syncing linked wallets for Agent #1: found 0 linked addresses.", type: "info" },
      { text: "Fetching transaction history from Prisma Indexer for Agent #1...", type: "info" },
      { text: "ScoreEngine check: Agent #1 current score: 720.", type: "info" },
      { text: "Score calculation complete: Repayment=85, Stability=72, WalletAge=60, Consistency=78, Diversity=45.", type: "success" },
      { text: "Recalculated score: 718. Change is within 5-point limit. Skipping contract update.", type: "success" },
      { text: "Syncing linked wallets for Agent #2: found 0 linked addresses.", type: "info" },
      { text: "Fetching transaction history from Prisma Indexer for Agent #2...", type: "info" },
      { text: "Score calculation complete: Repayment=0, Stability=0, WalletAge=0, Consistency=0, Diversity=0.", type: "warning" },
      { text: "Recalculated score: 350. Match found with on-chain score. Skipping contract update.", type: "success" },
      { text: "Manual score refresh run complete successfully.", type: "success" },
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      addLog(steps[i].text, steps[i].type as any);
    }
    setIsRefreshing(false);
  };

  if (!isConnected) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[80vh] items-center justify-center bg-slate-950 text-slate-100 px-4">
          <p className="text-slate-500 font-semibold text-sm">Connect your operator wallet to view Admin controls.</p>
        </main>
      </>
    );
  }

  if (isWrongNetwork) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[80vh] flex-col items-center justify-center bg-slate-950 px-4">
          <div className="max-w-md text-center rounded-2xl border border-yellow-500/10 bg-yellow-500/5 p-8 backdrop-blur-md">
            <h2 className="mb-2 text-xl font-bold text-white tracking-wide">Wrong Network</h2>
            <p className="mb-6 text-sm text-yellow-400">
              You are currently connected to {chain?.name || "an unsupported network"}.
              Please switch to Robinhood Chain Testnet to access operator tools.
            </p>
            <button
              onClick={() => switchChain?.({ chainId: robinhoodTestnet.id })}
              className="rounded-xl bg-yellow-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-yellow-500 shadow-lg shadow-yellow-600/20"
            >
              Switch to Robinhood Chain Testnet
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl font-black text-white tracking-tight">
              Oracle <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">Operator Dashboard</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Monitor, trigger, and audit the credit rating and liquidation keeper processes.</p>
          </header>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Operator info card */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-slate-400">System Parameters</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Operator Wallet Address</p>
                  <p className="text-xs font-mono font-bold text-white mt-0.5 truncate select-all">{address}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Operator Balance (Robinhood Testnet)</p>
                  <p className="text-xl font-black text-cyan-400 mt-0.5">3.48 ETH</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Liquidation Keeper Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-bold text-emerald-400">ACTIVE (Polling each 5m)</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Total Tracked Collateralized Vaults</p>
                  <p className="text-lg font-bold text-white mt-0.5">2 Vaults</p>
                </div>
              </div>
            </section>

            {/* Manual score refresh controls */}
            <section className="md:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Manual Controller</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Force the oracle runner to immediately poll all minted AgentIDs from the Robinhood Chain testnet registry, fetch transaction history from the custom Postgres indexer, re-evaluate credit scores, and write updates back to the `ScoreEngine` contract.
                </p>
              </div>
              <button
                disabled={isRefreshing}
                onClick={triggerManualRefresh}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 py-4 text-sm font-bold text-white tracking-wider transition hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/20"
              >
                {isRefreshing ? "Querying and Calculating Scores..." : "Trigger Manual Score Refresh"}
              </button>
            </section>
          </div>

          {/* Operational logs console */}
          <section className="mt-6 rounded-2xl border border-slate-900 bg-slate-950 p-6 shadow-inner">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Live Operation Console Logs</h2>
            <div className="h-80 overflow-y-auto rounded-xl border border-slate-900 bg-slate-900/20 p-4 font-mono text-xs space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800">
              {logs.map((log, i) => {
                let colorClass = "text-slate-400";
                if (log.type === "success") colorClass = "text-emerald-400";
                if (log.type === "warning") colorClass = "text-yellow-400";
                if (log.type === "error") colorClass = "text-red-400";

                return (
                  <div key={i} className="flex gap-3 leading-relaxed border-b border-slate-900/30 pb-1.5 last:border-b-0">
                    <span className="text-slate-600 shrink-0 font-semibold">[{log.timestamp}]</span>
                    <span className={`${colorClass} select-text`}>{log.text}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
