import { type Chain } from "viem";

export const robinhoodTestnet = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
} as const satisfies Chain;

export const ADDRESSES = {
  AgentID:       (process.env.NEXT_PUBLIC_AGENTID_ADDRESS       || "0x5FbDB2315678afecb367f032d93F642f64180aa3") as `0x${string}`,
  ScoreEngine:   (process.env.NEXT_PUBLIC_SCOREENGINE_ADDRESS   || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as `0x${string}`,
  LendingVault:  (process.env.NEXT_PUBLIC_LENDINGVAULT_ADDRESS  || "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853") as `0x${string}`,
  USDC:          (process.env.NEXT_PUBLIC_USDC_ADDRESS          || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9") as `0x${string}`,
  TSLA_TOKEN:    (process.env.NEXT_PUBLIC_TSLA_ADDRESS          || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9") as `0x${string}`,
  AMZN_TOKEN:    (process.env.NEXT_PUBLIC_AMZN_ADDRESS          || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707") as `0x${string}`,
  PRICE_ORACLE:  (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS  || "0x0165878A594ca255338adfa4d48449f69242Eb8F") as `0x${string}`,
} as const;

export const AGENTID_ABI = [
  {
    type: "function",
    name: "tokenOfOwner",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mintIdentity",
    inputs: [],
    outputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

export const SCORE_ABI = [
  {
    type: "function",
    name: "getScore",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "score", type: "uint16", internalType: "uint16" },
      { name: "updatedAt", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getScoreHistory",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "score", type: "uint16", internalType: "uint16" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLTV",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "ltv", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const LENDING_ABI = [
  {
    type: "function",
    name: "borrow",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "collateralToken", type: "address", internalType: "address" },
      { name: "collateralAmt", type: "uint256", internalType: "uint256" },
      { name: "borrowAmt", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "loanId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "repay",
    inputs: [
      { name: "loanId", type: "uint256", internalType: "uint256" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "liquidate",
    inputs: [{ name: "loanId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getHealthFactor",
    inputs: [{ name: "loanId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "healthFactor", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "usdcAmount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "usdc",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Borrowed",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "agentId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "collateral", type: "address", indexed: false, internalType: "address" },
      { name: "collateralAmt", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "borrowAmt", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "remaining", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "liquidator", type: "address", indexed: true, internalType: "address" },
      { name: "collateralSeized", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
] as const;

export const PRICE_ORACLE_ABI = [
  {
    type: "function",
    name: "getPrice",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
