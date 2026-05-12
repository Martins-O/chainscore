# AGENTS.md — ChainScore Project Context

> This file is the single source of truth for Claude Code.
> Read this fully before writing any code, running any command, or making any decision.
> When in doubt, refer back to this file.

---

## What We Are Building

**ChainScore** is an on-chain credit scoring protocol for AI agents and wallets on Robinhood Chain.

It has three layers:

1. **AgentID** — a soulbound (non-transferable) ERC-721 NFT that anchors a wallet's permanent on-chain identity
2. **ScoreEngine** — an oracle-fed contract that stores a credit score (300–850) per agent, and returns an LTV percentage based on the score
3. **LendingVault** — a USDC lending pool where borrowers deposit tokenized stocks (TSLA, AMZN) as collateral and borrow USDC, with their maximum LTV determined by their credit score

The product creates a flywheel: borrow → repay → score improves → better LTV → cheaper borrowing → more on-chain activity.

**Hackathon:** Arbitrum Open House London Buildathon  
**Submission deadline:** June 14, 2026  
**Prize targets:** Open Category (1st: $40K) + Agentic Category ($15K)  
**Primary chain:** Robinhood Chain testnet  
**Secondary chain:** Arbitrum Sepolia (AgentID cross-chain)

---

## Repository Structure

```
chainscore/
├── AGENTS.md                  ← you are here
├── packages/
│   ├── contracts/             ← Solidity smart contracts
│   │   ├── src/
│   │   │   ├── AgentID.sol
│   │   │   ├── ScoreEngine.sol
│   │   │   └── LendingVault.sol
│   │   ├── test/
│   │   ├── deploy/
│   │   ├── hardhat.config.ts
│   │   └── package.json
│   ├── indexer/               ← On-chain data indexer (The Graph or custom)
│   │   ├── schema.graphql     ← if using The Graph
│   │   ├── subgraph.yaml
│   │   ├── src/mappings.ts
│   │   └── package.json
│   ├── oracle/                ← Off-chain score computation + oracle writer
│   │   ├── src/
│   │   │   ├── ScoreComputer.ts
│   │   │   ├── OracleRunner.ts
│   │   │   └── LiquidationKeeper.ts
│   │   ├── test/
│   │   └── package.json
│   ├── api/                   ← REST API for frontend
│   │   ├── src/
│   │   └── package.json
│   └── frontend/              ← Next.js dashboard
│       ├── app/
│       ├── components/
│       └── package.json
├── turbo.json
└── package.json
```

---

## Smart Contracts

### AgentID.sol

**Purpose:** Soulbound identity NFT. One per address. Non-transferable. The anchor for all scoring data.

**Key rules:**
- `_beforeTokenTransfer` MUST revert for any transfer where `from != address(0)` (i.e., allow mint only)
- One token per address enforced via `hasMinted` mapping
- Owner can register up to 5 linked wallets (all activity from linked wallets counts toward score)
- Deployed to: Robinhood Chain testnet AND Arbitrum Sepolia

**Interface:**
```solidity
function mintIdentity() external returns (uint256 tokenId)
function registerWallet(address wallet) external
function revokeWallet(address wallet) external
function getLinkedWallets(uint256 tokenId) external view returns (address[] memory)
function createdAt(uint256 tokenId) external view returns (uint256 timestamp)
function tokenOfOwner(address owner) external view returns (uint256 tokenId)
```

**Events:**
```solidity
event IdentityMinted(uint256 indexed tokenId, address indexed owner, uint256 timestamp)
event WalletRegistered(uint256 indexed tokenId, address indexed wallet)
event WalletRevoked(uint256 indexed tokenId, address indexed wallet)
```

**Custom errors:**
```solidity
error AlreadyHasIdentity()
error TransferNotAllowed()
error MaxWalletsReached()
error WalletNotLinked()
error NotTokenOwner()
```

---

### ScoreEngine.sol

**Purpose:** Stores and exposes credit scores. Oracle-fed. Score drives LTV in LendingVault.

**Score bands → LTV mapping:**
| Score Range | LTV |
|---|---|
| 300 – 499 | 50% |
| 500 – 599 | 60% |
| 600 – 699 | 70% |
| 700 – 799 | 78% |
| 800 – 850 | 85% |

**Key rules:**
- Only trusted oracle addresses can call `updateScore()`
- 24-hour cooldown between score updates per agentId
- Store last 10 scores per agentId for history chart
- `dataHash` is `keccak256(abi.encode(rawInputs))` — makes score auditable
- New agentIds start with a default score of 350 (set on first oracle update)

**Interface:**
```solidity
function updateScore(uint256 agentId, uint16 score, bytes32 dataHash) external
function getScore(uint256 agentId) external view returns (uint16 score, uint256 updatedAt)
function getLTV(uint256 agentId) external view returns (uint256 ltv)
function getScoreHistory(uint256 agentId) external view returns (ScoreSnapshot[] memory)
function addOracle(address oracle) external onlyOwner
function removeOracle(address oracle) external onlyOwner
```

**Events:**
```solidity
event ScoreUpdated(uint256 indexed agentId, uint16 oldScore, uint16 newScore, bytes32 dataHash, uint256 timestamp)
event OracleAdded(address indexed oracle)
event OracleRemoved(address indexed oracle)
```

**Custom errors:**
```solidity
error NotOracle()
error CooldownActive(uint256 nextUpdateAt)
error InvalidScore(uint16 score)
error AgentNotRegistered()
```

---

### LendingVault.sol

**Purpose:** USDC lending pool. Borrowers use tokenized stock collateral. LTV is score-gated.

**Key rules:**
- Lenders deposit USDC, receive vault shares (ERC-20 receipt token)
- Borrowers must have a valid AgentID to borrow
- `maxBorrow = collateralValueUSD * ScoreEngine.getLTV(agentId) / 100`
- Interest rate: 8% APR, accrues per block
- Liquidation threshold: health factor < 110% (collateralValue / loanValue < 1.10)
- Anyone can call `liquidate()` on an unhealthy loan (liquidator gets 5% bonus)
- Collateral tokens whitelist: only approved tokenized stocks accepted

**Constructor params:**
```solidity
constructor(
  address _usdc,
  address _scoreEngine,
  address _agentId,
  address _priceOracle
)
```

**Interface:**
```solidity
function deposit(uint256 usdcAmount) external                          // lender deposits
function withdraw(uint256 shares) external                             // lender redeems
function borrow(uint256 agentId, address collateralToken, uint256 collateralAmt, uint256 borrowAmt) external returns (uint256 loanId)
function repay(uint256 loanId, uint256 amount) external
function liquidate(uint256 loanId) external
function getHealthFactor(uint256 loanId) external view returns (uint256)
function addCollateralToken(address token, address priceFeed) external onlyOwner
```

**Events:**
```solidity
event Deposited(address indexed lender, uint256 amount, uint256 shares)
event Withdrawn(address indexed lender, uint256 shares, uint256 amount)
event Borrowed(uint256 indexed loanId, uint256 indexed agentId, address collateral, uint256 collateralAmt, uint256 borrowAmt)
event Repaid(uint256 indexed loanId, uint256 amount, uint256 remaining)
event Liquidated(uint256 indexed loanId, address indexed liquidator, uint256 collateralSeized)
```

**Custom errors:**
```solidity
error NoAgentIdentity()
error ExceedsMaxLTV(uint256 requested, uint256 maxAllowed)
error InsufficientLiquidity()
error LoanNotLiquidatable(uint256 healthFactor)
error CollateralNotWhitelisted()
error LoanNotFound()
```

---

## Scoring Formula

Computed off-chain by `ScoreComputer.ts`, written on-chain by the oracle.

```
score = 300 + (
  repaymentScore    × 0.35 +   // 0–100: % of loans repaid on time
  stabilityScore    × 0.25 +   // 0–100: how steadily wallet holds positions
  walletAgeScore    × 0.15 +   // 0–100: normalized age (365 days = 100)
  consistencyScore  × 0.15 +   // 0–100: regular vs sporadic activity
  diversScore       × 0.10     // 0–100: 1 token=20, 2=50, 3+=100
) × 5.5
```

Result always clamped to [300, 850].

**Anti-gaming rules (must be enforced in ScoreComputer.ts):**
1. Wallet age is time-weighted: wallets under 7 days old get a 0 on all factors
2. Minimum 7-day cooldown before first borrow after minting AgentID (enforced in LendingVault)
3. Wash-trading detection: if >60% of token transfers are between linked wallets with no net position change, stabilityScore is zeroed
4. High-frequency micro-trades (>50 txs/day for 3+ days) reduce consistencyScore by 50%

---

## Indexer

**Goal:** Build a queryable data layer for wallet history on Robinhood Chain.

**Check first:** Does The Graph support Robinhood Chain testnet?
- Yes → use The Graph subgraph (schema.graphql + mappings.ts)
- No → use custom indexer: TypeScript + ethers.js + Postgres via Prisma

**Entities needed:**
```graphql
type WalletHistory {
  id: ID!                    # wallet address
  firstTxTimestamp: BigInt!
  txCount: Int!
  loanCount: Int!
  repaymentCount: Int!
  defaultCount: Int!
  tokenBalances: [TokenBalance!]!
  dailyTxCounts: [DailyCount!]!  # for consistency scoring
  transferCountBetweenLinked: Int!  # for wash-trade detection
}

type LoanEvent {
  id: ID!
  loanId: BigInt!
  agentId: BigInt!
  type: String!   # "borrow" | "repay" | "liquidate"
  amount: BigInt!
  timestamp: BigInt!
}
```

---

## Oracle Service

**OracleRunner.ts** — runs every 6 hours via cron.

Logic:
1. Fetch all minted AgentIDs from AgentID contract
2. For each agentId, get linked wallets
3. Query indexer for WalletHistory of all linked wallets
4. Run ScoreComputer.compute(history) → score 300–850
5. If score differs from on-chain score by >5 points AND cooldown has passed → call ScoreEngine.updateScore()
6. Log all updates to local DB (feeds the dashboard history chart)

**LiquidationKeeper.ts** — runs every 5 minutes via cron.

Logic:
1. Fetch all active loans from LendingVault
2. For each loan, get current collateral price from Robinhood Chain price oracle
3. Calculate health factor = (collateralValueUSD × 100) / loanValueUSD
4. If health factor < 110 → call LendingVault.liquidate(loanId)
5. Circuit breaker: pause if 3 consecutive RPC errors

---

## Frontend Pages

### `/` — Score Profile (primary page)
- Connect wallet button (wagmi + RainbowKit)
- If no AgentID: "Mint your identity" CTA
- If has AgentID: large score display (SVG animated ring, 300–850, color-coded)
- Factor breakdown bars (5 factors with weights)
- Score history line chart (last 30 days)
- Score Simulator widget (pure JS, no chain call)

### `/borrow`
- Show user's current score and LTV
- Input: collateral token (dropdown: TSLA, AMZN), collateral amount
- Live calculation: max borrow = collateralValue × LTV / 100
- "Borrow USDC" button → triggers LendingVault.borrow()
- Active loans table with health factor

### `/lend`
- Input: USDC deposit amount
- Show: current pool utilization, APY (8% × utilization rate)
- "Deposit" button → triggers LendingVault.deposit()
- Your position: shares owned, redeemable USDC

### `/admin` (oracle operator only)
- Manual score refresh trigger
- Oracle wallet balance
- Last 20 oracle updates log
- Liquidation keeper status

---

## Chain Configuration

### Robinhood Chain Testnet
```typescript
const robinhoodTestnet = {
  id: /* look up from official Robinhood Chain docs */,
  name: 'Robinhood Chain Testnet',
  rpcUrls: { default: { http: ['/* from docs */'] } },
  blockExplorers: { default: { url: '/* from docs */' } },
  testnet: true,
}
```

> ⚠️ Always fetch the official chainId and RPC URL from Robinhood Chain documentation. Do not hardcode guesses.

### Arbitrum Sepolia (AgentID secondary deployment)
```typescript
chainId: 421614
rpc: 'https://sepolia-rollup.arbitrum.io/rpc'
```

### Contract Addresses (fill in as you deploy)
```typescript
// Robinhood Chain Testnet
export const ADDRESSES = {
  AgentID:       '',   // fill after deploy
  ScoreEngine:   '',   // fill after deploy
  LendingVault:  '',   // fill after deploy
  USDC:          '',   // testnet USDC address
  TSLA_TOKEN:    '',   // Robinhood Chain tokenized TSLA
  AMZN_TOKEN:    '',   // Robinhood Chain tokenized AMZN
  PRICE_ORACLE:  '',   // Robinhood Chain price oracle
}
```

---

## Code Standards

### Solidity
- Version: `^0.8.24`
- Every function must have NatSpec (`@notice`, `@param`, `@return`)
- Use custom errors everywhere (no `require(condition, "string")`)
- Emit events for every state change
- No magic numbers — use named constants
- All external calls go after state changes (checks-effects-interactions)
- Use OpenZeppelin for ERC-20, ERC-721, Ownable, ReentrancyGuard

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any` — use proper types or generics
- All async functions must have try/catch
- Use Zod for all external data validation (API responses, contract return values)
- ethers.js v6 for contract interaction

### Testing
- Contracts: Hardhat + Chai. Minimum 80% coverage.
- TypeScript: Vitest. Every ScoreComputer edge case must have a test.
- Always test: happy path, zero values, max values, unauthorized caller, reentrancy attempt

### Git
- Commit after each logical unit of work
- Commit message format: `feat(contracts): add AgentID soulbound transfer check`
- Never commit: private keys, `.env` files, node_modules

---

## Environment Variables

Create `.env` in repo root. Never commit this file.

```bash
# Oracle wallet (funded with testnet ETH on Robinhood Chain)
ORACLE_PRIVATE_KEY=

# Deployer wallet
DEPLOYER_PRIVATE_KEY=

# RPC URLs
RH_CHAIN_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Indexer (if using Postgres fallback)
DATABASE_URL=postgresql://localhost:5432/chainscore

# The Graph (if supported)
SUBGRAPH_URL=

# Frontend
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
```

---

## Known Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| The Graph doesn't support Robinhood Chain | Medium | Use custom ethers.js + Postgres indexer as fallback |
| Robinhood Chain RPC instability | Low | Retry with exponential backoff, fallback RPC |
| Score gaming via linked wallets | Medium | Wash-trade detection in ScoreComputer |
| LendingVault insolvency on mass liquidation | Low | Health factor threshold at 110% (not 100%), liquidator incentive at 5% |
| Oracle key compromise | Low | Oracle can only call updateScore(), no fund access |

---

## Demo Requirements (for hackathon submission)

The live demo MUST show all of the following:

1. A wallet minting an AgentID on Robinhood Chain testnet
2. The ScoreEngine returning a score for that wallet
3. The LendingVault accepting a borrow at an LTV determined by the score
4. A repayment → score improvement loop (even if triggered manually for demo)
5. The frontend Score Simulator showing projected score changes

**Contract verification:** All 3 contracts must be verified on Robinhood Chain block explorer before submission.

**Demo video:** 3 minutes max. Show the live dashboard, not slides.

---

## Do Not

- Do not use `WidthType.PERCENTAGE` anywhere
- Do not use `any` in TypeScript
- Do not hardcode the Robinhood Chain chainId without checking the official docs
- Do not deploy unverified contracts to testnet
- Do not store private keys anywhere in the codebase
- Do not skip events on state changes
- Do not use `transfer()` or `send()` for ETH — use `call{value: ...}("")`
- Do not assume The Graph supports Robinhood Chain — check first
- Do not write a commit without running tests first
