"use client";

import { useState, useEffect } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ADDRESSES, AGENTID_ABI, SCORE_ABI, robinhoodTestnet } from "../lib/addresses";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ScoreRing from "../components/ScoreRing";
import FactorBreakdown from "../components/FactorBreakdown";
import ScoreHistory from "../components/ScoreHistory";
import ScoreSimulator from "../components/ScoreSimulator";
import Navbar from "../components/Navbar";

export default function HomePage() {
  const { address, isConnected } = useAccount();

  const { data: tokenId, refetch } = useReadContract({
    address: ADDRESSES.AgentID,
    abi: AGENTID_ABI,
    functionName: "tokenOfOwner",
    args: [address ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)],
    query: { enabled: !!address },
  });

  const hasAgentId = tokenId !== undefined && tokenId > 0n;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      <Navbar />

      {!isConnected ? (
        <LandingPage />
      ) : !hasAgentId ? (
        <MintPage address={address!} refetchIdentity={refetch} />
      ) : (
        <Dashboard agentId={Number(tokenId)} />
      )}
    </div>
  );
}

function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Background ambient glowing spheres */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />

      <div className="max-w-4xl text-center z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-950/20 px-4 py-1.5 text-xs font-semibold text-cyan-400 mb-6 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          Robinhood Chain Credit Scoring Protocol
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-[1.1] mb-6">
          Decentralized Credit for <br />
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-500 bg-clip-text text-transparent">
            AI Agents & Smart Wallets
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-400 leading-relaxed mb-10">
          Unlock the value of tokenized stock assets. Borrow USDC with score-gated LTV limits, build on-chain reputational capital, and optimize borrow rates dynamically.
        </p>

        {/* Connection Stack */}
        <div className="mt-8 flex items-center justify-center">
          <ConnectButton />
        </div>

        {/* Three Layer Protocol Breakdown Cards */}
        <div className="grid gap-6 md:grid-cols-3 mt-20 text-left">
          <div className="rounded-2xl border border-slate-900/60 bg-slate-900/20 p-6 backdrop-blur-md transition hover:border-slate-850 hover:bg-slate-900/30">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/30 border border-cyan-900/30 text-cyan-400 font-black">
              01
            </div>
            <h3 className="text-lg font-bold text-white mb-2">AgentID Soulbound</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              A non-transferable identity NFT that anchors your permanent reputation registry and links up to 5 wallets safely.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-900/60 bg-slate-900/20 p-6 backdrop-blur-md transition hover:border-slate-850 hover:bg-slate-900/30">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-950/30 border border-teal-900/30 text-teal-400 font-black">
              02
            </div>
            <h3 className="text-lg font-bold text-white mb-2">ScoreEngine Oracle</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              An off-chain computation oracle translates active wallet age, repayment rates, and trading parameters into standard 300-850 scores.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-900/60 bg-slate-900/20 p-6 backdrop-blur-md transition hover:border-slate-850 hover:bg-slate-900/30">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-950/30 border border-indigo-900/30 text-indigo-400 font-black">
              03
            </div>
            <h3 className="text-lg font-bold text-white mb-2">USDC LendingVault</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Deposit TSLA or AMZN tokenized stocks as collateral to borrow USDC cash instantly with score-determined LTV caps.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function MintPage({ address: _addr, refetchIdentity }: { address: string; refetchIdentity: () => void }) {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const isWrongNetwork = chain?.id !== robinhoodTestnet.id;

  useEffect(() => {
    if (isSuccess) {
      refetchIdentity();
    }
  }, [isSuccess, refetchIdentity]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-cyan-500/5 blur-[100px] pointer-events-none" />

      <div className="max-w-md w-full text-center z-10">
        <h2 className="text-3xl font-black text-white tracking-tight mb-2">Claim Your Identity</h2>
        <p className="text-slate-400 text-sm mb-10 leading-relaxed">
          Mint your non-transferable **AgentID** NFT passport on Robinhood Chain to anchor your decentralized credit score.
        </p>

        {/* Digital Holographic Passport Identity Mockup */}
        <div className="relative mb-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-left shadow-2xl backdrop-blur-md overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-cyan-500/10 to-indigo-500/0 rounded-full transition duration-300 group-hover:scale-110" />
          <div className="flex items-center justify-between mb-8">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">AGENTID SYSTEM</span>
            <div className="h-6 w-10 rounded bg-cyan-500/20 border border-cyan-400/20 flex items-center justify-center">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Owner Registry</span>
              <p className="text-xs font-mono text-white font-bold select-all mt-0.5">{_addr}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Default Rating</span>
                <p className="text-sm font-black text-cyan-400 mt-0.5">350 Score</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Limit Wallets</span>
                <p className="text-sm font-black text-slate-200 mt-0.5">5 Linked Max</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Warning and Switcher */}
        {isWrongNetwork ? (
          <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-6 text-left">
            <p className="mb-4 text-xs text-yellow-400 leading-relaxed font-semibold">
              Your wallet is connected to {chain?.name || "an unsupported network"}. Please switch to **Robinhood Chain Testnet** to claim your AgentID identity.
            </p>
            <button
              onClick={() => switchChain?.({ chainId: robinhoodTestnet.id })}
              className="w-full rounded-xl bg-yellow-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-yellow-500 shadow-lg shadow-yellow-600/10"
            >
              Switch to Robinhood Chain Testnet
            </button>
          </div>
        ) : (
          <button
            disabled={isConfirming}
            onClick={() =>
              writeContract({
                address: ADDRESSES.AgentID,
                abi: AGENTID_ABI,
                functionName: "mintIdentity",
              })
            }
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 py-3.5 text-sm font-bold text-white tracking-wider transition hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/15"
          >
            {isConfirming ? "Minting Passport NFT..." : "Mint Your Identity"}
          </button>
        )}
      </div>
    </main>
  );
}

function Dashboard({ agentId }: { agentId: number }) {
  const { address } = useAccount();

  const { data: scoreData } = useReadContract({
    address: ADDRESSES.ScoreEngine,
    abi: SCORE_ABI,
    functionName: "getScore",
    args: [BigInt(agentId)],
  });

  const { data: historyData } = useReadContract({
    address: ADDRESSES.ScoreEngine,
    abi: SCORE_ABI,
    functionName: "getScoreHistory",
    args: [BigInt(agentId)],
  });

  const score = scoreData?.[0] ?? 350;
  const history = (historyData as { score: number; timestamp: number }[] | undefined) ?? [];

  const [factors, setFactors] = useState({
    repaymentScore: 85,
    stabilityScore: 72,
    walletAgeScore: 60,
    consistencyScore: 78,
    diversScore: 45,
  });

  useEffect(() => {
    if (!address) return;
    const fetchHistory = async () => {
      try {
        const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3005";
        const resp = await fetch(`${indexerUrl}/wallet/${address.toLowerCase()}`);
        if (!resp.ok) return;
        const wh = await resp.json();

        // Calculate actual scores based on indexed wallet history
        // 1. Repayment Score
        const loanCount = Math.max(wh.loanCount || 0, 1);
        const repBase = ((wh.repaymentCount || 0) / loanCount) * 100;
        const repPenalty = (wh.defaultCount || 0) * 20;
        const repaymentScore = Math.max(0, Math.round(repBase - repPenalty));

        // 2. Stability Score
        const dailyCounts = (wh.dailyTxCounts || []).map((d: any) => d.count);
        let stabilityScore = 0;
        if (dailyCounts.length > 0) {
          const mean = dailyCounts.reduce((a: number, b: number) => a + b, 0) / dailyCounts.length;
          if (mean > 0) {
            const variance = dailyCounts.reduce((sum: number, c: number) => sum + (c - mean) ** 2, 0) / dailyCounts.length;
            const stdDev = Math.sqrt(variance);
            const cv = stdDev / mean;
            stabilityScore = cv < 0.3 ? 100 : cv <= 0.7 ? 60 : 20;
          }
        }

        // 3. Wallet Age Score
        const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(wh.firstTxTimestamp || 0));
        const days = diffSeconds / 86400;
        const walletAgeScore = Math.min(100, Math.round((days / 365) * 100));

        // 4. Consistency Score
        let consistencyScore = 0;
        if (wh.dailyTxCounts && wh.dailyTxCounts.length > 0) {
          const activeDays = wh.dailyTxCounts.filter((d: any) => d.count > 0).length;
          const ratio = activeDays / wh.dailyTxCounts.length;
          consistencyScore = ratio > 0.6 ? 100 : ratio > 0.3 ? 60 : 20;
        }

        // 5. Diversity Score
        const tokenBalances = wh.tokenBalances || [];
        const heldTokens = tokenBalances.length;
        const diversScore = heldTokens >= 3 ? 100 : heldTokens === 2 ? 50 : heldTokens === 1 ? 20 : 0;

        setFactors({
          repaymentScore,
          stabilityScore,
          walletAgeScore,
          consistencyScore,
          diversScore,
        });
      } catch (err) {
        console.error("Failed to fetch wallet factors", err);
      }
    };
    fetchHistory();
  }, [address]);

  return (
    <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
      {/* Welcome Hero / Status banner */}
      <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Identity <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">Dashboard</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Audit your reputational capital indicators and credit rating logs.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-900 bg-slate-900/30 px-4 py-2 font-mono text-xs text-slate-300 backdrop-blur-md">
            ID: <span className="font-bold text-white">#00{agentId}</span>
          </div>
        </div>
      </header>

      {/* Primary Score Presentation Grid */}
      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md lg:col-span-1 min-h-[300px]">
          <ScoreRing score={score} />
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md">
          <FactorBreakdown factors={factors} />
        </div>
      </div>

      {/* Widgets & Simulators */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md">
          <ScoreHistory history={history} />
        </div>
        <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md">
          <ScoreSimulator currentScore={score} factors={factors} />
        </div>
      </div>
    </main>
  );
}
