const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TCT", function () {
  let registry, owner, other, newOwner;

  beforeEach(async function () {
    [owner, other, newOwner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TCT");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  async function registerPlatform(signer = owner, name = "P1", metadata = '{"description":"plat"}') {
    const tx = await registry.connect(signer).registerPlatform(name, metadata);
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => {
        try { return registry.interface.parseLog(l); } catch { return null; }
      })
      .find((e) => e && e.name === "PlatformRegistered");
    return ev.args.platformId;
  }

  describe("Admin", function () {
    it("deployer is default admin", async function () {
      expect(await registry.admin()).to.equal(owner.address);
    });

    it("transferAdmin only by admin", async function () {
      await expect(registry.connect(other).transferAdmin(newOwner.address))
        .to.be.revertedWith("Not admin");
      await expect(registry.transferAdmin(newOwner.address))
        .to.emit(registry, "AdminTransferred");
      expect(await registry.admin()).to.equal(newOwner.address);
    });

    it("transferAdmin rejects zero address", async function () {
      await expect(registry.transferAdmin(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid new admin");
    });
  });

  describe("Platform", function () {
    it("registerPlatform sets owner and emits event", async function () {
      await expect(registry.registerPlatform("MyPlat", '{"description":"x"}'))
        .to.emit(registry, "PlatformRegistered");
      const p = await registry.getPlatform(1);
      expect(p.id).to.equal(1n);
      expect(p.owner).to.equal(owner.address);
      expect(p.name).to.equal("MyPlat");
    });

    it("transferPlatformOwner only by owner or admin", async function () {
      const pid = await registerPlatform();
      await expect(registry.connect(other).transferPlatformOwner(pid, newOwner.address))
        .to.be.revertedWith("Not platform owner or admin");
      await expect(registry.transferPlatformOwner(pid, newOwner.address))
        .to.emit(registry, "PlatformOwnerTransferred");
      const p = await registry.getPlatform(pid);
      expect(p.owner).to.equal(newOwner.address);
    });

    it("admin can transferPlatformOwner even if not platform owner", async function () {
      const pid = await registerPlatform(other, "P", "{}");
      // owner deployer is admin
      await expect(registry.transferPlatformOwner(pid, newOwner.address))
        .to.emit(registry, "PlatformOwnerTransferred");
      const p = await registry.getPlatform(pid);
      expect(p.owner).to.equal(newOwner.address);
    });

    it("transferPlatformOwner rejects zero address", async function () {
      const pid = await registerPlatform();
      await expect(registry.transferPlatformOwner(pid, ethers.ZeroAddress))
        .to.be.revertedWith("Invalid new owner");
    });
  });

  describe("Project", function () {
    let pid;
    beforeEach(async function () {
      pid = await registerPlatform();
    });

    it("registerProject by owner", async function () {
      await expect(registry.registerProject(pid, "ProjectA", "SubjectA", 1, "{}"))
        .to.emit(registry, "ProjectRegistered");
      expect(await registry.getPlatformProjectLength(pid)).to.equal(1n);
      expect(await registry.getPlatformProjectId(pid, 0)).to.equal(1n);
      const p = await registry.getProject(1);
      expect(p.name).to.equal("ProjectA");
      expect(p.subject).to.equal("SubjectA");
      expect(p.status).to.equal(1n);
    });

    it("registerProject rejects non-owner", async function () {
      await expect(registry.connect(other).registerProject(pid, "X", "Y", 0, "{}"))
        .to.be.revertedWith("Not platform owner");
    });

    it("updateProject rejects non-owner", async function () {
      await registry.registerProject(pid, "A", "S", 1, "{}");
      await expect(registry.connect(other).updateProject(1, "B", "S", 1, "{}"))
        .to.be.revertedWith("Not platform owner");
    });

    it("updateProject only updates non-empty fields, status always", async function () {
      await registry.registerProject(pid, "A", "S", 1, '{"a":1}');
      await registry.updateProject(1, "", "", 5, "");
      let p = await registry.getProject(1);
      expect(p.name).to.equal("A");
      expect(p.subject).to.equal("S");
      expect(p.status).to.equal(5n);
      expect(p.metadata).to.equal('{"a":1}');

      await registry.updateProject(1, "B", "T", 5, '{"b":2}');
      p = await registry.getProject(1);
      expect(p.name).to.equal("B");
      expect(p.subject).to.equal("T");
      expect(p.metadata).to.equal('{"b":2}');
    });
  });

  describe("Credential", function () {
    let pid, projectId;
    beforeEach(async function () {
      pid = await registerPlatform();
      const tx = await registry.registerProject(pid, "P", "S", 0, "{}");
      await tx.wait();
      projectId = 1n;
    });

    it("createCredential and read", async function () {
      await expect(registry.createCredential(projectId, 100, 1, "{}"))
        .to.emit(registry, "CredentialCreated");
      expect(await registry.getProjectCredentialLength(projectId)).to.equal(1n);
      expect(await registry.getProjectCredentialId(projectId, 0)).to.equal(1n);
      const c = await registry.getCredential(1);
      expect(c.count).to.equal(100n);
      expect(c.status).to.equal(1n);
    });

    it("updateCredential preserves metadata when empty", async function () {
      await registry.createCredential(projectId, 100, 1, '{"a":1}');
      await registry.updateCredential(1, 200, 2, "");
      let c = await registry.getCredential(1);
      expect(c.count).to.equal(200n);
      expect(c.status).to.equal(2n);
      expect(c.metadata).to.equal('{"a":1}');

      await registry.updateCredential(1, 200, 2, '{"b":2}');
      c = await registry.getCredential(1);
      expect(c.metadata).to.equal('{"b":2}');
    });

    it("non-owner cannot create or update", async function () {
      await expect(registry.connect(other).createCredential(projectId, 1, 0, "{}"))
        .to.be.revertedWith("Not platform owner");
      await registry.createCredential(projectId, 100, 1, "{}");
      await expect(registry.connect(other).updateCredential(1, 200, 1, "{}"))
        .to.be.revertedWith("Not platform owner");
    });
  });

  describe("Holder change & lock & benefit", function () {
    let credId;
    beforeEach(async function () {
      const pid = await registerPlatform();
      await registry.registerProject(pid, "P", "S", 0, "{}");
      await registry.createCredential(1, 1000, 0, "{}");
      credId = 1n;
    });

    it("issue then transfer holders", async function () {
      // initial issue from "" to CompanyA
      await expect(registry.changeCredentialHolder(credId, "", "CompanyA", 500, "{}"))
        .to.emit(registry, "CredentialHolderChanged");
      expect(await registry.getCredentialHolderCount(credId, "CompanyA")).to.equal(500n);
      expect(await registry.getCredentialHolderLength(credId)).to.equal(1n);
      expect(await registry.getCredentialHolder(credId, 0)).to.equal("CompanyA");

      // transfer 200 from A to B
      await registry.changeCredentialHolder(credId, "CompanyA", "CompanyB", 200, "{}");
      expect(await registry.getCredentialHolderCount(credId, "CompanyA")).to.equal(300n);
      expect(await registry.getCredentialHolderCount(credId, "CompanyB")).to.equal(200n);
      expect(await registry.getCredentialHolderLength(credId)).to.equal(2n);

      expect(await registry.getCredentialHolderChangeLength(credId)).to.equal(2n);
      const change = await registry.getCredentialHolderChange(credId, 1);
      expect(change.fromHolder).to.equal("CompanyA");
      expect(change.toHolder).to.equal("CompanyB");
      expect(change.count).to.equal(200n);
    });

    it("allows holder count to go negative", async function () {
      await registry.changeCredentialHolder(credId, "", "A", 100, "{}");
      await expect(registry.changeCredentialHolder(credId, "A", "B", 200, "{}"))
        .to.emit(registry, "CredentialHolderChanged");
      expect(await registry.getCredentialHolderCount(credId, "A")).to.equal(-100n);
      expect(await registry.getCredentialHolderCount(credId, "B")).to.equal(200n);
    });

    it("lock/unlock history", async function () {
      await registry.changeCredentialHolder(credId, "", "A", 100, "{}");
      await registry.changeCredentialHolderLock(credId, "A", 50, true, '{"reason":"x"}');
      await registry.changeCredentialHolderLock(credId, "A", 30, false, "{}");
      expect(await registry.getCredentialHolderLockLength(credId, "A")).to.equal(2n);
      const l0 = await registry.getCredentialHolderLock(credId, "A", 0);
      expect(l0.count).to.equal(50n);
      expect(l0.isLock).to.equal(true);
      const l1 = await registry.getCredentialHolderLock(credId, "A", 1);
      expect(l1.isLock).to.equal(false);
    });

    it("benefit record", async function () {
      await registry.changeCredentialHolder(credId, "", "A", 100, "{}");
      await expect(registry.recordCredentialBenefit(credId, "A", 80, 5, "{}"))
        .to.emit(registry, "CredentialBenefitRecorded")
        .withArgs(credId, "A", 80n, 100n, 5n, "{}");
      expect(await registry.getCredentialBenefitLength(credId, "A")).to.equal(1n);
      const b = await registry.getCredentialBenefit(credId, "A", 0);
      expect(b.holderCount).to.equal(80n);
      expect(b.benefitCount).to.equal(5n);
    });

    it("non-owner cannot changeCredentialHolder, changeCredentialHolderLock, recordCredentialBenefit", async function () {
      await expect(registry.connect(other).changeCredentialHolder(credId, "", "A", 100, "{}"))
        .to.be.revertedWith("Not platform owner");
      await expect(registry.connect(other).changeCredentialHolderLock(credId, "A", 50, true, "{}"))
        .to.be.revertedWith("Not platform owner");
      await expect(registry.connect(other).recordCredentialBenefit(credId, "A", 100, 5, "{}"))
        .to.be.revertedWith("Not platform owner");
    });
  });

  describe("File", function () {
    let pid;
    beforeEach(async function () {
      pid = await registerPlatform();
    });

    it("registerFile and getFile", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("hello"));
      await expect(registry.registerFile(pid, "doc.pdf", hash, "{}"))
        .to.emit(registry, "FileRegistered");
      const f = await registry.getFile(1);
      expect(f.name).to.equal("doc.pdf");
      expect(f.hash).to.equal(hash);
    });

    it("updateFile preserves empty fields", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("a"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("b"));
      await registry.registerFile(pid, "n1", hash1, '{"a":1}');

      await registry.updateFile(1, "", ethers.ZeroHash, "");
      let f = await registry.getFile(1);
      expect(f.name).to.equal("n1");
      expect(f.hash).to.equal(hash1);
      expect(f.metadata).to.equal('{"a":1}');

      await registry.updateFile(1, "n2", hash2, '{"b":2}');
      f = await registry.getFile(1);
      expect(f.name).to.equal("n2");
      expect(f.hash).to.equal(hash2);
      expect(f.metadata).to.equal('{"b":2}');
    });

    it("non-owner cannot register/update", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("x"));
      await expect(registry.connect(other).registerFile(pid, "n", hash, "{}"))
        .to.be.revertedWith("Not platform owner");
      await registry.registerFile(pid, "n", hash, "{}");
      await expect(registry.connect(other).updateFile(1, "n2", hash, "{}"))
        .to.be.revertedWith("Not platform owner");
    });
  });
});
