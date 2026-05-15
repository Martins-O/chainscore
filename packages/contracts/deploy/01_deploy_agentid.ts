import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const AgentID = await ethers.getContractFactory("AgentID");
  const agentID = await AgentID.deploy(deployer.address);
  await agentID.waitForDeployment();

  const address = await agentID.getAddress();
  console.log(`\nAgentID deployed at: ${address}`);

  const deploymentsPath = path.resolve(__dirname, "../deployments.json");
  let deployments: Record<string, string> = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deployments.AgentID = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Address saved to deployments.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
