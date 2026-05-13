import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentID", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [deployer, alice, bob, charlie, dave, eve, frank, grace] = signers;
    const AgentID = await ethers.getContractFactory("AgentID");
    const agentID = await AgentID.deploy(deployer.address);
    await agentID.waitForDeployment();
    return { agentID, deployer, alice, bob, charlie, dave, eve, frank, grace };
  }

  describe("mintIdentity", function () {
    it("creates token, sets createdAt, emits IdentityMinted", async function () {
      const { agentID, alice } = await loadFixture(deployFixture);

      const tx = await agentID.connect(alice).mintIdentity();

      expect(await agentID.balanceOf(alice.address)).to.equal(1n);
      expect(await agentID.hasMinted(alice.address)).to.be.true;

      const tokenId = await agentID.tokenOfOwner(alice.address);
      expect(tokenId).to.equal(1n);

      expect(await agentID.createdAt(tokenId)).to.be.gt(0n);
      expect(await agentID.ownerOf(tokenId)).to.equal(alice.address);

      await expect(tx).to.emit(agentID, "IdentityMinted");
    });

    it("twice from same address reverts AlreadyHasIdentity", async function () {
      const { agentID, alice } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();

      await expect(
        agentID.connect(alice).mintIdentity()
      ).to.be.revertedWithCustomError(agentID, "AlreadyHasIdentity");
    });
  });

  describe("soulbound", function () {
    it("transfer between two addresses reverts TransferNotAllowed", async function () {
      const { agentID, alice, bob } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();
      const tokenId = await agentID.tokenOfOwner(alice.address);

      await expect(
        agentID.connect(alice).transferFrom(alice.address, bob.address, tokenId)
      ).to.be.revertedWithCustomError(agentID, "TransferNotAllowed");
    });
  });

  describe("registerWallet", function () {
    it("adds to linked list, emits WalletRegistered", async function () {
      const { agentID, alice, bob } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();
      const tokenId = await agentID.tokenOfOwner(alice.address);

      const tx = await agentID.connect(alice).registerWallet(bob.address);

      const linked = await agentID.getLinkedWallets(tokenId);
      expect(linked).to.include(bob.address);

      await expect(tx).to.emit(agentID, "WalletRegistered");
    });

    it("called by non-owner reverts NotTokenOwner", async function () {
      const { agentID, alice, bob } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();

      await expect(
        agentID.connect(bob).registerWallet(bob.address)
      ).to.be.revertedWithCustomError(agentID, "NotTokenOwner");
    });

    it("6th time reverts MaxWalletsReached", async function () {
      const { agentID, alice, bob, charlie, dave, eve, frank } =
        await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();

      await agentID.connect(alice).registerWallet(bob.address);
      await agentID.connect(alice).registerWallet(charlie.address);
      await agentID.connect(alice).registerWallet(dave.address);
      await agentID.connect(alice).registerWallet(eve.address);
      await agentID.connect(alice).registerWallet(frank.address);

      await expect(
        agentID.connect(alice).registerWallet(ethers.Wallet.createRandom().address)
      ).to.be.revertedWithCustomError(agentID, "MaxWalletsReached");
    });
  });

  describe("revokeWallet", function () {
    it("removes from list, emits WalletRevoked", async function () {
      const { agentID, alice, bob } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();
      const tokenId = await agentID.tokenOfOwner(alice.address);
      await agentID.connect(alice).registerWallet(bob.address);

      const tx = await agentID.connect(alice).revokeWallet(bob.address);

      const linked = await agentID.getLinkedWallets(tokenId);
      expect(linked).to.not.include(bob.address);

      await expect(tx).to.emit(agentID, "WalletRevoked");
    });

    it("unlinked address reverts WalletNotLinked", async function () {
      const { agentID, alice, bob } = await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();

      await expect(
        agentID.connect(alice).revokeWallet(bob.address)
      ).to.be.revertedWithCustomError(agentID, "WalletNotLinked");
    });
  });

  describe("views", function () {
    it("getLinkedWallets returns correct list after adds and removes", async function () {
      const { agentID, alice, bob, charlie, dave, eve, frank } =
        await loadFixture(deployFixture);

      await agentID.connect(alice).mintIdentity();
      const tokenId = await agentID.tokenOfOwner(alice.address);

      await agentID.connect(alice).registerWallet(bob.address);
      await agentID.connect(alice).registerWallet(charlie.address);
      await agentID.connect(alice).registerWallet(dave.address);
      await agentID.connect(alice).registerWallet(eve.address);

      await agentID.connect(alice).revokeWallet(charlie.address);

      let linked = await agentID.getLinkedWallets(tokenId);
      expect(linked).to.deep.equal([
        bob.address,
        eve.address,
        dave.address,
      ]);
      expect(linked.length).to.equal(3);

      await agentID.connect(alice).registerWallet(frank.address);

      linked = await agentID.getLinkedWallets(tokenId);
      expect(linked).to.deep.equal([
        bob.address,
        eve.address,
        dave.address,
        frank.address,
      ]);
      expect(linked.length).to.equal(4);
    });

    it("tokenOfOwner returns correct tokenId", async function () {
      const { agentID, alice, bob, charlie } = await loadFixture(deployFixture);

      expect(await agentID.tokenOfOwner(alice.address)).to.equal(0n);
      expect(await agentID.tokenOfOwner(bob.address)).to.equal(0n);
      expect(await agentID.tokenOfOwner(charlie.address)).to.equal(0n);

      await agentID.connect(alice).mintIdentity();
      await agentID.connect(bob).mintIdentity();

      expect(await agentID.tokenOfOwner(alice.address)).to.equal(1n);
      expect(await agentID.tokenOfOwner(bob.address)).to.equal(2n);
      expect(await agentID.tokenOfOwner(charlie.address)).to.equal(0n);
    });
  });
});
