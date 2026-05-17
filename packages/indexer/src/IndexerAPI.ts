import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import express from "express";
import cors from "cors";
import type { IndexerConfig } from "./Indexer.js";
import * as dotenv from "dotenv";

dotenv.config();

export class IndexerAPI {
  private app: express.Application;
  private latestBlock = 0;

  constructor(
    private prisma: PrismaClient,
    private provider: ethers.JsonRpcProvider,
    private config: IndexerConfig
  ) {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get("/wallet/:address", async (req, res) => {
      try {
        const address = req.params.address.toLowerCase();
        const wallet = await this.prisma.walletHistory.findUnique({
          where: { id: address },
          include: { dailyTxCounts: true },
        });
        if (!wallet) {
          res.status(404).json({ error: "Wallet not found" });
          return;
        }
        res.json(wallet);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get("/loans/active", async (req, res) => {
      try {
        const borrowEvents = await this.prisma.loanEvent.findMany({
          where: { type: "borrow" },
          orderBy: { blockNumber: "desc" },
        });

        const closedEvents = await this.prisma.loanEvent.findMany({
          where: { type: { in: ["repay", "liquidate"] } },
          select: { loanId: true },
        });
        const closedIds = new Set(closedEvents.map((e) => e.loanId.toString()));

        const active = borrowEvents.filter(
          (e) => !closedIds.has(e.loanId.toString())
        );
        res.json(active);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get("/loans/:loanId", async (req, res) => {
      try {
        const events = await this.prisma.loanEvent.findMany({
          where: { loanId: BigInt(req.params.loanId) },
          orderBy: { blockNumber: "asc" },
        });
        if (events.length === 0) {
          res.status(404).json({ error: "Loan not found" });
          return;
        }
        res.json(events);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get("/health", async (_req, res) => {
      let block = this.latestBlock;
      if (block === 0) {
        try {
          block = await this.provider.getBlockNumber();
        } catch {}
      }
      res.json({
        status: "ok",
        latestBlock: block,
        rpcUrl: this.config.rpcUrl,
        agentIdAddress: this.config.agentIdAddress,
        lendingVaultAddress: this.config.lendingVaultAddress,
        collateralTokens: this.config.collateralTokens.map((t) => t.symbol),
      });
    });
  }

  setLatestBlock(block: number): void {
    this.latestBlock = block;
  }

  listen(port = 3005): void {
    this.app.listen(port, () => {
      console.log(`Indexer API listening on http://localhost:${port}`);
    });
  }
}

if (process.argv[1] && (process.argv[1].endsWith("IndexerAPI.ts") || process.argv[1].endsWith("IndexerAPI.js"))) {
  const rpcUrl = process.env.RH_CHAIN_RPC_URL;
  const agentIdAddress = process.env.AGENT_ID_ADDRESS || process.env.AGENTID_ADDRESS;
  const lendingVaultAddress = process.env.LENDING_VAULT_ADDRESS || process.env.LENDINGVAULT_ADDRESS;
  const tslaAddress = process.env.TSLA_ADDRESS || process.env.TSLA_TOKEN;
  const amznAddress = process.env.AMZN_ADDRESS || process.env.AMZN_TOKEN;

  if (!rpcUrl || !agentIdAddress || !lendingVaultAddress) {
    console.error(
      "Missing required env vars: RH_CHAIN_RPC_URL, AGENT_ID_ADDRESS, LENDING_VAULT_ADDRESS"
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const collateralTokens: { address: string; symbol: string }[] = [];
  if (tslaAddress) collateralTokens.push({ address: tslaAddress, symbol: "TSLA" });
  if (amznAddress) collateralTokens.push({ address: amznAddress, symbol: "AMZN" });

  const api = new IndexerAPI(prisma, provider, {
    rpcUrl,
    agentIdAddress,
    lendingVaultAddress,
    collateralTokens,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  api.listen(port);
}
