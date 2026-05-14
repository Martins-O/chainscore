import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("LendingVault", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [deployer, lender, borrower, liquidator] = signers;

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockTSLA = await MockToken.deploy("Mock TSLA", "TSLA");
    await mockTSLA.waitForDeployment();
    const mockAMZN = await MockToken.deploy("Mock AMZN", "AMZN");
    await mockAMZN.waitForDeployment();

    const MockScoreEngine = await ethers.getContractFactory("MockScoreEngine");
    const mockScoreEngine = await MockScoreEngine.deploy();
    await mockScoreEngine.waitForDeployment();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const mockPriceOracle = await MockPriceOracle.deploy();
    await mockPriceOracle.waitForDeployment();

    const MockAgentID = await ethers.getContractFactory("MockAgentID");
    const mockAgentID = await MockAgentID.deploy();
    await mockAgentID.waitForDeployment();

    const LendingVault = await ethers.getContractFactory("LendingVault");
    const vault = await LendingVault.deploy(
      await mockUSDC.getAddress(),
      await mockScoreEngine.getAddress(),
      await mockAgentID.getAddress(),
      await mockPriceOracle.getAddress()
    );
    await vault.waitForDeployment();

    await vault.addCollateralToken(await mockTSLA.getAddress());

    return {
      vault,
      mockUSDC,
      mockTSLA,
      mockAMZN,
      mockScoreEngine,
      mockPriceOracle,
      mockAgentID,
      deployer,
      lender,
      borrower,
      liquidator,
    };
  }

  describe("deposit", function () {
    it("transfers USDC in, mints correct shares, emits Deposited", async function () {
      const { vault, mockUSDC, lender } = await loadFixture(deployFixture);

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);

      const tx = await vault.connect(lender).deposit(depositAmt);

      expect(await vault.balanceOf(lender.address)).to.equal(depositAmt);
      expect(await mockUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmt);
      await expect(tx)
        .to.emit(vault, "Deposited")
        .withArgs(lender.address, depositAmt, depositAmt);
    });
  });

  describe("withdraw", function () {
    it("burns shares, returns correct USDC, emits Withdrawn", async function () {
      const { vault, mockUSDC, lender } = await loadFixture(deployFixture);

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const withdrawShares = ethers.parseUnits("400", 6);
      const tx = await vault.connect(lender).withdraw(withdrawShares);

      expect(await vault.balanceOf(lender.address)).to.equal(
        depositAmt - withdrawShares
      );
      expect(await mockUSDC.balanceOf(lender.address)).to.equal(withdrawShares);
      await expect(tx)
        .to.emit(vault, "Withdrawn")
        .withArgs(lender.address, withdrawShares, withdrawShares);
    });
  });

  describe("borrow - authorization", function () {
    it("without AgentID reverts NoAgentIdentity", async function () {
      const { vault, mockTSLA, mockScoreEngine, mockPriceOracle, mockAgentID, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(0);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const collateralAmt = ethers.parseUnits("1", 18);
      const borrowAmt = ethers.parseUnits("100", 6);

      await expect(
        vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt)
      ).to.be.revertedWithCustomError(vault, "NoAgentIdentity");
    });
  });

  describe("borrow - collateral", function () {
    it("with non-whitelisted collateral reverts CollateralNotWhitelisted", async function () {
      const { vault, mockAMZN, mockScoreEngine, mockPriceOracle, mockAgentID, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const collateralAmt = ethers.parseUnits("1", 18);
      const borrowAmt = ethers.parseUnits("100", 6);

      await expect(
        vault.connect(borrower).borrow(1, await mockAMZN.getAddress(), collateralAmt, borrowAmt)
      ).to.be.revertedWithCustomError(vault, "CollateralNotWhitelisted");
    });
  });

  describe("borrow - LTV limit", function () {
    it("exceeding LTV reverts ExceedsMaxLTV", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("1", 18);
      const borrowAmt = ethers.parseUnits("200", 6);

      await expect(
        vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt)
      ).to.be.revertedWithCustomError(vault, "ExceedsMaxLTV");
    });
  });

  describe("borrow - liquidity", function () {
    it("exceeding vault liquidity reverts InsufficientLiquidity", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("100", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("3", 18);
      const borrowAmt = ethers.parseUnits("200", 6);

      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);

      await expect(
        vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt)
      ).to.be.revertedWithCustomError(vault, "InsufficientLiquidity");
    });
  });

  describe("borrow - success", function () {
    it("locks collateral, transfers USDC, emits Borrowed, returns loanId", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);

      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);

      const lenderUSDCBefore = await mockUSDC.balanceOf(lender.address);
      const borrowerUSDCBefore = await mockUSDC.balanceOf(borrower.address);
      const vaultUSDCBefore = await mockUSDC.balanceOf(await vault.getAddress());
      const vaultTSLABefore = await mockTSLA.balanceOf(await vault.getAddress());

      const tx = await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      expect(await mockUSDC.balanceOf(borrower.address)).to.equal(borrowerUSDCBefore + borrowAmt);
      expect(await mockUSDC.balanceOf(await vault.getAddress())).to.equal(vaultUSDCBefore - borrowAmt);
      expect(await mockTSLA.balanceOf(await vault.getAddress())).to.equal(vaultTSLABefore + collateralAmt);

      await expect(tx)
        .to.emit(vault, "Borrowed")
        .withArgs(1n, 1n, await mockTSLA.getAddress(), collateralAmt, borrowAmt);
    });
  });

  describe("repay - partial", function () {
    it("reduces principal, does not return collateral yet", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      const vaultTSLABefore = await mockTSLA.balanceOf(await vault.getAddress());
      const repayAmt = ethers.parseUnits("200", 6);
      await mockUSDC.mint(borrower.address, repayAmt);
      await mockUSDC.connect(borrower).approve(await vault.getAddress(), repayAmt);

      const tx = await vault.connect(borrower).repay(1, repayAmt);

      expect(await mockTSLA.balanceOf(await vault.getAddress())).to.equal(vaultTSLABefore);
      await expect(tx)
        .to.emit(vault, "Repaid")
        .withArgs(1n, repayAmt, anyValue);
    });
  });

  describe("repay - full", function () {
    it("returns collateral, closes loan, emits Repaid", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      const borrowerTSLABefore = await mockTSLA.balanceOf(borrower.address);
      const vaultTSLABefore = await mockTSLA.balanceOf(await vault.getAddress());

      const repayAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(borrower.address, repayAmt);
      await mockUSDC.connect(borrower).approve(await vault.getAddress(), repayAmt);

      const tx = await vault.connect(borrower).repay(1, repayAmt);

      expect(await mockTSLA.balanceOf(borrower.address)).to.equal(borrowerTSLABefore + collateralAmt);
      expect(await mockTSLA.balanceOf(await vault.getAddress())).to.equal(vaultTSLABefore - collateralAmt);
      await expect(tx)
        .to.emit(vault, "Repaid");
    });
  });

  describe("liquidate", function () {
    it("on healthy loan reverts LoanNotLiquidatable", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower, liquidator } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      await expect(
        vault.connect(liquidator).liquidate(1)
      ).to.be.revertedWithCustomError(vault, "LoanNotLiquidatable");
    });

    it("on unhealthy loan seizes collateral, closes loan, emits Liquidated", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower, liquidator } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      await mockPriceOracle.setPrice(ethers.parseUnits("40", 18));

      const liquidatorTSLABefore = await mockTSLA.balanceOf(liquidator.address);
      const liquidatorUSDCBefore = await mockUSDC.balanceOf(liquidator.address);

      const liquidateRepayAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(liquidator.address, liquidateRepayAmt);
      await mockUSDC.connect(liquidator).approve(await vault.getAddress(), liquidateRepayAmt);

      const tx = await vault.connect(liquidator).liquidate(1);

      await expect(
        vault.getHealthFactor(1)
      ).to.be.revertedWithCustomError(vault, "LoanNotFound");
      expect(await mockTSLA.balanceOf(liquidator.address)).to.equal(liquidatorTSLABefore + collateralAmt);
      await expect(tx)
        .to.emit(vault, "Liquidated")
        .withArgs(1n, liquidator.address, collateralAmt);
    });
  });

  describe("interest accrual", function () {
    it("accrues correctly after time warp", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      const hfBefore = await vault.getHealthFactor(1);
      expect(hfBefore).to.equal(400n);

      await time.increase(180 * 24 * 60 * 60);

      const hfAfter = await vault.getHealthFactor(1);
      expect(hfAfter).to.be.lessThan(hfBefore);
    });
  });

  describe("getHealthFactor", function () {
    it("returns correct value before and after price change", async function () {
      const { vault, mockTSLA, mockUSDC, mockScoreEngine, mockPriceOracle, mockAgentID, lender, borrower } =
        await loadFixture(deployFixture);

      await mockAgentID.setTokenId(1);
      await mockScoreEngine.setLTV(50);
      await mockPriceOracle.setPrice(ethers.parseUnits("200", 18));

      const depositAmt = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(lender.address, depositAmt);
      await mockUSDC.connect(lender).approve(await vault.getAddress(), depositAmt);
      await vault.connect(lender).deposit(depositAmt);

      const collateralAmt = ethers.parseUnits("10", 18);
      const borrowAmt = ethers.parseUnits("500", 6);
      await mockTSLA.mint(borrower.address, collateralAmt);
      await mockTSLA.connect(borrower).approve(await vault.getAddress(), collateralAmt);
      await vault.connect(borrower).borrow(1, await mockTSLA.getAddress(), collateralAmt, borrowAmt);

      const borrowTs = await time.latest();

      const hf200 = await vault.getHealthFactor(1);
      expect(hf200).to.equal(400n);

      await time.setNextBlockTimestamp(borrowTs);
      await mockPriceOracle.setPrice(ethers.parseUnits("100", 18));

      const hf100 = await vault.getHealthFactor(1);
      expect(hf100).to.equal(200n);

      await time.setNextBlockTimestamp(borrowTs);
      await mockPriceOracle.setPrice(ethers.parseUnits("50", 18));

      const hf50 = await vault.getHealthFactor(1);
      expect(hf50).to.equal(100n);
    });
  });
});
