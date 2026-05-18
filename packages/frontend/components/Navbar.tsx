"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ADDRESSES, AGENTID_ABI } from "../lib/addresses";
import { useReadContract } from "wagmi";

export default function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  // Read AgentID to check if active
  const { data: tokenId } = useReadContract({
    address: ADDRESSES.AgentID,
    abi: AGENTID_ABI,
    functionName: "tokenOfOwner",
    args: [address ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)],
    query: { enabled: !!address },
  });

  const hasAgentId = tokenId !== undefined && tokenId > 0n;

  const links = [
    { label: "Dashboard", href: "/" },
    { label: "Borrow Stock", href: "/borrow" },
    { label: "Lending Pool", href: "/lend" },
    { label: "Admin Oracle", href: "/admin" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-900 bg-slate-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 shadow-lg shadow-indigo-500/20 transition-all duration-300 group-hover:scale-105 group-hover:rotate-6">
            <span className="text-lg font-black text-white">C</span>
          </div>
          <span className="text-xl font-black tracking-wider text-white">
            Chain<span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent group-hover:to-cyan-400 transition-all duration-300">Score</span>
          </span>
        </Link>

        {/* Tab Navigation links (visible only if connected) */}
        {isConnected && (
          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-xl px-4 py-2 text-sm font-semibold tracking-wide transition-all duration-200 ${
                    isActive
                      ? "text-cyan-400 bg-cyan-950/30 border border-cyan-800/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Web3 Connect Button & Responsive menu */}
        <div className="flex items-center gap-4">
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </div>

      {/* Mobile nav indicator bar if connected */}
      {isConnected && (
        <div className="flex justify-around border-t border-slate-950/40 bg-slate-950/90 py-2.5 md:hidden">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs font-bold tracking-wide transition-colors ${
                  isActive ? "text-cyan-400" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {link.label.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
