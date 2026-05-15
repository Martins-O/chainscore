import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { compute } from "./ScoreComputer.js";
import type { WalletHistory } from "./types.js";

const AGENTID_ABI = [
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getLinkedWallets(uint256 tokenId) view returns (address[])",
  "function tokenOfOwner(address owner) view returns (uint256)",
  "function createdAt(uint256 tokenId) view returns (uint256)",
];

const SCOREENGINE_ABI = [
  "function getScore(uint256 agentId) view returns (uint16 score, uint256 updatedAt)",
  "function updateScore(uint256 agentId, uint16 score, bytes32 dataHash) external",
];

const LOG_FILE = path.resolve(process.cwd(), "oracle-runs.json");
const MAX_WRITES_PER_RUN = 20;

export interface OracleConfig {
  rpcUrl: string;
  agentIdAddress: string;
  scoreEngineAddress: string;
  indexerBaseUrl: string;
  privateKey: string;
  dryRun?: boolean;
}

export class OracleRunner {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private agentId: ethers.Contract;
  private scoreEngine: ethers.Contract;
  private consecutiveErrors = 0;

  constructor(private config: OracleConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.agentId = new ethers.Contract(
      config.agentIdAddress,
      AGENTID_ABI,
      this.provider
    );
    this.scoreEngine = new ethers.Contract(
      config.scoreEngineAddress,
      SCOREENGINE_ABI,
      this.signer
    );
  }

  async run(): Promise<void> {
    console.log(`[OracleRunner] run starting at ${new Date().toISOString()}`);

    try {
      const totalSupply = Number(await this.agentId.totalSupply());
      console.log(`[OracleRunner] total AgentIDs: ${totalSupply}`);

      let writesDone = 0;
      const logs: unknown[] = [];

      for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
        if (writesDone >= MAX_WRITES_PER_RUN) {
          console.log(`[OracleRunner] reached max ${MAX_WRITES_PER_RUN} writes, stopping`);
          break;
        }

        try {
          const result = await this.processAgentId(tokenId);
          logs.push(result);
          if (result.changed) writesDone++;
        } catch (err) {
          console.error(`[OracleRunner] error processing agentId ${tokenId}:`, err);
        }
      }

      this.appendLogs(logs);
    } catch (err) {
      console.error(`[OracleRunner] run failed:`, err);
      this.consecutiveErrors++;
    }

    console.log(`[OracleRunner] run complete at ${new Date().toISOString()}`);
  }

  private async processAgentId(tokenId: number): Promise<{
    agentId: number;
    oldScore: number;
    newScore: number;
    changed: boolean;
    timestamp: string;
    flags: string[];
  }> {
    const owner = (await this.agentId.ownerOf(tokenId)) as string;
    const linkedWallets = (await this.agentId.getLinkedWallets(tokenId)) as string[];
    const allWallets = [owner.toLowerCase(), ...linkedWallets.map((w: string) => w.toLowerCase())];

    const mergedHistory = await this.mergeWalletHistories(allWallets);

    const result = compute(mergedHistory);
    const newScore = result.score;

    const [onchainScore, updatedAt] = await this.scoreEngine.getScore(tokenId);
    const oldScore = Number(onchainScore);
    const diff = Math.abs(newScore - oldScore);

    let changed = false;

    if (diff > 5) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const cooldownPassed = nowSeconds > Number(updatedAt) + 86400;

      if (cooldownPassed) {
        const rawInputs = [
          mergedHistory.loanCount,
          mergedHistory.repaymentCount,
          mergedHistory.defaultCount,
          mergedHistory.txCount,
          mergedHistory.firstTxTimestamp.toString(),
          mergedHistory.totalTransfers,
          mergedHistory.transferCountBetweenLinked,
        ];
        const dataHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
            rawInputs
          )
        );

        console.log(
          `[OracleRunner] agentId=${tokenId}: ${oldScore} → ${newScore} (diff=${diff})`
        );

        if (!this.config.dryRun) {
          const tx = await this.scoreEngine.updateScore(tokenId, newScore, dataHash);
          await tx.wait();
          console.log(`  tx=${tx.hash}`);
        } else {
          console.log(`  (dry-run) would send tx: updateScore(${tokenId}, ${newScore}, ${dataHash.slice(0, 10)}...)`);
        }

        changed = true;
      } else {
        console.log(
          `[OracleRunner] agentId=${tokenId}: score ${oldScore} → ${newScore} (diff=${diff}) but cooldown active until ${new Date(Number(updatedAt) * 1000 + 86400000).toISOString()}`
        );
      }
    }

    const mergedOwners = allWallets.slice(1).length > 0
      ? `${owner} + ${allWallets.length - 1} linked`
      : owner;
    console.log(
      `[OracleRunner] agentId=${tokenId} (${mergedOwners}): score=${newScore}${changed ? " ✓ UPDATED" : ""}`
    );

    return {
      agentId: tokenId,
      oldScore,
      newScore,
      changed,
      timestamp: new Date().toISOString(),
      flags: result.antiGamingFlags,
    };
  }

  private async mergeWalletHistories(addresses: string[]): Promise<WalletHistory> {
    const allDailies: Map<string, number> = new Map();
    const allTokens: Map<string, bigint> = new Map();

    let firstTxTimestamp = BigInt(Math.floor(Date.now() / 1000));
    let txCount = 0;
    let loanCount = 0;
    let repaymentCount = 0;
    let defaultCount = 0;
    let transferCountBetweenLinked = 0;
    let totalTransfers = 0;

    for (const addr of addresses) {
      try {
        const resp = await fetch(`${this.config.indexerBaseUrl}/wallet/${addr}`);
        if (!resp.ok) continue;

        const wh: WalletHistory & {
          dailyTxCounts: { date: string; count: number }[];
        } = await resp.json();

        if (wh.firstTxTimestamp < firstTxTimestamp) {
          firstTxTimestamp = wh.firstTxTimestamp;
        }
        txCount += wh.txCount ?? 0;
        loanCount += wh.loanCount ?? 0;
        repaymentCount += wh.repaymentCount ?? 0;
        defaultCount += wh.defaultCount ?? 0;
        transferCountBetweenLinked += wh.transferCountBetweenLinked ?? 0;
        totalTransfers += wh.totalTransfers ?? 0;

        for (const d of wh.dailyTxCounts ?? []) {
          allDailies.set(d.date, (allDailies.get(d.date) ?? 0) + d.count);
        }

        const tbArray: { token: string; balance?: string }[] = (wh as any).tokenBalances ?? [];
        for (const tb of tbArray) {
          const key = tb.token.toLowerCase();
          const existing = allTokens.get(key) ?? 0n;
          allTokens.set(key, existing + BigInt(tb.balance ?? "0"));
        }
      } catch {
        // wallet not in indexer yet
      }
    }

    return {
      id: addresses[0],
      firstTxTimestamp,
      txCount,
      loanCount: loanCount > 0 ? loanCount : 1,
      repaymentCount,
      defaultCount,
      tokenBalances: Array.from(allTokens.entries())
        .filter(([, b]) => b > 0n)
        .map(([token, balance]) => ({ token, balance })),
      dailyTxCounts: Array.from(allDailies.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      transferCountBetweenLinked,
      totalTransfers,
    };
  }

  private appendLogs(logs: unknown[]): void {
    const entry = {
      timestamp: new Date().toISOString(),
      count: logs.length,
      runs: logs,
    };

    let existing: unknown[] = [];
    try {
      if (fs.existsSync(LOG_FILE)) {
        existing = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
      }
    } catch {}

    existing.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2));
  }
}

if (process.argv[1] && (process.argv[1].endsWith("OracleRunner.ts") || process.argv[1].endsWith("OracleRunner.js") || process.argv[1].endsWith("OracleRunner"))) {
  const isRunOnce = process.argv.includes("--run-once");
  if (isRunOnce) {
    const rpcUrl = process.env.RH_CHAIN_RPC_URL;
    const agentIdAddress = process.env.AGENT_ID_ADDRESS || process.env.AGENTID_ADDRESS;
    const scoreEngineAddress = process.env.SCORE_ENGINE_ADDRESS || process.env.SCOREENGINE_ADDRESS;
    const indexerBaseUrl = process.env.INDEXER_API_URL || process.env.INDEXER_BASE_URL || "http://localhost:3005";
    const privateKey = process.env.ORACLE_PRIVATE_KEY;

    if (!rpcUrl || !agentIdAddress || !scoreEngineAddress || !privateKey) {
      console.error(
        "Missing required env vars: RH_CHAIN_RPC_URL, AGENT_ID_ADDRESS, SCORE_ENGINE_ADDRESS, ORACLE_PRIVATE_KEY"
      );
      process.exit(1);
    }

    const runner = new OracleRunner({
      rpcUrl,
      agentIdAddress,
      scoreEngineAddress,
      indexerBaseUrl,
      privateKey,
      dryRun: process.argv.includes("--dry-run"),
    });

    runner
      .run()
      .then(() => {
        console.log("[OracleRunner] Standalone execution successful.");
        process.exit(0);
      })
      .catch((err) => {
        console.error("[OracleRunner] Standalone execution failed:", err);
        process.exit(1);
      });
  }
}
