"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  ADDRESSES,
  AGENTID_ABI,
  SCORE_ABI,
  LENDING_ABI,
  ERC20_ABI,
  PRICE_ORACLE_ABI,
  robinhoodTestnet,
} from "../../lib/addresses";
import Navbar from "../../components/Navbar";

const COLLATERAL_DECIMALS = 18;
const USDC_DECIMALS = 6;

const TOKEN_SYMBOL: Record<string, string> = {
  [ADDRESSES.TSLA_TOKEN.toLowerCase()]: "TSLA",
  [ADDRESSES.AMZN_TOKEN.toLowerCase()]: "AMZN",
};

const COLLATERAL_OPTIONS = [
  { label: "TSLA", address: ADDRESSES.TSLA_TOKEN, description: "Tesla Motors Tokenized Stock", icon: "⚡" },
  { label: "AMZN", address: ADDRESSES.AMZN_TOKEN, description: "Amazon Inc Tokenized Stock", icon: "🛒" },
];

interface LoanEntry {
  loanId: bigint;
  collateralToken: string;
  collateralAmt: bigint;
  borrowAmt: bigint;
}

export default function BorrowPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const isWrongNetwork = chain?.id !== robinhoodTestnet.id;

  const { data: tokenId } = useReadContract({
    address: ADDRESSES.AgentID,
    abi: AGENTID_ABI,
    functionName: "tokenOfOwner",
    args: [address ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)],
    query: { enabled: !!address },
  });
  const agentId = tokenId && tokenId > 0n ? Number(tokenId) : undefined;

  const { data: scoreData } = useReadContract({
    address: ADDRESSES.ScoreEngine,
    abi: SCORE_ABI,
    functionName: "getScore",
    args: [BigInt(agentId ?? 0)],
    query: { enabled: !!agentId },
  });
  const { data: ltv } = useReadContract({
    address: ADDRESSES.ScoreEngine,
    abi: SCORE_ABI,
    functionName: "getLTV",
    args: [BigInt(agentId ?? 0)],
    query: { enabled: !!agentId },
  });
  const score = scoreData?.[0] ?? 350;

  const [selectedToken, setSelectedToken] = useState<string>(ADDRESSES.TSLA_TOKEN);
  const [collateralAmt, setCollateralAmt] = useState("");
  const [borrowAmt, setBorrowAmt] = useState("");

  const { data: price } = useReadContract({
    address: ADDRESSES.PRICE_ORACLE,
    abi: PRICE_ORACLE_ABI,
    functionName: "getPrice",
    args: [selectedToken as `0x${string}`],
    query: { enabled: !!selectedToken },
  });

  const collateralWei = useMemo(() => {
    if (!collateralAmt || parseFloat(collateralAmt) === 0) return 0n;
    try {
      return parseUnits(collateralAmt, COLLATERAL_DECIMALS);
    } catch {
      return 0n;
    }
  }, [collateralAmt]);

  const colUSD = useMemo(() => {
    if (!collateralWei || !price || price === 0n) return 0n;
    return (collateralWei * price) / 10n ** 18n;
  }, [collateralWei, price]);

  const maxBorrow = useMemo(() => {
    if (!colUSD || !ltv) return 0n;
    return (colUSD * BigInt(ltv)) / 100n / 10n ** 12n;
  }, [colUSD, ltv]);

  const borrowWei = useMemo(() => {
    if (!borrowAmt || parseFloat(borrowAmt) === 0) return 0n;
    try {
      return parseUnits(borrowAmt, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [borrowAmt]);

  const previewHealthFactor = useMemo(() => {
    if (!colUSD || !borrowWei || borrowWei === 0n) return null;
    const colUSD6 = colUSD / 10n ** 12n;
    if (colUSD6 === 0n) return null;
    return (colUSD6 * 100n) / borrowWei;
  }, [colUSD, borrowWei]);

  const fillMax = useCallback(() => {
    if (maxBorrow > 0n) {
      setBorrowAmt(formatUnits(maxBorrow, USDC_DECIMALS));
    }
  }, [maxBorrow]);

  const { data: collateralAllowance, refetch: refetchAllowance } = useReadContract({
    address: selectedToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? "0x0" as `0x${string}`, ADDRESSES.LendingVault],
    query: { enabled: !!address },
  });
  const needsCollateralApproval =
    collateralAllowance !== undefined &&
    collateralWei > 0n &&
    collateralWei > collateralAllowance;

  const { writeContract: writeApprove, data: approveHash } = useWriteContract();
  const { isLoading: approveLoading } = useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeBorrow,
    data: borrowHash,
    error: borrowError,
    isSuccess: borrowSuccess,
  } = useWriteContract();
  const { isLoading: borrowLoading } = useWaitForTransactionReceipt({ hash: borrowHash });

  useEffect(() => {
    if (borrowSuccess) {
      setCollateralAmt("");
      setBorrowAmt("");
      refetchAllowance();
    }
  }, [borrowSuccess, refetchAllowance]);

  const [loans, setLoans] = useState<Map<number, LoanEntry>>(new Map());

  useWatchContractEvent({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    eventName: "Borrowed",
    onLogs(logs) {
      for (const log of logs) {
        const ev = log as unknown as {
          args?: {
            loanId?: bigint;
            agentId?: bigint;
            collateral?: string;
            collateralAmt?: bigint;
            borrowAmt?: bigint;
          };
        };
        const a = ev.args;
        if (!a?.loanId || !a?.agentId) continue;
        if (agentId && Number(a.agentId) !== agentId) continue;
        setLoans((prev) => {
          const next = new Map(prev);
          next.set(Number(a.loanId), {
            loanId: a.loanId!,
            collateralToken: a.collateral ?? "",
            collateralAmt: a.collateralAmt ?? 0n,
            borrowAmt: a.borrowAmt ?? 0n,
          });
          return next;
        });
      }
    },
    enabled: !!agentId,
  });

  useWatchContractEvent({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    eventName: "Repaid",
    onLogs(logs) {
      for (const log of logs) {
        const ev = log as unknown as {
          args?: { loanId?: bigint; remaining?: bigint };
        };
        const a = ev.args;
        if (!a?.loanId) continue;
        if (a.remaining === 0n) {
          setLoans((prev) => {
            const next = new Map(prev);
            next.delete(Number(a.loanId));
            return next;
          });
        }
      }
    },
  });

  useEffect(() => {
    if (!publicClient || !agentId) return;
    const load = async () => {
      try {
        const logs = await publicClient.getLogs({
          address: ADDRESSES.LendingVault,
          event: {
            type: "event",
            name: "Borrowed",
            inputs: [
              { type: "uint256", name: "loanId", indexed: true },
              { type: "uint256", name: "agentId", indexed: true },
              { type: "address", name: "collateral", indexed: false },
              { type: "uint256", name: "collateralAmt", indexed: false },
              { type: "uint256", name: "borrowAmt", indexed: false },
            ],
          } as const,
          args: { agentId: BigInt(agentId) } as never,
          fromBlock: 0n,
          toBlock: "latest",
        });
        for (const log of logs) {
          const a = log.args as {
            loanId?: bigint;
            agentId?: bigint;
            collateral?: string;
            collateralAmt?: bigint;
            borrowAmt?: bigint;
          };
          if (!a?.loanId) continue;
          setLoans((prev) => {
            const next = new Map(prev);
            next.set(Number(a.loanId), {
              loanId: a.loanId!,
              collateralToken: a.collateral ?? "",
              collateralAmt: a.collateralAmt ?? 0n,
              borrowAmt: a.borrowAmt ?? 0n,
            });
            return next;
          });
        }
      } catch (e) {
        console.error("Failed loading historical loans", e);
      }
    };
    load();
  }, [publicClient, agentId]);

  const handleBorrow = () => {
    if (!agentId || !collateralWei || !borrowWei) return;
    writeBorrow({
      address: ADDRESSES.LendingVault,
      abi: LENDING_ABI,
      functionName: "borrow",
      args: [BigInt(agentId), selectedToken as `0x${string}`, collateralWei, borrowWei],
    });
  };

  const isOverMax = maxBorrow > 0n && borrowWei > maxBorrow;

  if (!isConnected) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[80vh] items-center justify-center bg-slate-950 px-4">
          <p className="text-slate-500 font-semibold text-sm">Connect your wallet to start borrowing.</p>
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
              Please switch to Robinhood Chain Testnet to borrow.
            </p>
            <button
              onClick={() => switchChain?.({ chainId: robinhoodTestnet.id })}
              className="rounded-xl bg-yellow-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-yellow-500 shadow-lg shadow-yellow-600/10"
            >
              Switch to Robinhood Chain Testnet
            </button>
          </div>
        </main>
      </>
    );
  }

  if (!agentId) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[80vh] flex-col items-center justify-center bg-slate-950 px-4">
          <div className="max-w-md text-center rounded-2xl border border-slate-900 bg-slate-900/40 p-8 backdrop-blur-md">
            <h2 className="mb-2 text-xl font-bold text-white">Identity Required</h2>
            <p className="mb-6 text-sm text-slate-400 leading-relaxed">
              You need a verified AgentID Soulbound NFT passport to borrow USDC assets on Robinhood Chain.
            </p>
            <a
              href="/"
              className="inline-flex rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-8 py-3 text-sm font-bold text-white transition hover:from-cyan-400 hover:to-indigo-400 shadow-lg shadow-indigo-500/20"
            >
              Claim your AgentID NFT
            </a>
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
          <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                Borrow <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">USDC Liquidity</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">Deposit tokenized stock shares as collateral. Lock up to 85% LTV limits.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-900 bg-slate-900/30 px-4 py-2 font-mono text-xs text-slate-300 backdrop-blur-md">
                Credit: <span className="font-bold text-cyan-400">{score}</span> | LTV Cap: <span className="font-bold text-indigo-400">{ltv ? `${Number(ltv)}%` : "—"}</span>
              </div>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* New loan card */}
            <section className="lg:col-span-3 rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md">
              <h2 className="mb-6 text-lg font-bold text-white tracking-tight">Deposit Collateral</h2>

              {/* Stock Selector Grid */}
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Whitelisted Stock Assets
              </label>
              <div className="mb-6 grid grid-cols-2 gap-4">
                {COLLATERAL_OPTIONS.map((t) => (
                  <button
                    key={t.address}
                    onClick={() => {
                      setSelectedToken(t.address);
                      setCollateralAmt("");
                      setBorrowAmt("");
                    }}
                    className={`rounded-xl border p-4 text-left transition-all duration-300 ${
                      selectedToken === t.address
                        ? "border-cyan-500 bg-cyan-950/10 shadow-lg shadow-cyan-500/5"
                        : "border-slate-900 bg-slate-900/20 hover:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{t.icon}</span>
                      <span className="text-sm font-black text-white">{t.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium truncate">{t.description}</p>
                  </button>
                ))}
              </div>

              {/* Collateral Input */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Collateral Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={collateralAmt}
                    onChange={(e) => setCollateralAmt(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    {TOKEN_SYMBOL[selectedToken.toLowerCase()]}
                  </div>
                </div>
                {colUSD > 0n && (
                  <p className="mt-2 text-xs text-slate-500 font-semibold font-mono">
                    ≈ ${formatUnits(colUSD, 18)} USD Market Value
                  </p>
                )}
              </div>

              {/* Parameter Metrics Row */}
              <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-900/60 bg-slate-950/30 p-4">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Your Borrow Limit (LTV)</p>
                  <p className="text-lg font-black text-white mt-1">
                    {ltv ? `${Number(ltv)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Max Borrowable Cash</p>
                  <p className="text-lg font-black text-cyan-400 mt-1">
                    {maxBorrow > 0n
                      ? `${formatUnits(maxBorrow, USDC_DECIMALS)} USDC`
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Borrow Input */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Borrow Amount</label>
                  <button
                    onClick={fillMax}
                    className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-all"
                  >
                    Use Max Limit
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={borrowAmt}
                    onChange={(e) => setBorrowAmt(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    USDC
                  </div>
                </div>
              </div>

              {/* Est. Health Factor Indicator */}
              {previewHealthFactor !== null && (
                <div
                  className={`mb-6 rounded-xl border p-4 text-xs font-semibold flex items-center justify-between ${
                    previewHealthFactor < 150n
                      ? "border-red-500/20 bg-red-500/5 text-red-400"
                      : previewHealthFactor < 200n
                        ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-400"
                        : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                  }`}
                >
                  <span>Projected Health Factor: {formatUnits(previewHealthFactor, 0)}%</span>
                  {previewHealthFactor < 150n && <span className="animate-pulse">⚠ High Liquidation Risk</span>}
                </div>
              )}

              {/* Buttons */}
              {needsCollateralApproval ? (
                <button
                  disabled={approveLoading || collateralWei === 0n}
                  onClick={() =>
                    writeApprove({
                      address: selectedToken as `0x${string}`,
                      abi: ERC20_ABI,
                      functionName: "approve",
                      args: [ADDRESSES.LendingVault, collateralWei],
                    })
                  }
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 py-3.5 text-sm font-bold text-white tracking-wider transition hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/10"
                >
                  {approveLoading ? "Approving Stock Shares..." : "Approve Collateral Transfer"}
                </button>
              ) : (
                <button
                  disabled={borrowLoading || borrowWei === 0n || isOverMax}
                  onClick={handleBorrow}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-bold text-white tracking-wider transition hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 shadow-lg shadow-emerald-500/10"
                >
                  {borrowLoading ? "Executing Loan Contract..." : "Borrow USDC Cash"}
                </button>
              )}

              {isOverMax && (
                <p className="mt-3 text-xs text-red-400 font-semibold">
                  Exceeds your credit rating limit of {formatUnits(maxBorrow, USDC_DECIMALS)} USDC.
                </p>
              )}
              {borrowError && (
                <p className="mt-3 text-xs text-red-400 font-semibold truncate">
                  {borrowError.message}
                </p>
              )}
            </section>

            {/* Active loans list */}
            <section className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md">
              <h2 className="mb-5 text-lg font-bold text-white tracking-tight">
                Active Positions ({loans.size})
              </h2>
              {loans.size === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-slate-900 bg-slate-950/20 text-center p-6">
                  <span className="text-2xl mb-2">📁</span>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">No active stock borrow positions found for this address.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {Array.from(loans.values()).map((loan) => (
                    <LoanCard key={Number(loan.loanId)} loan={loan} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function ScoreBadge({ score, ltv }: { score: number; ltv: number }) {
  const color =
    score < 500
      ? "text-red-450"
      : score < 650
        ? "text-yellow-450"
        : score < 750
          ? "text-green-455"
          : "text-blue-450";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`font-bold ${color}`}>{score}</span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-400">{ltv}% LTV</span>
    </div>
  );
}

function LoanCard({ loan }: { loan: LoanEntry }) {
  const { address } = useAccount();
  const collateralSymbol = TOKEN_SYMBOL[loan.collateralToken.toLowerCase()] ?? "?";

  const { data: hf } = useReadContract({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    functionName: "getHealthFactor",
    args: [loan.loanId],
  });

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? "0x0" as `0x${string}`, ADDRESSES.LendingVault],
    query: { enabled: !!address },
  });

  const { writeContract: writeAction, data: actionHash } = useWriteContract();
  const { isLoading: actionLoading, isSuccess: actionSuccess } = useWaitForTransactionReceipt({
    hash: actionHash,
  });

  useEffect(() => {
    if (actionSuccess) refetchUsdcAllowance();
  }, [actionSuccess, refetchUsdcAllowance]);

  const [repayAmt, setRepayAmt] = useState("");

  const repayWei = useMemo(() => {
    if (!repayAmt || parseFloat(repayAmt) === 0) return 0n;
    try {
      return parseUnits(repayAmt, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [repayAmt]);

  const needsUsdcApproval =
    usdcAllowance !== undefined &&
    repayWei > 0n &&
    repayWei > usdcAllowance;

  const healthColor =
    hf === undefined
      ? "text-slate-500"
      : hf < 110n
        ? "text-red-400"
        : hf < 150n
          ? "text-yellow-400"
          : "text-emerald-400";

  const fullRepayHint = formatUnits(
    loan.borrowAmt + (loan.borrowAmt * 8n) / 100n,
    USDC_DECIMALS
  );

  const handleAction = () => {
    if (repayWei === 0n) return;
    if (needsUsdcApproval) {
      writeAction({
        address: ADDRESSES.USDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.LendingVault, repayWei],
      });
      return;
    }
    writeAction({
      address: ADDRESSES.LendingVault,
      abi: LENDING_ABI,
      functionName: "repay",
      args: [loan.loanId, repayWei],
    });
  };

  const buttonLabel = needsUsdcApproval
    ? "Approve USDC"
    : actionLoading
      ? "Repaying..."
      : "Repay USDC";

  return (
    <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-white">Loan position #{loan.loanId.toString()}</span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-black tracking-wider uppercase border border-current bg-current/5 ${healthColor}`}>
          Health: {hf ? `${formatUnits(hf, 0)}%` : "Loading..."}
        </span>
      </div>
      <div className="mb-4 space-y-1.5 text-xs text-slate-400">
        <div className="flex justify-between">
          <span>Deposited Stock</span>
          <span className="font-bold text-white font-mono">
            {formatUnits(loan.collateralAmt, COLLATERAL_DECIMALS)} {collateralSymbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Active USDC Debt</span>
          <span className="font-bold text-white font-mono">{formatUnits(loan.borrowAmt, USDC_DECIMALS)} USDC</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={repayAmt}
          onChange={(e) => setRepayAmt(e.target.value)}
          placeholder={`Full: ~${fullRepayHint}`}
          className="flex-1 rounded-lg border border-slate-900 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-700 outline-none focus:border-cyan-500 transition-all font-mono"
        />
        <button
          disabled={actionLoading || repayWei === 0n}
          onClick={handleAction}
          className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
