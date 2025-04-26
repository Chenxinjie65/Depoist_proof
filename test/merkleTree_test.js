require('dotenv').config();
const { ethers } = require("ethers");
const MerkleTree = require('fixed-merkle-tree') 
const fs = require('fs');
const path = require('path');
const { bigInt } = require('snarkjs')


const URL = process.env.RPC_URL;
const provider = new ethers.JsonRpcProvider(URL);

const abi = [
    "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
    "function isKnownRoot(bytes32 root) view returns (bool)",
    "function isSpent(bytes32 nullifierHash) view returns (bool)",
    "function getLastRoot() public view returns (bytes32)"
];
const addresstornado = process.env.TORNADO_ADDRESS;
const contract = new ethers.Contract(addresstornado, abi, provider);

const toHex = (number, length = 32) =>
    '0x' +
    (number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)).padStart(length * 2, '0')
  
async function main() {
    try {
        // 修改 JSON 文件路径，使用 path.join 从项目根目录开始
        const jsonPath = path.join(__dirname, '..', 'cache', 'sepolia', 'deposits_eth_0.1.json');
        const fileContent = fs.readFileSync(jsonPath, 'utf8');
        const events = JSON.parse(fileContent);

        // 根据 leafIndex 排序并提取 commitment
        const leaves = events
            .sort((a, b) => a.leafIndex - b.leafIndex)
            .map(e => e.commitment);

        // 创建树，让库自动处理零值填充
        const tree = new MerkleTree(20, leaves);

        const depositCommitment = process.env.DEPOSIT_COMMITMENT;
        const nullifierHash = process.env.NULLIFIER_HASH;
        const depositEvent = leaves.findIndex(e => e === depositCommitment);
        const leafIndex = depositEvent !== -1 ? Number(depositEvent) : -1;

        // 获取 root
        const root = tree.root();
        const rootHex = '0x' + BigInt(root).toString(16).padStart(64, '0');
        const contractRoot = await contract.getLastRoot();
        const isSpent = await contract.isSpent(toHex(nullifierHash));

        console.log(`开始`);
        console.log(`是否在树中存在: ${depositEvent !== -1}`);
        if (depositEvent !== -1) {
            const { pathElements, pathIndices } = tree.path(leafIndex);
            console.log(`本地计算的root: ${rootHex}`);
            console.log(`合约返回的root: ${contractRoot}`);
            console.log(`root是否匹配: ${rootHex.toLowerCase() === contractRoot.toLowerCase()}`);
            console.log(`是否已经花费: ${isSpent}`);
        } else {
            console.log('未找到匹配的commitment');
        }
        console.log(`结束`);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();