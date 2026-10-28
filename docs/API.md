# 合约接口

合约：`contracts/TCT.sol:TCT`。构造函数无参数，部署者成为 `admin`。

下表中 `metadata` 均为字符串，建议使用 JSON；`holder`、`fromHolder`、`toHolder` 均为字符串业务标识。ID、数量、状态、下标和时间均为 `uint256`，特别标出的累计持有数量为 `int256`。地址为 `address`，文件摘要为 `bytes32`，`isLock` 为 `bool`。

## 写入接口

| 签名 | 权限与返回值 | 行为 |
| --- | --- | --- |
| `transferAdmin(address newAdmin)` | 当前 admin | 新地址不得为零；立即转移全局管理员 |
| `registerPlatform(string name, string metadata)` | 任意地址；返回 `uint256` 平台 ID | 调用者成为平台 owner |
| `transferPlatformOwner(uint256 platformId, address newOwner)` | 当前平台 owner 或 admin | 平台必须存在，新 owner 不得为零 |
| `registerProject(uint256 platformId, string name, string subject, uint256 status, string metadata)` | 平台 owner；返回 `uint256` 项目 ID | 登记项目并加入平台项目索引 |
| `updateProject(uint256 projectId, string name, string subject, uint256 status, string metadata)` | 所属平台 owner | 空名称、主体和元数据保留；状态始终更新 |
| `createCredential(uint256 projectId, uint256 count, uint256 status, string metadata)` | 所属平台 owner；返回 `uint256` 凭证 ID | 加入项目凭证索引，不自动分配持有数量 |
| `updateCredential(uint256 credentialId, uint256 count, uint256 status, string metadata)` | 所属平台 owner | 数量和状态始终更新；空元数据保留 |
| `changeCredentialHolder(uint256 credentialId, string fromHolder, string toHolder, uint256 count, string metadata)` | 所属平台 owner | 数量须大于 0，接收方非空；来源可空；不校验余额或总量 |
| `changeCredentialHolderLock(uint256 credentialId, string holder, uint256 count, bool isLock, string metadata)` | 所属平台 owner | 持有人非空；追加记录，不执行冻结；数量可为 0 |
| `recordCredentialBenefit(uint256 credentialId, string holder, uint256 holderCount, uint256 benefitCount, string metadata)` | 所属平台 owner | 持有人非空；追加权益记录并发出含实际持有量的事件 |
| `registerFile(uint256 platformId, string name, bytes32 hash, string metadata)` | 平台 owner；返回 `uint256` 文件 ID | 摘要可为零，合约不校验内容或算法 |
| `updateFile(uint256 fileId, string name, bytes32 hash, string metadata)` | 所属平台 owner | 空名称/元数据保留；全零摘要保留 |

除表中明确校验的非空条件外，合约不检查名称、主体、状态含义或 JSON 结构。更新时非空元数据整体替换原值。原型允许负数记账，调用方必须理解其 [数量语义](DESIGN.md)。

## 读取接口

以下接口均为 `view`，不限制调用者。

| 签名 | 返回值（顺序与 ABI 一致） |
| --- | --- |
| `admin()` | `address` |
| `getPlatform(uint256 platformId)` | `uint256 id, address owner, string name, string metadata` |
| `getPlatformProjectLength(uint256 platformId)` | `uint256` |
| `getPlatformProjectId(uint256 platformId, uint256 index)` | `uint256` 项目 ID |
| `getProject(uint256 projectId)` | `uint256 id, uint256 platformId, string name, string subject, uint256 status, string metadata` |
| `getCredential(uint256 credentialId)` | `uint256 id, uint256 projectId, uint256 count, uint256 status, string metadata` |
| `getProjectCredentialLength(uint256 projectId)` | `uint256` |
| `getProjectCredentialId(uint256 projectId, uint256 index)` | `uint256` 凭证 ID |
| `getCredentialHolderCount(uint256 credentialId, string holder)` | **`int256`** 累计持有数量 |
| `getCredentialHolderLength(uint256 credentialId)` | `uint256` 曾作为接收方的唯一标识数量 |
| `getCredentialHolder(uint256 credentialId, uint256 index)` | `string` 持有人标识 |
| `getCredentialHolderChangeLength(uint256 credentialId)` | `uint256` |
| `getCredentialHolderChange(uint256 credentialId, uint256 index)` | `string fromHolder, string toHolder, uint256 count, string metadata, uint256 timestamp` |
| `getCredentialHolderLockLength(uint256 credentialId, string holder)` | `uint256` |
| `getCredentialHolderLock(uint256 credentialId, string holder, uint256 index)` | `uint256 count, bool isLock, string metadata, uint256 timestamp` |
| `getCredentialBenefitLength(uint256 credentialId, string holder)` | `uint256` |
| `getCredentialBenefit(uint256 credentialId, string holder, uint256 index)` | `uint256 holderCount, uint256 benefitCount, string metadata, uint256 timestamp` |
| `getFile(uint256 fileId)` | `uint256 id, uint256 platformId, string name, bytes32 hash, string metadata` |

平台、项目、凭证和文件 getter 会校验对象存在；平台项目索引、项目凭证索引也会校验所属对象存在。持有人、变更、锁定和权益系列读取不单独校验凭证存在，未记录时计数或长度可为 0。所有数组按下标读取，越界会回滚。

## 事件

全部参数均为非 `indexed`。更新事件使用传入参数，不保证是更新后的完整快照。

```solidity
event AdminTransferred(address oldAdmin, address newAdmin);
event PlatformRegistered(uint256 platformId, address owner, string name, string metadata);
event PlatformOwnerTransferred(uint256 platformId, address oldOwner, address newOwner);
event ProjectRegistered(uint256 projectId, uint256 platformId, string name, string subject, uint256 status, string metadata);
event ProjectUpdated(uint256 projectId, string name, string subject, uint256 status, string metadata);
event CredentialCreated(uint256 credentialId, uint256 projectId, uint256 count, uint256 status, string metadata);
event CredentialUpdated(uint256 credentialId, uint256 count, uint256 status, string metadata);
event CredentialHolderChanged(uint256 credentialId, string fromHolder, string toHolder, uint256 count, string metadata);
event CredentialHolderLockChanged(uint256 credentialId, string holder, uint256 count, bool isLock, string metadata);
event CredentialBenefitRecorded(uint256 credentialId, string holder, uint256 holderCount, int256 actualHolderCount, uint256 benefitCount, string metadata);
event FileRegistered(uint256 fileId, uint256 platformId, string name, bytes32 hash, string metadata);
event FileUpdated(uint256 fileId, string name, bytes32 hash, string metadata);
```

事件中没有单独的业务时间字段，读取日志所在区块可获取区块时间。`actualHolderCount` 仅写入权益事件，不包含在权益历史 getter 中。

## 回滚信息

| 信息 | 条件 |
| --- | --- |
| `Not admin` | 非管理员转移 admin |
| `Invalid new admin` | 新 admin 为零地址 |
| `Platform not exists` | 指定平台不存在 |
| `Not platform owner` | 调用者不是对应平台 owner |
| `Not platform owner or admin` | 无权转移平台 owner |
| `Invalid new owner` | 新平台 owner 为零地址 |
| `Project not exists` | 指定项目不存在 |
| `Credential not exists` | 指定凭证不存在 |
| `File not exists` | 指定文件不存在 |
| `Count must > 0` | 持有人变更数量为 0 |
| `Invalid toHolder` | 持有人变更接收方为空 |
| `Invalid holder` | 锁定或权益记录的持有人为空 |

数组越界与算术溢出由 Solidity 的内置检查回滚，不使用上述业务错误字符串。
