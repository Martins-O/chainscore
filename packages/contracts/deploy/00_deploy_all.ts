import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const deployerAddr = await deployer.getAddress();

  const balance = await ethers.provider.getBalance(deployer);
  console.log(`Deployer: ${deployerAddr}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  console.log(`Network:  ${(await ethers.provider.getNetwork()).name}\n`);

  const depPath = path.resolve(__dirname, "../deployments.json");
  let d: Record<string, string> = {};
  if (fs.existsSync(depPath)) d = JSON.parse(fs.readFileSync(depPath, "utf8"));

  if (!d.AgentID) {
    const c = await (await ethers.getContractFactory("AgentID", deployer)).deploy(deployerAddr);
    await c.waitForDeployment();
    d.AgentID = await c.getAddress();
    console.log(`AgentID:     ${d.AgentID}`);
  } else console.log(`AgentID:     ${d.AgentID} (cached)`);

  if (!d.ScoreEngine) {
    const c = await (await ethers.getContractFactory("ScoreEngine", deployer)).deploy(deployerAddr);
    await c.waitForDeployment();
    d.ScoreEngine = await c.getAddress();
    await (await ethers.getContractAt("ScoreEngine", d.ScoreEngine, deployer)).addOracle(deployerAddr);
    console.log(`ScoreEngine: ${d.ScoreEngine}`);
  } else console.log(`ScoreEngine: ${d.ScoreEngine} (cached)`);

  if (!d.USDC) {
    const c = await (await ethers.getContractFactory("MockUSDC", deployer)).deploy();
    await c.waitForDeployment();
    d.USDC = await c.getAddress();
    console.log(`USDC:        ${d.USDC}`);
  } else console.log(`USDC:        ${d.USDC} (cached)`);

  if (!d.TSLA_TOKEN) {
    const c = await (await ethers.getContractFactory("MockToken", deployer)).deploy("Mock TSLA", "TSLA");
    await c.waitForDeployment();
    d.TSLA_TOKEN = await c.getAddress();
    console.log(`TSLA:        ${d.TSLA_TOKEN}`);
  } else console.log(`TSLA:        ${d.TSLA_TOKEN} (cached)`);

  if (!d.AMZN_TOKEN) {
    const c = await (await ethers.getContractFactory("MockToken", deployer)).deploy("Mock AMZN", "AMZN");
    await c.waitForDeployment();
    d.AMZN_TOKEN = await c.getAddress();
    console.log(`AMZN:        ${d.AMZN_TOKEN}`);
  } else console.log(`AMZN:        ${d.AMZN_TOKEN} (cached)`);

  if (!d.PRICE_ORACLE) {
    const c = await (await ethers.getContractFactory("MockPriceOracle", deployer)).deploy();
    await c.waitForDeployment();
    d.PRICE_ORACLE = await c.getAddress();
    console.log(`PriceOracle: ${d.PRICE_ORACLE}`);
  } else console.log(`PriceOracle: ${d.PRICE_ORACLE} (cached)`);

  if (!d.LendingVault) {
    const c = await (await ethers.getContractFactory("LendingVault", deployer)).deploy(
      d.USDC, d.ScoreEngine, d.AgentID, d.PRICE_ORACLE);
    await c.waitForDeployment();
    d.LendingVault = await c.getAddress();
    console.log(`LendingVault: ${d.LendingVault}`);
  } else console.log(`LendingVault: ${d.LendingVault} (cached)`);

  const vault = await ethers.getContractAt("LendingVault", d.LendingVault, deployer);
  if (!(await vault.whitelistedCollateral(d.TSLA_TOKEN))) {
    await (await vault.addCollateralToken(d.TSLA_TOKEN)).wait();
    console.log(`TSLA whitelisted`);
  }
  if (!(await vault.whitelistedCollateral(d.AMZN_TOKEN))) {
    await (await vault.addCollateralToken(d.AMZN_TOKEN)).wait();
    console.log(`AMZN whitelisted`);
  }

  fs.writeFileSync(depPath, JSON.stringify(d, null, 2) + "\n");
  console.log(`\nSaved to deployments.json`);
  for (const [k, v] of Object.entries(d)) console.log(`  ${k}: ${v}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
