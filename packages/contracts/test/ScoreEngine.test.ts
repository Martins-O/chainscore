import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("ScoreEngine", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [deployer, oracle, bob, carol] = signers;
    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    const scoreEngine = await ScoreEngine.deploy(deployer.address);
    await scoreEngine.waitForDeployment();
    await scoreEngine.addOracle(oracle.address);
    return { scoreEngine, deployer, oracle, bob, carol };
  }

  const dataHash = ethers.id("test-data");

  describe("updateScore - authorization", function () {
    it("reverts NotOracle when called by non-oracle", async function () {
      const { scoreEngine, bob } = await loadFixture(deployFixture);

      await expect(
        scoreEngine.connect(bob).updateScore(1, 500, dataHash)
      ).to.be.revertedWithCustomError(scoreEngine, "NotOracle");
    });
  });

  describe("updateScore - validation", function () {
    it("reverts InvalidScore when score is below 300 or above 850", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      await expect(
        scoreEngine.connect(oracle).updateScore(1, 299, dataHash)
      ).to.be.revertedWithCustomError(scoreEngine, "InvalidScore");

      await expect(
        scoreEngine.connect(oracle).updateScore(1, 851, dataHash)
      ).to.be.revertedWithCustomError(scoreEngine, "InvalidScore");
    });
  });

  describe("updateScore - cooldown", function () {
    it("reverts CooldownActive when called twice within 24h", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      await scoreEngine.connect(oracle).updateScore(1, 500, dataHash);

      await expect(
        scoreEngine.connect(oracle).updateScore(1, 600, dataHash)
      ).to.be.revertedWithCustomError(scoreEngine, "CooldownActive");

      await time.increase(24 * 60 * 60 + 1);

      await expect(
        scoreEngine.connect(oracle).updateScore(1, 600, dataHash)
      ).to.not.be.reverted;
    });
  });

  describe("updateScore - success", function () {
    it("succeeds and emits ScoreUpdated with correct args", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      const tx = await scoreEngine.connect(oracle).updateScore(42, 720, dataHash);

      await expect(tx)
        .to.emit(scoreEngine, "ScoreUpdated")
        .withArgs(42n, 350, 720, dataHash, anyValue);
    });
  });

  describe("getScore", function () {
    it("returns (350, 0) for a never-updated agent", async function () {
      const { scoreEngine } = await loadFixture(deployFixture);

      const [score, updatedAt] = await scoreEngine.getScore(999);
      expect(score).to.equal(350);
      expect(updatedAt).to.equal(0n);
    });
  });

  describe("getLTV", function () {
    it("returns correct LTV for each score band", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      const testCases = [
        { agentId: 10, score: 300, expectedLTV: 50 },
        { agentId: 11, score: 499, expectedLTV: 50 },
        { agentId: 12, score: 500, expectedLTV: 60 },
        { agentId: 13, score: 699, expectedLTV: 70 },
        { agentId: 14, score: 700, expectedLTV: 78 },
        { agentId: 15, score: 850, expectedLTV: 85 },
      ];

      for (const { agentId, score, expectedLTV } of testCases) {
        await scoreEngine.connect(oracle).updateScore(agentId, score, dataHash);
        const ltv = await scoreEngine.getLTV(agentId);
        expect(ltv).to.equal(expectedLTV);
      }
    });
  });

  describe("getScoreHistory", function () {
    it("returns entries in correct order", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      const scores = [400, 500, 600];
      for (const s of scores) {
        const prev = await time.latest();
        await time.increase(24 * 60 * 60 + 1);
        await scoreEngine.connect(oracle).updateScore(1, s, dataHash);
      }

      const history = await scoreEngine.getScoreHistory(1);
      expect(history.length).to.equal(3);
      expect(history[0].score).to.equal(400);
      expect(history[1].score).to.equal(500);
      expect(history[2].score).to.equal(600);
    });
  });

  describe("addOracle / removeOracle", function () {
    it("gates addOracle and removeOracle to owner only", async function () {
      const { scoreEngine, deployer, bob, oracle } = await loadFixture(deployFixture);

      await expect(
        scoreEngine.connect(bob).addOracle(bob.address)
      ).to.be.revertedWithCustomError(scoreEngine, "OwnableUnauthorizedAccount");

      await scoreEngine.connect(deployer).addOracle(bob.address);
      expect(await scoreEngine.oracles(bob.address)).to.be.true;

      await expect(
        scoreEngine.connect(bob).removeOracle(bob.address)
      ).to.be.revertedWithCustomError(scoreEngine, "OwnableUnauthorizedAccount");

      await scoreEngine.connect(deployer).removeOracle(oracle.address);
      expect(await scoreEngine.oracles(oracle.address)).to.be.false;
    });
  });

  describe("circular buffer", function () {
    it("overwrites oldest entry after 10 updates", async function () {
      const { scoreEngine, oracle } = await loadFixture(deployFixture);

      for (let i = 0; i < 11; i++) {
        if (i > 0) {
          await time.increase(24 * 60 * 60 + 1);
        }
        await scoreEngine.connect(oracle).updateScore(1, 300 + i * 10, dataHash);
      }

      const history = await scoreEngine.getScoreHistory(1);
      expect(history.length).to.equal(10);

      expect(history[0].score).to.equal(310);
      expect(history[1].score).to.equal(320);
      expect(history[2].score).to.equal(330);
      expect(history[3].score).to.equal(340);
      expect(history[4].score).to.equal(350);
      expect(history[5].score).to.equal(360);
      expect(history[6].score).to.equal(370);
      expect(history[7].score).to.equal(380);
      expect(history[8].score).to.equal(390);
      expect(history[9].score).to.equal(400);
    });
  });
});
