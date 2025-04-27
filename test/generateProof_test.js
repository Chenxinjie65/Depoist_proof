require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { bigInt } = require('snarkjs');
const circomlib = require('circomlib');
const MerkleTree = require('fixed-merkle-tree');
const assert = require('assert');
const { ethers } = require("ethers");

const MERKLE_TREE_HEIGHT = 20;

const pedersenHash = (data) => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0];

const toHex = (number, length = 32) =>
    '0x' +
    (number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)).padStart(length * 2, '0');

// 初始化合约实例
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const abiDeposit = [
    "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
    "function isKnownRoot(bytes32 root) view returns (bool)",
    "function isSpent(bytes32 nullifierHash) view returns (bool)"
];
const tornado = new ethers.Contract(
  process.env.TORNADO_ADDRESS,
  abiDeposit,
  provider
);

function parseNote(noteString) {
    const noteRegex = /tornado-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g;
    const match = noteRegex.exec(noteString);
    if (!match) {
        throw new Error('The note has invalid format');
    }
    const buf = Buffer.from(match.groups.note, 'hex');
    const nullifier = bigInt.leBuff2int(buf.slice(0, 31));
    const secret = bigInt.leBuff2int(buf.slice(31, 62));
    return { nullifier, secret };
}

function createDeposit(nullifier, secret) {
    let deposit = { nullifier, secret }
    deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
    deposit.commitment = pedersenHash(deposit.preimage)
    deposit.commitmentHex = toHex(deposit.commitment)
    deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
    deposit.nullifierHex = toHex(deposit.nullifierHash)
    return deposit
}

async function generateMerkleProof(note) {
    // 解析 note 并创建存款凭证
    const { nullifier, secret } = parseNote(note);
    const deposit = createDeposit(nullifier, secret);

    // 读取本地JSON文件获取存款事件
    const jsonPath = path.join(__dirname, '..', 'cache', 'sepolia', 'deposits_eth_0.1.json');
    const fileContent = fs.readFileSync(jsonPath, 'utf8');
    const events = JSON.parse(fileContent);

    // 根据 leafIndex 排序并提取 commitment
    const leaves = events
        .sort((a, b) => a.leafIndex - b.leafIndex)
        .map(e => e.commitment);

    // 创建树，让库自动处理零值填充
    const tree = new MerkleTree(MERKLE_TREE_HEIGHT, leaves);

    // 查找当前 commitment 在树中的位置
    const depositEvent = events.find(e => e.commitment === deposit.commitmentHex);
    const leafIndex = depositEvent ? depositEvent.leafIndex : -1;

    // 验证数据正确性
    const root = tree.root();
    const isValidRoot = await tornado.isKnownRoot(toHex(root));
    const isSpent = await tornado.isSpent(deposit.nullifierHex);
    assert(isValidRoot === true, 'Merkle tree is corrupted');
    assert(isSpent === false, 'The note is already spent');
    assert(leafIndex >= 0, 'The deposit is not found in the tree');

    // 计算 merkle proof
    const { pathElements, pathIndices } = tree.path(leafIndex);
    
    return {
        root,
        pathElements,
        pathIndices,
        nullifier,
        secret
    };
}

async function initialize() {
  const buildGroth16 = require('websnark/src/groth16');
  const websnarkUtils = require('websnark/src/utils');
  
  // 初始化 groth16
  const groth16 = await buildGroth16();
  
  // 检查文件是否存在
  const circuitPath = path.join(__dirname, '..', 'build', 'circuits', 'tornado.json');
  const provingKeyPath = path.join(__dirname, '..', 'build', 'circuits', 'tornadoProvingKey.bin');
  
  if (!fs.existsSync(circuitPath)) {
    throw new Error(`电路文件不存在: ${circuitPath}`);
  }
  
  if (!fs.existsSync(provingKeyPath)) {
    throw new Error(`证明密钥文件不存在: ${provingKeyPath}`);
  }
  
  const circuit = require(circuitPath);
  const provingKey = fs.readFileSync(provingKeyPath).buffer;
  
  return { groth16, websnarkUtils, circuit, provingKey };
}

// 添加 verifyProof 合约实例
const abiVerifier = [
    "function verifyProof(bytes memory proof, uint256[6] memory input) public view returns (bool)"
];
const verifier = new ethers.Contract(
    process.env.VERIFIER_ADDRESS,
    abiVerifier,
    provider
);

async function generateProof(note) {
  // 初始化必要的组件
  const { groth16, websnarkUtils, circuit, provingKey } = await initialize();
  
  // 解析 note 并创建存款凭证
  const { nullifier, secret } = parseNote(note);
  const deposit = createDeposit(nullifier, secret);

  // 获取 merkle proof
  const { root, pathElements, pathIndices } = await generateMerkleProof(note);

  // 准备电路输入
  const input = {
    // 公共输入
    root: root,
    nullifierHash: deposit.nullifierHash,
    recipient: bigInt(process.env.RECIPIENT_ADDRESS),
    relayer: bigInt(process.env.RELAYER_ADDRESS),
    fee: bigInt(process.env.FEE || '0'),
    refund: bigInt('0'),

    // 私有输入
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: pathElements,
    pathIndices: pathIndices
  };

  //生成 proof
  console.log('Generating SNARK proof');
  console.time('Proof time');
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, provingKey);
  const { proof } = websnarkUtils.toSolidityInput(proofData);
  console.timeEnd('Proof time');

  // 为了调试，先返回输入参数
  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund)
  ];

  // 验证生成的 proof
  console.log('验证 SNARK proof...');
  try {
      const isValid = await verifier.verifyProof(proof, args);
      console.log('Proof 验证结果:', isValid ? '有效' : '无效');
      return {
          proof,
          args,
          input,
          isValid
      };
  } catch (error) {
      console.error('Proof 验证失败:', error.message);
      return {
          proof,
          args,
          input,
          isValid: false
      };
  }
}

async function main() {
  try {
    const result = await generateProof(process.env.NOTE);
    console.log('Proof:', result.proof);
    console.log('Args:', result.args);
    console.log('Proof 是否有效:', result.isValid);
    
    if (!result.isValid) {
        throw new Error('生成的 proof 验证失败');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await provider.destroy();
    process.exit(0);
  }
}

main();