const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TCT lifecycle and recording semantics", function () {
  let tct, owner, nextOwner;
  const meta = (description, extra = {}) => JSON.stringify({ description, ...extra });

  beforeEach(async function () {
    [owner, nextOwner] = await ethers.getSigners();
    tct = await (await ethers.getContractFactory("TCT")).deploy();
    await tct.waitForDeployment();
    await (await tct.registerPlatform("示例平台", meta("虚拟演示数据"))).wait();
    await (await tct.registerProject(1, "示例项目", "示例机构", 1, "{}")).wait();
    await (await tct.createCredential(1, 1000, 1, meta("示例凭证"))).wait();
  });

  it("links objects and traces allocation, transfer, lock, benefit and file records", async function () {
    await tct.changeCredentialHolder(1, "", "demo:a", 1000, meta("初始分配"));
    await tct.changeCredentialHolder(1, "demo:a", "demo:b", 200, meta("变更"));
    await tct.changeCredentialHolderLock(1, "demo:b", 50, true, meta("锁定记录"));
    await tct.changeCredentialHolderLock(1, "demo:b", 20, false, meta("解锁记录"));
    await expect(tct.recordCredentialBenefit(1, "demo:b", 200, 10, "{}"))
      .to.emit(tct, "CredentialBenefitRecorded")
      .withArgs(1n, "demo:b", 200n, 200n, 10n, "{}");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("demo document"));
    await tct.registerFile(1, "demo.txt", hash,
      meta("示例文件", { projectId: "1", credentialId: "1" }));

    expect((await tct.getProject(1)).platformId).to.equal(1n);
    expect((await tct.getCredential(1)).projectId).to.equal(1n);
    expect(await tct.getPlatformProjectId(1, 0)).to.equal(1n);
    expect(await tct.getProjectCredentialId(1, 0)).to.equal(1n);
    expect(await tct.getCredentialHolderCount(1, "demo:a")).to.equal(800n);
    expect(await tct.getCredentialHolderCount(1, "demo:b")).to.equal(200n);
    expect(await tct.getCredentialHolderChangeLength(1)).to.equal(2n);
    const change = await tct.getCredentialHolderChange(1, 1);
    expect(change.fromHolder).to.equal("demo:a");
    expect(change.toHolder).to.equal("demo:b");
    expect(change.count).to.equal(200n);
    expect(change.timestamp).to.be.greaterThan(0n);
    const locked = await tct.getCredentialHolderLock(1, "demo:b", 0);
    const unlocked = await tct.getCredentialHolderLock(1, "demo:b", 1);
    expect(locked.isLock).to.equal(true);
    expect(unlocked.isLock).to.equal(false);
    expect(locked.count - unlocked.count).to.equal(30n);
    expect((await tct.getCredentialBenefit(1, "demo:b", 0)).benefitCount).to.equal(10n);
    const file = await tct.getFile(1);
    expect(file.platformId).to.equal(1n);
    expect(file.hash).to.equal(hash);
    expect(JSON.parse(file.metadata).credentialId).to.equal("1");
  });

  it("records locks without blocking transfers or reconciling credential totals", async function () {
    await tct.changeCredentialHolder(1, "", "demo:a", 1500, "{}");
    await tct.changeCredentialHolderLock(1, "demo:a", 1500, true, "{}");
    await tct.changeCredentialHolder(1, "demo:a", "demo:b", 1600, "{}");
    expect((await tct.getCredential(1)).count).to.equal(1000n);
    expect(await tct.getCredentialHolderCount(1, "demo:a")).to.equal(-100n);
    expect(await tct.getCredentialHolderCount(1, "demo:b")).to.equal(1600n);
  });

  it("owner transfer revokes the previous owner's writes across related objects", async function () {
    await tct.transferPlatformOwner(1, nextOwner.address);
    await expect(tct.updateProject(1, "", "", 2, ""))
      .to.be.revertedWith("Not platform owner");
    await expect(tct.changeCredentialHolder(1, "", "demo:a", 1, "{}"))
      .to.be.revertedWith("Not platform owner");
    await tct.connect(nextOwner).updateProject(1, "", "", 2, "");
    await tct.connect(nextOwner).changeCredentialHolder(1, "", "demo:a", 1, "{}");
    expect((await tct.getProject(1)).status).to.equal(2n);
    expect(await tct.getCredentialHolderCount(1, "demo:a")).to.equal(1n);
    expect(await tct.admin()).to.equal(owner.address);
  });

  it("update events contain submitted fields while getters preserve omitted values", async function () {
    await expect(tct.updateProject(1, "", "", 2, ""))
      .to.emit(tct, "ProjectUpdated").withArgs(1n, "", "", 2n, "");
    const project = await tct.getProject(1);
    expect(project.name).to.equal("示例项目");
    expect(project.subject).to.equal("示例机构");
    expect(project.metadata).to.equal("{}");
    expect(project.status).to.equal(2n);
  });

  it("zero history lengths alone do not establish whether a credential exists", async function () {
    expect(await tct.getCredentialHolderCount(999, "demo:a")).to.equal(0n);
    expect(await tct.getCredentialHolderChangeLength(999)).to.equal(0n);
    await expect(tct.getCredential(999)).to.be.revertedWith("Credential not exists");
  });
});
