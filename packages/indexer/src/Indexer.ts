import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { IndexerAPI } from "./IndexerAPI.js";

dotenv.config();

const AGENTID_ABI = [
  "event IdentityMinted(uint256 indexed tokenId, address indexed owner, uint256 timestamp)",
  "event WalletRegistered(uint256 indexed tokenId, address indexed wallet)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwner(address owner) view returns (uint256)",
  "function getLinkedWallets(uint256 tokenId) view returns (address[])",
];

const VAULT_ABI = [
  "event Borrowed(uint256 indexed loanId, uint256 indexed agentId, address collateral, uint256 collateralAmt, uint256 borrowAmt)",
  "event Repaid(uint256 indexed loanId, uint256 amount, uint256 remaining)",
  "event Liquidated(uint256 indexed loanId, address indexed liquidator, uint256 collateralSeized)",
];

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const POLL_INTERVAL_MS = 2000;
const BLOCK_CHUNK_SIZE = 1000;

export interface IndexerConfig {
  rpcUrl: string;
  agentIdAddress: string;
  lendingVaultAddress: string;
  collateralTokens: { address: string; symbol: string }[];
}

function getDateString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export class Indexer {
  private prisma: PrismaClient;
  private provider: ethers.JsonRpcProvider;
  private api: IndexerAPI;
  private agentIdContract: ethers.Contract;
  private vaultContract: ethers.Contract;
  private running = false;
  private checkpoint = 0;
  private tokenSymbolMap = new Map<string, string>();

  constructor(private config: IndexerConfig) {
    this.prisma = new PrismaClient();
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });
    this.agentIdContract = new ethers.Contract(
      config.agentIdAddress.toLowerCase(),
      AGENTID_ABI,
      this.provider
    );
    this.vaultContract = new ethers.Contract(
      config.lendingVaultAddress.toLowerCase(),
      VAULT_ABI,
      this.provider
    );
    for (const t of config.collateralTokens) {
      this.tokenSymbolMap.set(t.address.toLowerCase(), t.symbol);
    }
    this.api = new IndexerAPI(this.prisma, this.provider, this.config);
  }

  async start(): Promise<void> {
    const state = await this.prisma.indexerState.findUnique({
      where: { id: "main" },
    });
    this.checkpoint = state?.lastBlock ?? (this.config.rpcUrl.includes("127.0.0.1") || this.config.rpcUrl.includes("localhost") ? 0 : 55783000);
    this.api.listen(3005);
    this.running = true;
    console.log(`[Indexer] starting from block ${this.checkpoint}...`);

    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        console.error("[Indexer] poll error:", err);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.prisma.$disconnect();
  }

  private async poll(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    this.api.setLatestBlock(currentBlock);
    if (currentBlock <= this.checkpoint) return;

    const from = this.checkpoint + 1;
    const to = Math.min(from + BLOCK_CHUNK_SIZE - 1, currentBlock);

    const tokenAddresses = this.config.collateralTokens.map((t) => t.address);
    const allAddresses = [
      this.config.agentIdAddress,
      this.config.lendingVaultAddress,
      ...tokenAddresses,
    ];

    const logs = await this.provider.getLogs({
      address: allAddresses,
      fromBlock: from,
      toBlock: to,
    });

    const agentIDIface = new ethers.Interface(AGENTID_ABI);
    const vaultIface = new ethers.Interface(VAULT_ABI);
    const erc20Iface = new ethers.Interface(ERC20_ABI);

    for (const log of logs) {
      const addr = log.address.toLowerCase();

      if (addr === this.config.agentIdAddress.toLowerCase()) {
        const parsed = agentIDIface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (!parsed) continue;
        await this.routeAgentIDEvent(parsed, log.blockNumber);
      } else if (addr === this.config.lendingVaultAddress.toLowerCase()) {
        const parsed = vaultIface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (!parsed) continue;
        await this.routeVaultEvent(parsed, log.blockNumber, log.transactionHash);
      } else if (this.tokenSymbolMap.has(addr)) {
        const parsed = erc20Iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (!parsed) continue;
        await this.handleTransfer(
          (parsed.args.from as string).toLowerCase(),
          (parsed.args.to as string).toLowerCase(),
          addr,
          log.blockNumber
        );
      }
    }

    const highestBlock =
      logs.length > 0
        ? Math.max(...logs.map((l) => l.blockNumber))
        : to;
    this.checkpoint = highestBlock;
    await this.prisma.indexerState.upsert({
      where: { id: "main" },
      create: { id: "main", lastBlock: highestBlock },
      update: { lastBlock: highestBlock },
    });
  }

  private async routeAgentIDEvent(
    parsed: ethers.LogDescription,
    blockNumber: number
  ): Promise<void> {
    if (parsed.name === "IdentityMinted") {
      const owner = (parsed.args.owner as string).toLowerCase();
      const timestamp = Number(parsed.args.timestamp);

      const exists = await this.prisma.walletHistory.findUnique({
        where: { id: owner },
      });
      if (!exists) {
        await this.prisma.walletHistory.create({
          data: {
            id: owner,
            firstTxTimestamp: BigInt(timestamp),
            tokenBalances: [],
          },
        });
        console.log(`  IdentityMinted: ${owner}`);
      }
    }
  }

  private async routeVaultEvent(
    parsed: ethers.LogDescription,
    blockNumber: number,
    txHash: string
  ): Promise<void> {
    const block = await this.provider.getBlock(blockNumber);
    const timestamp = BigInt(block?.timestamp ?? 0);

    if (parsed.name === "Borrowed") {
      const agentId = BigInt(parsed.args.agentId);
      const loanId = BigInt(parsed.args.loanId);
      const collateral = parsed.args.collateral as string;
      const collateralAmt = BigInt(parsed.args.collateralAmt);
      const borrowAmt = BigInt(parsed.args.borrowAmt);

      let owner: string;
      try {
        owner = ((await this.agentIdContract.ownerOf(agentId)) as string).toLowerCase();
      } catch {
        console.warn(`  Borrowed: cannot resolve owner for agentId ${agentId}`);
        return;
      }

      await this.prisma.loanEvent.create({
        data: {
          loanId,
          agentId,
          type: "borrow",
          amount: borrowAmt,
          collateral: collateralAmt,
          collateralToken: collateral.toLowerCase(),
          timestamp,
          txHash,
          blockNumber,
        },
      });
      await this.prisma.walletHistory.upsert({
        where: { id: owner },
        create: {
          id: owner,
          firstTxTimestamp: timestamp,
          loanCount: 1,
          tokenBalances: [],
        },
        update: { loanCount: { increment: 1 } },
      });
    } else if (parsed.name === "Repaid") {
      const loanId = BigInt(parsed.args.loanId);
      const amount = BigInt(parsed.args.amount);

      const borrow = await this.prisma.loanEvent.findFirst({
        where: { loanId, type: "borrow" },
        orderBy: { blockNumber: "desc" },
      });
      if (!borrow) return;

      await this.prisma.loanEvent.create({
        data: {
          loanId,
          agentId: borrow.agentId,
          type: "repay",
          amount,
          timestamp,
          txHash,
          blockNumber,
        },
      });

      try {
        const owner = ((await this.agentIdContract.ownerOf(borrow.agentId)) as string).toLowerCase();
        await this.prisma.walletHistory.update({
          where: { id: owner },
          data: { repaymentCount: { increment: 1 } },
        });
      } catch {}
    } else if (parsed.name === "Liquidated") {
      const loanId = BigInt(parsed.args.loanId);
      const collateralSeized = BigInt(parsed.args.collateralSeized);

      const borrow = await this.prisma.loanEvent.findFirst({
        where: { loanId, type: "borrow" },
        orderBy: { blockNumber: "desc" },
      });
      if (!borrow) return;

      await this.prisma.loanEvent.create({
        data: {
          loanId,
          agentId: borrow.agentId,
          type: "liquidate",
          amount: collateralSeized,
          timestamp,
          txHash,
          blockNumber,
        },
      });

      try {
        const owner = ((await this.agentIdContract.ownerOf(borrow.agentId)) as string).toLowerCase();
        await this.prisma.walletHistory.update({
          where: { id: owner },
          data: { defaultCount: { increment: 1 } },
        });
      } catch {}
    }
  }

  private async handleTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    blockNumber: number
  ): Promise<void> {
    if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) return;

    const block = await this.provider.getBlock(blockNumber);
    const timestamp = block?.timestamp ?? 0;
    const dateStr = getDateString(timestamp);

    const updater = async (addr: string, isReceiver: boolean) => {
      const wallet = await this.prisma.walletHistory.findUnique({
        where: { id: addr },
      });
      if (!wallet) return;

      await this.prisma.walletHistory.update({
        where: { id: addr },
        data: {
          txCount: { increment: 1 },
          totalTransfers: { increment: 1 },
        },
      });

      await this.prisma.dailyTxCount.upsert({
        where: { walletId_date: { walletId: addr, date: dateStr } },
        create: { date: dateStr, walletId: addr, count: 1 },
        update: { count: { increment: 1 } },
      });

      const balances: { token: string; balance: string }[] =
        (wallet.tokenBalances as { token: string; balance: string }[]) ?? [];
      if (balances.length === 0 && !isReceiver) return;

      const ts = tokenAddress.toLowerCase();
      const idx = balances.findIndex((b) => b.token.toLowerCase() === ts);
      const tokenBalance = idx >= 0 ? BigInt(balances[idx].balance) : 0n;

      if (isReceiver) {
        const newBalance = (tokenBalance + 1n).toString();
        if (idx >= 0) {
          balances[idx].balance = newBalance;
        } else {
          balances.push({ token: ts, balance: newBalance });
        }
      } else {
        const newBalance = tokenBalance - 1n;
        if (newBalance <= 0n) {
          if (idx >= 0) balances.splice(idx, 1);
        } else {
          balances[idx].balance = newBalance.toString();
        }
      }

      await this.prisma.walletHistory.update({
        where: { id: addr },
        data: { tokenBalances: balances },
      });
    };

    await Promise.all([updater(from, false), updater(to, true)]);

    const [fromWallet, toWallet] = await Promise.all([
      this.prisma.walletHistory.findUnique({ where: { id: from } }),
      this.prisma.walletHistory.findUnique({ where: { id: to } }),
    ]);
    if (!fromWallet || !toWallet) return;

    const ownerA = await this.resolveLinkedOwner(from);
    const ownerB = await this.resolveLinkedOwner(to);
    if (ownerA && ownerB && ownerA === ownerB) {
      await this.prisma.walletHistory.update({
        where: { id: ownerA },
        data: { transferCountBetweenLinked: { increment: 1 } },
      });
    }
  }

  private linkedOwnerCache = new Map<string, string | null>();

  private async resolveLinkedOwner(
    address: string
  ): Promise<string | null> {
    const cached = this.linkedOwnerCache.get(address);
    if (cached !== undefined) return cached;

    try {
      const tokenId = (await this.agentIdContract.tokenOfOwner(address)) as bigint;
      if (tokenId === 0n) {
        this.linkedOwnerCache.set(address, null);
        return null;
      }
      const owner = ((await this.agentIdContract.ownerOf(tokenId)) as string).toLowerCase();
      this.linkedOwnerCache.set(address, owner);

      const wallets = (await this.agentIdContract.getLinkedWallets(tokenId)) as string[];
      for (const w of wallets) {
        this.linkedOwnerCache.set(w.toLowerCase(), owner);
      }
      return owner;
    } catch {
      this.linkedOwnerCache.set(address, null);
      return null;
    }
  }
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RH_CHAIN_RPC_URL;
  const agentIdAddress = process.env.AGENTID_ADDRESS;
  const lendingVaultAddress = process.env.LENDINGVAULT_ADDRESS;
  const tslaAddress = process.env.TSLA_ADDRESS;
  const amznAddress = process.env.AMZN_ADDRESS;

  if (!rpcUrl || !agentIdAddress || !lendingVaultAddress) {
    console.error(
      "Missing env vars: RH_CHAIN_RPC_URL, AGENTID_ADDRESS, LENDINGVAULT_ADDRESS"
    );
    process.exit(1);
  }

  const collateralTokens: { address: string; symbol: string }[] = [];
  if (tslaAddress) collateralTokens.push({ address: tslaAddress, symbol: "TSLA" });
  if (amznAddress) collateralTokens.push({ address: amznAddress, symbol: "AMZN" });

  const indexer = new Indexer({
    rpcUrl,
    agentIdAddress,
    lendingVaultAddress,
    collateralTokens,
  });

  process.on("SIGINT", async () => {
    console.log("\n[Indexer] shutting down...");
    await indexer.stop();
    process.exit(0);
  });

  await indexer.start();
}

if (process.argv[1] && (process.argv[1].endsWith("Indexer.ts") || process.argv[1].endsWith("Indexer.js"))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
