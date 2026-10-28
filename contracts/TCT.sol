// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TCT 全流程溯源合约
/// @notice 记录平台、项目、凭证及其生命周期业务信息；由平台 owner 提交业务记录。
/// @dev 持有人数量允许负数；只记录过程状态，用于和线下数据对比
contract TCT {
    struct Platform {
        uint256 id;
        address owner;
        string name;
        string metadata;
        uint256[] projectIds;
        uint256[] fileIds;
        bool exists;
    }

    struct Project {
        uint256 id;
        uint256 platformId;
        string name;
        string subject;
        uint256 status;
        string metadata;
        uint256[] credentialIds;
        bool exists;
    }

    struct Credential {
        uint256 id;
        uint256 projectId;
        uint256 count;
        uint256 status;
        string metadata;
        bool exists;
    }

    struct HolderChange {
        string fromHolder;
        string toHolder;
        uint256 count;
        string metadata;
        uint256 timestamp;
    }

    struct HolderLock {
        uint256 count;
        bool isLock;
        string metadata;
        uint256 timestamp;
    }

    struct Benefit {
        uint256 holderCount;
        uint256 benefitCount;
        string metadata;
        uint256 timestamp;
    }

    struct FileInfo {
        uint256 id;
        uint256 platformId;
        string name;
        bytes32 hash;
        string metadata;
        bool exists;
    }

    address public admin;

    uint256 private _platformSeq;
    uint256 private _projectSeq;
    uint256 private _credentialSeq;
    uint256 private _fileSeq;

    mapping(uint256 => Platform) private _platforms;
    mapping(uint256 => Project) private _projects;
    mapping(uint256 => Credential) private _credentials;
    mapping(uint256 => FileInfo) private _files;

    // credentialId => holder => count
    mapping(uint256 => mapping(string => int256)) private _holderCount;
    // credentialId => holder => exists in list
    mapping(uint256 => mapping(string => bool)) private _holderListed;
    // credentialId => holder list
    mapping(uint256 => string[]) private _holderList;
    // credentialId => holder change history
    mapping(uint256 => HolderChange[]) private _holderChanges;
    // credentialId => holder => holder lock history
    mapping(uint256 => mapping(string => HolderLock[])) private _holderLocks;
    // credentialId => holder => benefit history
    mapping(uint256 => mapping(string => Benefit[])) private _holderBenefits;

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

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
        emit AdminTransferred(address(0), msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid new admin");
        address old = admin;
        admin = newAdmin;
        emit AdminTransferred(old, newAdmin);
    }

    modifier onlyPlatformOwner(uint256 platformId) {
        require(_platforms[platformId].exists, "Platform not exists");
        require(_platforms[platformId].owner == msg.sender, "Not platform owner");
        _;
    }

    modifier onlyProjectPlatformOwner(uint256 projectId) {
        require(_projects[projectId].exists, "Project not exists");
        require(_platforms[_projects[projectId].platformId].owner == msg.sender, "Not platform owner");
        _;
    }

    modifier onlyCredentialPlatformOwner(uint256 credentialId) {
        require(_credentials[credentialId].exists, "Credential not exists");
        uint256 pid = _projects[_credentials[credentialId].projectId].platformId;
        require(_platforms[pid].owner == msg.sender, "Not platform owner");
        _;
    }

    modifier onlyFilePlatformOwner(uint256 fileId) {
        require(_files[fileId].exists, "File not exists");
        require(_platforms[_files[fileId].platformId].owner == msg.sender, "Not platform owner");
        _;
    }

    // ============ Write Interfaces ============

    function registerPlatform(string calldata name, string calldata metadata) external returns (uint256) {
        _platformSeq += 1;
        uint256 id = _platformSeq;
        Platform storage p = _platforms[id];
        p.id = id;
        p.owner = msg.sender;
        p.name = name;
        p.metadata = metadata;
        p.exists = true;
        emit PlatformRegistered(id, msg.sender, name, metadata);
        return id;
    }

    function transferPlatformOwner(uint256 platformId, address newOwner) external {
        require(_platforms[platformId].exists, "Platform not exists");
        require(
            msg.sender == _platforms[platformId].owner || msg.sender == admin,
            "Not platform owner or admin"
        );
        require(newOwner != address(0), "Invalid new owner");
        address old = _platforms[platformId].owner;
        _platforms[platformId].owner = newOwner;
        emit PlatformOwnerTransferred(platformId, old, newOwner);
    }

    function registerProject(
        uint256 platformId,
        string calldata name,
        string calldata subject,
        uint256 status,
        string calldata metadata
    ) external onlyPlatformOwner(platformId) returns (uint256) {
        _projectSeq += 1;
        uint256 id = _projectSeq;
        Project storage pr = _projects[id];
        pr.id = id;
        pr.platformId = platformId;
        pr.name = name;
        pr.subject = subject;
        pr.status = status;
        pr.metadata = metadata;
        pr.exists = true;
        _platforms[platformId].projectIds.push(id);
        emit ProjectRegistered(id, platformId, name, subject, status, metadata);
        return id;
    }

    function updateProject(
        uint256 projectId,
        string calldata name,
        string calldata subject,
        uint256 status,
        string calldata metadata
    ) external onlyProjectPlatformOwner(projectId) {
        Project storage pr = _projects[projectId];
        if (bytes(name).length > 0) {
            pr.name = name;
        }
        if (bytes(subject).length > 0) {
            pr.subject = subject;
        }
        pr.status = status;
        if (bytes(metadata).length > 0) {
            pr.metadata = metadata;
        }
        emit ProjectUpdated(projectId, name, subject, status, metadata);
    }

    function createCredential(
        uint256 projectId,
        uint256 count,
        uint256 status,
        string calldata metadata
    ) external onlyProjectPlatformOwner(projectId) returns (uint256) {
        _credentialSeq += 1;
        uint256 id = _credentialSeq;
        Credential storage c = _credentials[id];
        c.id = id;
        c.projectId = projectId;
        c.count = count;
        c.status = status;
        c.metadata = metadata;
        c.exists = true;
        _projects[projectId].credentialIds.push(id);
        emit CredentialCreated(id, projectId, count, status, metadata);
        return id;
    }

    function updateCredential(
        uint256 credentialId,
        uint256 count,
        uint256 status,
        string calldata metadata
    ) external onlyCredentialPlatformOwner(credentialId) {
        Credential storage c = _credentials[credentialId];
        c.count = count;
        c.status = status;
        if (bytes(metadata).length > 0) {
            c.metadata = metadata;
        }
        emit CredentialUpdated(credentialId, count, status, metadata);
    }

    function changeCredentialHolder(
        uint256 credentialId,
        string calldata fromHolder,
        string calldata toHolder,
        uint256 count,
        string calldata metadata
    ) external onlyCredentialPlatformOwner(credentialId) {
        require(count > 0, "Count must > 0");
        require(bytes(toHolder).length > 0, "Invalid toHolder");

        if (bytes(fromHolder).length > 0) {
            _holderCount[credentialId][fromHolder] -= int256(count);
        }

        _holderCount[credentialId][toHolder] += int256(count);
        if (!_holderListed[credentialId][toHolder]) {
            _holderListed[credentialId][toHolder] = true;
            _holderList[credentialId].push(toHolder);
        }

        _holderChanges[credentialId].push(HolderChange({
            fromHolder: fromHolder,
            toHolder: toHolder,
            count: count,
            metadata: metadata,
            timestamp: block.timestamp
        }));

        emit CredentialHolderChanged(credentialId, fromHolder, toHolder, count, metadata);
    }

    function changeCredentialHolderLock(
        uint256 credentialId,
        string calldata holder,
        uint256 count,
        bool isLock,
        string calldata metadata
    ) external onlyCredentialPlatformOwner(credentialId) {
        require(bytes(holder).length > 0, "Invalid holder");
        _holderLocks[credentialId][holder].push(HolderLock({
            count: count,
            isLock: isLock,
            metadata: metadata,
            timestamp: block.timestamp
        }));
        emit CredentialHolderLockChanged(credentialId, holder, count, isLock, metadata);
    }

    function recordCredentialBenefit(
        uint256 credentialId,
        string calldata holder,
        uint256 holderCount,
        uint256 benefitCount,
        string calldata metadata
    ) external onlyCredentialPlatformOwner(credentialId) {
        require(bytes(holder).length > 0, "Invalid holder");
        int256 actualHolderCount = _holderCount[credentialId][holder];
        _holderBenefits[credentialId][holder].push(Benefit({
            holderCount: holderCount,
            benefitCount: benefitCount,
            metadata: metadata,
            timestamp: block.timestamp
        }));
        emit CredentialBenefitRecorded(credentialId, holder, holderCount, actualHolderCount, benefitCount, metadata);
    }

    function registerFile(
        uint256 platformId,
        string calldata name,
        bytes32 hash,
        string calldata metadata
    ) external onlyPlatformOwner(platformId) returns (uint256) {
        _fileSeq += 1;
        uint256 id = _fileSeq;
        FileInfo storage f = _files[id];
        f.id = id;
        f.platformId = platformId;
        f.name = name;
        f.hash = hash;
        f.metadata = metadata;
        f.exists = true;
        _platforms[platformId].fileIds.push(id);
        emit FileRegistered(id, platformId, name, hash, metadata);
        return id;
    }

    function updateFile(
        uint256 fileId,
        string calldata name,
        bytes32 hash,
        string calldata metadata
    ) external onlyFilePlatformOwner(fileId) {
        FileInfo storage f = _files[fileId];
        if (bytes(name).length > 0) {
            f.name = name;
        }
        if (hash != bytes32(0)) {
            f.hash = hash;
        }
        if (bytes(metadata).length > 0) {
            f.metadata = metadata;
        }
        emit FileUpdated(fileId, name, hash, metadata);
    }

    // ============ Read Interfaces ============

    function getPlatform(uint256 platformId) external view returns (uint256 id, address owner, string memory name, string memory metadata) {
        Platform storage p = _platforms[platformId];
        require(p.exists, "Platform not exists");
        return (p.id, p.owner, p.name, p.metadata);
    }

    function getPlatformProjectLength(uint256 platformId) external view returns (uint256) {
        require(_platforms[platformId].exists, "Platform not exists");
        return _platforms[platformId].projectIds.length;
    }

    function getPlatformProjectId(uint256 platformId, uint256 index) external view returns (uint256) {
        require(_platforms[platformId].exists, "Platform not exists");
        return _platforms[platformId].projectIds[index];
    }

    function getProject(uint256 projectId) external view returns (
        uint256 id,
        uint256 platformId,
        string memory name,
        string memory subject,
        uint256 status,
        string memory metadata
    ) {
        Project storage pr = _projects[projectId];
        require(pr.exists, "Project not exists");
        return (pr.id, pr.platformId, pr.name, pr.subject, pr.status, pr.metadata);
    }

    function getCredential(uint256 credentialId) external view returns (
        uint256 id,
        uint256 projectId,
        uint256 count,
        uint256 status,
        string memory metadata
    ) {
        Credential storage c = _credentials[credentialId];
        require(c.exists, "Credential not exists");
        return (c.id, c.projectId, c.count, c.status, c.metadata);
    }

    function getProjectCredentialLength(uint256 projectId) external view returns (uint256) {
        require(_projects[projectId].exists, "Project not exists");
        return _projects[projectId].credentialIds.length;
    }

    function getProjectCredentialId(uint256 projectId, uint256 index) external view returns (uint256) {
        require(_projects[projectId].exists, "Project not exists");
        return _projects[projectId].credentialIds[index];
    }

    function getCredentialHolderCount(uint256 credentialId, string calldata holder) external view returns (int256) {
        return _holderCount[credentialId][holder];
    }

    function getCredentialHolderLength(uint256 credentialId) external view returns (uint256) {
        return _holderList[credentialId].length;
    }

    function getCredentialHolder(uint256 credentialId, uint256 index) external view returns (string memory) {
        return _holderList[credentialId][index];
    }

    function getCredentialHolderChangeLength(uint256 credentialId) external view returns (uint256) {
        return _holderChanges[credentialId].length;
    }

    function getCredentialHolderChange(uint256 credentialId, uint256 index) external view returns (
        string memory fromHolder,
        string memory toHolder,
        uint256 count,
        string memory metadata,
        uint256 timestamp
    ) {
        HolderChange storage h = _holderChanges[credentialId][index];
        return (h.fromHolder, h.toHolder, h.count, h.metadata, h.timestamp);
    }

    function getCredentialHolderLockLength(uint256 credentialId, string calldata holder) external view returns (uint256) {
        return _holderLocks[credentialId][holder].length;
    }

    function getCredentialHolderLock(uint256 credentialId, string calldata holder, uint256 index) external view returns (
        uint256 count,
        bool isLock,
        string memory metadata,
        uint256 timestamp
    ) {
        HolderLock storage l = _holderLocks[credentialId][holder][index];
        return (l.count, l.isLock, l.metadata, l.timestamp);
    }

    function getCredentialBenefitLength(uint256 credentialId, string calldata holder) external view returns (uint256) {
        return _holderBenefits[credentialId][holder].length;
    }

    function getCredentialBenefit(uint256 credentialId, string calldata holder, uint256 index) external view returns (
        uint256 holderCount,
        uint256 benefitCount,
        string memory metadata,
        uint256 timestamp
    ) {
        Benefit storage b = _holderBenefits[credentialId][holder][index];
        return (b.holderCount, b.benefitCount, b.metadata, b.timestamp);
    }

    function getFile(uint256 fileId) external view returns (
        uint256 id,
        uint256 platformId,
        string memory name,
        bytes32 hash,
        string memory metadata
    ) {
        FileInfo storage f = _files[fileId];
        require(f.exists, "File not exists");
        return (f.id, f.platformId, f.name, f.hash, f.metadata);
    }
}
