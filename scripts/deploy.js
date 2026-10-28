const { ethers } = require("hardhat");

async function main() {
  const factory = await ethers.getContractFactory("TCT");
  const tct = await factory.deploy();
  await tct.waitForDeployment();
  console.log("TCT address:", await tct.getAddress());
  console.log("Admin:", await tct.admin());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
