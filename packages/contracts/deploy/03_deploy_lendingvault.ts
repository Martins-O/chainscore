import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const vaultAddressesPath = path.resolve(__dirname, "../deployments.json");
  const deployments: Record<string, string> = fs.existsSync(vaultAddressesPath)
    ? JSON.parse(fs.readFileSync(vaultAddressesPath, "utf8"))
    : {};

  const usdc = deployments.USDC || "";
  const scoreEngine = deployments.ScoreEngine || "";
  const agentId = deployments.AgentID || "";
  // TODO: Get Robinhood Chain price oracle address from docs
  const priceOracle = deployments.PRICE_ORACLE || "";

  if (!usdc || !scoreEngine || !agentId || !priceOracle) {
    console.warn(
      "Warning: Some dependencies are missing from deployments.json. " +
      "USDC, ScoreEngine, AgentID, and priceOracle addresses must be set."
    );
  }

  const LendingVault = await ethers.getContractFactory("LendingVault");
  const vault = await LendingVault.deploy(usdc, scoreEngine, agentId, priceOracle);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log(`\nLendingVault deployed at: ${address}`);

  // TODO: Get actual TSLA and AMZN token addresses from Robinhood Chain docs
  // await vault.addCollateralToken(TSLA_TOKEN_ADDRESS);
  // await vault.addCollateralToken(AMZN_TOKEN_ADDRESS);
  // console.log("TSLA and AMZN added as collateral tokens");

  deployments.LendingVault = address;
  fs.writeFileSync(vaultAddressesPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Address saved to deployments.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
