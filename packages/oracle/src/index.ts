import * as cron from "node-cron";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { OracleRunner } from "./OracleRunner.js";
import { LiquidationKeeper } from "./LiquidationKeeper.js";

dotenv.config();

const isDryRun = process.argv.includes("--dry-run");

const rpcUrl = process.env.RH_CHAIN_RPC_URL;
const agentIdAddress = process.env.AGENTID_ADDRESS;
const scoreEngineAddress = process.env.SCOREENGINE_ADDRESS;
const lendingVaultAddress = process.env.LENDINGVAULT_ADDRESS;
const indexerBaseUrl = process.env.INDEXER_BASE_URL ?? "http://localhost:3005";
const privateKey = process.env.ORACLE_PRIVATE_KEY;

if (!rpcUrl || !agentIdAddress || !scoreEngineAddress || !lendingVaultAddress || !privateKey) {
  console.error(
    "Missing required env vars: RH_CHAIN_RPC_URL, AGENTID_ADDRESS, SCOREENGINE_ADDRESS, LENDINGVAULT_ADDRESS, ORACLE_PRIVATE_KEY"
  );
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const oracleRunner = new OracleRunner({
  rpcUrl,
  agentIdAddress,
  scoreEngineAddress,
  indexerBaseUrl,
  privateKey,
  dryRun: isDryRun,
});

const liquidationKeeper = new LiquidationKeeper({
  rpcUrl,
  lendingVaultAddress,
  privateKey,
  dryRun: isDryRun,
});

async function startup(): Promise<void> {
  const blockNumber = await provider.getBlockNumber();
  console.log("=".repeat(60));
  console.log(`ChainScore Oracle Service`);
  console.log(`  Network:       ${rpcUrl}`);
  console.log(`  Oracle addr:   ${wallet.address}`);
  console.log(`  Current block: ${blockNumber}`);
  console.log(`  Dry-run:       ${isDryRun}`);
  console.log(`  AgentID:       ${agentIdAddress}`);
  console.log(`  ScoreEngine:   ${scoreEngineAddress}`);
  console.log(`  LendingVault:  ${lendingVaultAddress}`);
  console.log(`  Indexer API:   ${indexerBaseUrl}`);
  console.log("=".repeat(60));

  console.log("\n[Startup] running initial oracle check...");
  await oracleRunner.run();

  console.log("[Startup] running initial liquidation check...");
  await liquidationKeeper.check();

  if (process.argv.includes("--run-once")) {
    console.log("[Startup] --run-once flag detected. Exiting cleanly.");
    process.exit(0);
  }

  console.log("[Startup] initial checks complete, scheduling cron jobs...\n");

  cron.schedule("0 */6 * * *", () => {
    oracleRunner.run().catch((err) => console.error("[OracleRunner] cron error:", err));
  });

  cron.schedule("*/5 * * * *", () => {
    liquidationKeeper.check().catch((err) => console.error("[LiquidationKeeper] cron error:", err));
  });

  console.log("Cron scheduled:");
  console.log("  OracleRunner:     every 6 hours (at :00)");
  console.log("  LiquidationKeeper: every 5 minutes");
  console.log("\nRunning. Press Ctrl+C to stop.");
}

startup().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("\n[Oracle] SIGTERM received, shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n[Oracle] SIGINT received, shutting down...");
  process.exit(0);
});
