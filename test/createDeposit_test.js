require('dotenv').config();

const circomlib = require('circomlib')
const { bigInt } = require('snarkjs')

const pedersenHash = (data) => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

const toHex = (number, length = 32) =>
    '0x' +
    (number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)).padStart(length * 2, '0')
  

function createDeposit(nullifier, secret) {
    // 确保输入是 bigInt 类型
    nullifier = bigInt(nullifier);
    secret = bigInt(secret);
    
    let deposit = { nullifier, secret }
    deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
    deposit.commitment = pedersenHash(deposit.preimage)
    deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
    return deposit
}

// 从环境变量读取时需要确保值存在
if (!process.env.NULLIFIER || !process.env.SECRET) {
    console.error('请在 .env 文件中设置 NULLIFIER 和 SECRET');
    process.exit(1);
}

const nullifier = process.env.NULLIFIER;
const secret = process.env.SECRET;

  const deposit = createDeposit(nullifier, secret)
  console.log(deposit)
  console.log('Created Deposit:', {
    note: toHex(deposit.preimage, 62),
    commitmentHex: toHex(deposit.commitment),
    nullifierHashHex: toHex(deposit.nullifierHash),
  })  