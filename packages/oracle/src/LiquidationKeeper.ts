import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const VAULT_ABI = [
  "function getHealthFactor(uint256 loanId) view returns (uint256)",
  "function liquidate(uint256 loanId) external",
  "event Borrowed(uint256 indexed loanId, uint256 indexed agentId, address collateral, uint256 collateralAmt, uint256 borrowAmt)",
  "event Repaid(uint256 indexed loanId, uint256 amount, uint256 remaining)",
  "event Liquidated(uint256 indexed loanId, address indexed liquidator, uint256 collateralSeized)",
];

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const LIQUIDATION_THRESHOLD = 110;
const CIRCUIT_BREAKER_LIMIT = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 30 * 60 * 1000;
const MAX_LOAN_SCAN = 10_000;

export interface LiquidationConfig {
  rpcUrl: string;
  lendingVaultAddress: string;
  privateKey: string;
  dryRun?: boolean;
}

export class LiquidationKeeper {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private vault: ethers.Contract;
  private consecutiveRpcErrors = 0;
  private pausedUntil = 0;

  constructor(private config: LiquidationConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.vault = new ethers.Contract(
      config.lendingVaultAddress,
      VAULT_ABI,
      this.signer
    );
  }

  async check(): Promise<void> {
    const now = Date.now();
    if (now < this.pausedUntil) {
      console.log(
        `[LiquidationKeeper] circuit breaker paused until ${new Date(this.pausedUntil).toISOString()}`
      );
      return;
    }

    console.log(`[LiquidationKeeper] check starting at ${new Date().toISOString()}`);

    try {
      const activeLoanIds = await this.discoverActiveLoans();
      console.log(`[LiquidationKeeper] found ${activeLoanIds.length} active loans`);

      for (const loanId of activeLoanIds) {
        try {
          await this.checkLoan(loanId);
        } catch (err) {
          console.error(`[LiquidationKeeper] error checking loan ${loanId}:`, err);
        }
      }

      this.consecutiveRpcErrors = 0;
    } catch (err) {
      console.error(`[LiquidationKeeper] RPC error:`, err);
      this.consecutiveRpcErrors++;

      if (this.consecutiveRpcErrors >= CIRCUIT_BREAKER_LIMIT) {
        this.pausedUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
        console.error(
          `[LiquidationKeeper] CIRCUIT BREAKER: ${CIRCUIT_BREAKER_LIMIT} consecutive RPC errors, pausing for 30 minutes`
        );
      }
    }
  }

  private async discoverActiveLoans(): Promise<number[]> {
    const currentBlock = await this.provider.getBlockNumber();

    const borrowedLogs = await this.provider.getLogs({
      address: this.config.lendingVaultAddress,
      topics: [ethers.id("Borrowed(uint256,uint256,address,uint256,uint256)")],
      fromBlock: 0,
      toBlock: currentBlock,
    });

    const repaidLogs = await this.provider.getLogs({
      address: this.config.lendingVaultAddress,
      topics: [ethers.id("Repaid(uint256,uint256,uint256)")],
      fromBlock: 0,
      toBlock: currentBlock,
    });

    const liquidatedLogs = await this.provider.getLogs({
      address: this.config.lendingVaultAddress,
      topics: [ethers.id("Liquidated(uint256,address,uint256)")],
      fromBlock: 0,
      toBlock: currentBlock,
    });

    const vaultIface = new ethers.Interface(VAULT_ABI);

    const borrowedIds = new Set<string>();
    for (const log of borrowedLogs) {
      const parsed = vaultIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed) borrowedIds.add(parsed.args.loanId.toString());
    }

    const closedIds = new Set<string>();
    for (const log of [...repaidLogs, ...liquidatedLogs]) {
      const parsed = vaultIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed) closedIds.add(parsed.args.loanId.toString());
    }

    return Array.from(borrowedIds)
      .filter((id) => !closedIds.has(id))
      .map(Number)
      .sort((a, b) => a - b);
  }

  private async checkLoan(loanId: number): Promise<void> {
    let healthFactor: bigint;
    try {
      healthFactor = await this.vault.getHealthFactor(loanId);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("LoanNotFound")) {
        // loan was closed between discovery and check
        return;
      }
      throw err;
    }

    if (healthFactor >= BigInt(LIQUIDATION_THRESHOLD)) {
      return;
    }

    console.log(
      `[LiquidationKeeper] loan ${loanId}: healthFactor=${healthFactor} < ${LIQUIDATION_THRESHOLD}, liquidating...`
    );

    if (!this.config.dryRun) {
      try {
        const tx = await this.vault.liquidate(loanId);
        const receipt = await tx.wait();
        console.log(`  liquidated loan ${loanId}: tx=${tx.hash}`);
      } catch (err) {
        console.error(`  failed to liquidate loan ${loanId}:`, err);
      }
    } else {
      console.log(`  (dry-run) would liquidate loan ${loanId}`);
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith("LiquidationKeeper.ts") || process.argv[1].endsWith("LiquidationKeeper.js") || process.argv[1].endsWith("LiquidationKeeper"))) {
  const isRunOnce = process.argv.includes("--run-once");
  if (isRunOnce) {
    const rpcUrl = process.env.RH_CHAIN_RPC_URL;
    const lendingVaultAddress = process.env.LENDING_VAULT_ADDRESS || process.env.LENDINGVAULT_ADDRESS;
    const privateKey = process.env.ORACLE_PRIVATE_KEY;

    if (!rpcUrl || !lendingVaultAddress || !privateKey) {
      console.error(
        "Missing required env vars: RH_CHAIN_RPC_URL, LENDING_VAULT_ADDRESS, ORACLE_PRIVATE_KEY"
      );
      process.exit(1);
    }

    const keeper = new LiquidationKeeper({
      rpcUrl,
      lendingVaultAddress,
      privateKey,
      dryRun: process.argv.includes("--dry-run"),
    });

    keeper
      .check()
      .then(() => {
        console.log("[LiquidationKeeper] Standalone execution successful.");
        process.exit(0);
      })
      .catch((err) => {
        console.error("[LiquidationKeeper] Standalone execution failed:", err);
        process.exit(1);
      });
  }
}
