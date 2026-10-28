const { ethers } = require("hardhat");

// 所有名称、持有人和文件内容均为虚构演示数据。
async function main() {
  const factory = await ethers.getContractFactory("TCT");
  const tct = await factory.deploy();
  await tct.waitForDeployment();
  const metadata = (description, extra = {}) =>
    JSON.stringify({ description, ...extra });

  async function writeAndGetId(transaction, eventName, field) {
    const receipt = await (await transaction).wait();
    for (const log of receipt.logs) {
      let event;
      try {
        event = tct.interface.parseLog(log);
      } catch {
        continue;
      }
      if (event && event.name === eventName) return event.args[field];
    }
    throw new Error(`Missing event: ${eventName}`);
  }

  const platformId = await writeAndGetId(
    tct.registerPlatform("示例业务平台", metadata("TCT 接入演示")),
    "PlatformRegistered", "platformId"
  );
  const projectId = await writeAndGetId(
    tct.registerProject(platformId, "示例数据服务项目", "示例机构", 1,
      metadata("项目登记", { businessId: "DEMO-PROJECT-001" })),
    "ProjectRegistered", "projectId"
  );
  const credentialId = await writeAndGetId(
    tct.createCredential(projectId, 1000, 1,
      metadata("示例凭证", { unit: "份", businessId: "DEMO-CREDENTIAL-001" })),
    "CredentialCreated", "credentialId"
  );

  const holderA = "demo:holder:a";
  const holderB = "demo:holder:b";
  await (await tct.changeCredentialHolder(credentialId, "", holderA, 1000,
    metadata("初始分配"))).wait();
  await (await tct.changeCredentialHolder(credentialId, holderA, holderB, 200,
    metadata("持有人变更", { businessId: "DEMO-TRANSFER-001" }))).wait();
  await (await tct.changeCredentialHolderLock(credentialId, holderB, 50, true,
    metadata("锁定记录，仅用于追溯"))).wait();
  await (await tct.changeCredentialHolderLock(credentialId, holderB, 20, false,
    metadata("解除部分锁定记录"))).wait();
  await (await tct.recordCredentialBenefit(credentialId, holderB, 200, 10,
    metadata("权益记录，不执行支付", { unit: "示例权益单位" }))).wait();

  // 仅为内存字符串计算摘要，接入真实文件时应对原始文件字节计算摘要。
  const fileHash = ethers.keccak256(ethers.toUtf8Bytes("TCT demo document"));
  const fileId = await writeAndGetId(
    tct.registerFile(platformId, "demo.txt", fileHash,
      metadata("示例文件摘要", {
        hashAlgorithm: "keccak256", projectId: projectId.toString(),
        credentialId: credentialId.toString()
      })),
    "FileRegistered", "fileId"
  );

  console.log("TCT:", await tct.getAddress());
  console.log("IDs:", { platformId, projectId, credentialId, fileId });
  console.log("Holder A:", await tct.getCredentialHolderCount(credentialId, holderA));
  console.log("Holder B:", await tct.getCredentialHolderCount(credentialId, holderB));
  const length = await tct.getCredentialHolderChangeLength(credentialId);
  for (let index = 0n; index < length; index++) {
    console.log("Holder change:", await tct.getCredentialHolderChange(credentialId, index));
  }
  console.log("File:", await tct.getFile(fileId));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
