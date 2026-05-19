"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  ADDRESSES,
  LENDING_ABI,
  ERC20_ABI,
  robinhoodTestnet,
} from "../../lib/addresses";
import Navbar from "../../components/Navbar";

const USDC_DECIMALS = 6;

interface LiquidationEvent {
  loanId: string;
  liquidator: string;
  collateralSeized: bigint;
  timestamp: number;
}

export default function LendPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = chain?.id !== robinhoodTestnet.id;

  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    functionName: "totalSupply",
    query: { refetchInterval: 10_000 },
  });

  const { data: vaultBalance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [ADDRESSES.LendingVault],
    query: { refetchInterval: 10_000 },
  });

  const { data: userShares } = useReadContract({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0" as `0x${string}`],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const totalDeposited = totalSupply ?? 0n;
  const vaultUsdc = vaultBalance ?? 0n;
  const shares = userShares ?? 0n;
  const totalBorrowed =
    totalDeposited > vaultUsdc ? totalDeposited - vaultUsdc : 0n;
  const utilization =
    totalDeposited > 0n
      ? Number((totalBorrowed * 10000n) / totalDeposited) / 100
      : 0;

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const depositWei = useMemo(() => {
    if (!depositAmt || parseFloat(depositAmt) === 0) return 0n;
    try {
      return parseUnits(depositAmt, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [depositAmt]);

  const withdrawWei = useMemo(() => {
    if (!withdrawAmt || parseFloat(withdrawAmt) === 0) return 0n;
    try {
      return parseUnits(withdrawAmt, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [withdrawAmt]);

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? "0x0" as `0x${string}`, ADDRESSES.LendingVault],
    query: { enabled: !!address },
  });

  const needsDepositApproval =
    usdcAllowance !== undefined && depositWei > 0n && depositWei > usdcAllowance;

  const { writeContract: writeDeposit, data: depositHash } = useWriteContract();
  const { isLoading: depositLoading, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });

  useEffect(() => {
    if (depositSuccess) {
      setDepositAmt("");
      refetchAllowance();
    }
  }, [depositSuccess, refetchAllowance]);

  const handleDeposit = () => {
    if (depositWei === 0n) return;
    if (needsDepositApproval) {
      writeDeposit({
        address: ADDRESSES.USDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.LendingVault, depositWei],
      });
    } else {
      writeDeposit({
        address: ADDRESSES.LendingVault,
        abi: LENDING_ABI,
        functionName: "deposit",
        args: [depositWei],
      });
    }
  };

  const { writeContract: writeWithdraw, data: withdrawHash } = useWriteContract();
  const { isLoading: withdrawLoading, isSuccess: withdrawSuccess } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (withdrawSuccess) {
      setWithdrawAmt("");
    }
  }, [withdrawSuccess]);

  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);

  useWatchContractEvent({
    address: ADDRESSES.LendingVault,
    abi: LENDING_ABI,
    eventName: "Liquidated",
    onLogs(logs) {
      const entries: LiquidationEvent[] = [];
      for (const log of logs) {
        const ev = log as unknown as {
          args?: {
            loanId?: bigint;
            liquidator?: string;
            collateralSeized?: bigint;
          };
        };
        const a = ev.args;
        if (!a?.loanId) continue;
        entries.push({
          loanId: a.loanId.toString(),
          liquidator: a.liquidator ?? "",
          collateralSeized: a.collateralSeized ?? 0n,
          timestamp: Date.now(),
        });
      }
      if (entries.length > 0) {
        setLiquidations((prev) => [...entries, ...prev].slice(0, 20));
      }
    },
  });

  if (!isConnected) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[80vh] items-center justify-center bg-slate-950 px-4">
          <p className="text-slate-500 font-semibold text-sm">Connect your wallet to start lending.</p>
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
              Please switch to Robinhood Chain Testnet to lend.
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <header className="mb-10">
            <h1 className="text-3xl font-black text-white tracking-tight">
              Lend <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">USDC Liquidity</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Provide liquidity to the collateralized stock lending pool and earn yields.</p>
          </header>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Pool stats card */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md flex flex-col justify-between">
              <div>
                <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Pool Parameters</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-slate-900/40 pb-2">
                    <span className="text-xs text-slate-500">Total Deposited</span>
                    <span className="text-sm font-black text-white font-mono">{formatUnits(totalDeposited, USDC_DECIMALS)} USDC</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-slate-900/40 pb-2">
                    <span className="text-xs text-slate-500">Available Liquidity</span>
                    <span className="text-sm font-bold text-slate-200 font-mono">{formatUnits(vaultUsdc, USDC_DECIMALS)} USDC</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-slate-900/40 pb-2">
                    <span className="text-xs text-slate-500">Lending APY</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">8.00%</span>
                  </div>
                </div>
              </div>

              {/* Pool utilization visual meter */}
              <div className="mt-8">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-500">Utilization Rate</span>
                  <span className="text-cyan-400 font-mono">{utilization}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Deposit Form Card */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md flex flex-col justify-between">
              <div>
                <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Deposit USDC</h2>
                <div className="relative mb-3">
                  <input
                    type="number"
                    value={depositAmt}
                    onChange={(e) => setDepositAmt(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-3.5 text-sm text-white placeholder-slate-700 outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    USDC
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                  Lenders receive exact 1:1 dynamic pool receipt cvaUSDC vault shares.
                </p>
              </div>

              <button
                disabled={depositLoading || depositWei === 0n}
                onClick={handleDeposit}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 py-3.5 text-sm font-bold text-white tracking-wider transition hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/10 mt-8"
              >
                {depositLoading
                  ? "Signing Transaction..."
                  : needsDepositApproval
                    ? "Approve USDC Transfer"
                    : "Deposit USDC"}
              </button>
            </section>

            {/* User Position Card */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 backdrop-blur-md flex flex-col justify-between">
              <div>
                <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Your Lended Position</h2>
                <div className="mb-5 space-y-2">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Shares Owned</span>
                    <p className="text-xl font-black text-white font-mono mt-0.5">
                      {formatUnits(shares, USDC_DECIMALS)} cvaUSDC
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Redeemable Cash Value</span>
                    <p className="text-sm font-bold text-slate-300 font-mono mt-0.5">
                      ≈ {formatUnits(shares, USDC_DECIMALS)} USDC
                    </p>
                  </div>
                </div>
              </div>

              {/* Withdraw controls */}
              <div className="mt-6 border-t border-slate-900/40 pt-4">
                <label className="mb-2 block text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Withdraw Shares</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={withdrawAmt}
                    onChange={(e) => setWithdrawAmt(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-700 outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                  <button
                    disabled={withdrawLoading || withdrawWei === 0n || withdrawWei > shares}
                    onClick={() => {
                      if (withdrawWei === 0n) return;
                      writeWithdraw({
                        address: ADDRESSES.LendingVault,
                        abi: LENDING_ABI,
                        functionName: "withdraw",
                        args: [withdrawWei],
                      });
                    }}
                    className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 shrink-0"
                  >
                    {withdrawLoading ? "..." : "Withdraw"}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Liquidations event terminal */}
          <section className="mt-8">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Vault Liquidations Tracker</h2>
            <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-4">
              {liquidations.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-center">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping mr-3" />
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">No liquidations logged. Polling events in real-time...</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {liquidations.map((liq, i) => (
                    <div
                      key={`${liq.loanId}-${i}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-slate-900 bg-slate-950/40 px-4 py-3 text-xs gap-2"
                    >
                      <span className="font-bold text-white shrink-0">Loan position liquidated: #{liq.loanId}</span>
                      <span className="text-red-400 font-bold font-mono">
                        Seized {formatUnits(liq.collateralSeized, 18)} Collateral Stock
                      </span>
                      <span className="text-slate-500 font-medium truncate font-mono">
                        Liquidator: {liq.liquidator.slice(0, 6)}...
                        {liq.liquidator.slice(-4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
