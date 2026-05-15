import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
  const scoreEngine = await ScoreEngine.deploy(deployer.address);
  await scoreEngine.waitForDeployment();

  const address = await scoreEngine.getAddress();
  console.log(`\nScoreEngine deployed at: ${address}`);

  await scoreEngine.addOracle(deployer.address);
  console.log(`Deployer added as first oracle: ${deployer.address}`);

  const deploymentsPath = path.resolve(__dirname, "../deployments.json");
  let deployments: Record<string, string> = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deployments.ScoreEngine = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Address saved to deployments.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
