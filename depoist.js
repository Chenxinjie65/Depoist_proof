require('dotenv').config();
const crypto = require('crypto')
const { bigInt } = require('snarkjs')
const circomlib = require('circomlib')
const { ethers } = require("ethers");

const currency = 'eth'
const amount = process.env.DEPOSIT_AMOUNT
const netId = process.env.NETWORK_ID

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const abiDeposit = [
    "function deposit(bytes32 _commitment) external payable",
];
const tornado = new ethers.Contract(
    process.env.TORNADO_ADDRESS,
    abiDeposit,
    provider
);
const rbigint = nbytes => bigInt.leBuff2int(crypto.randomBytes(nbytes))

const toHex = (number, length = 32) =>
    '0x' +
    (number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)).padStart(length * 2, '0')

const pedersenHash = (data) => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

function createDeposit({ nullifier, secret }) {
    let deposit = { nullifier, secret }
    deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
    deposit.commitment = pedersenHash(deposit.preimage)
    deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
    return deposit
}

async function deposit() {
    try {
        // 创建存款凭证和 note
        const deposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
        const note = toHex(deposit.preimage, 62)
        const noteString = `tornado-${currency}-${amount}-${netId}-${note}`
        console.log(`Your note: ${noteString}`)

        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('请在 .env 文件中设置 PRIVATE_KEY');
        }
        const wallet = new ethers.Wallet(privateKey, provider);

        const commitment = toHex(deposit.commitment)
        const value = ethers.parseEther(amount.toString())

        console.log('发送存款交易...')
        const tx = await tornado.connect(wallet).deposit(
            commitment,
            {
                value: value,
                gasLimit: 1100000
            }
        )

        console.log('交易已发送，等待确认...')
        console.log('交易哈希:', tx.hash)

        const receipt = await tx.wait()
        console.log('交易已确认，区块号:', receipt.blockNumber)

        return {
            success: true,
            note: noteString,
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber
        }
    } catch (error) {
        console.error('存款失败:', error.message)
        return {
            success: false,
            error: error.message
        }
    }
}

async function main() {
    try {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('请在 .env 文件中设置 PRIVATE_KEY');
        }
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // 获取当前网络 gas 价格
        const feeData = await provider.getFeeData();
        console.log('当前网络 Gas 价格:', ethers.formatUnits(feeData.maxFeePerGas, "gwei"), "gwei");
        
        // 计算预估成本
        const gasLimit = 1100000n;
        const maxFeePerGas = feeData.maxFeePerGas;
        const value = ethers.parseEther(amount.toString());
        const estimatedCost = value + (gasLimit * maxFeePerGas);
        const currentBalance = await provider.getBalance(wallet.address);
        
        console.log('预估总成本:', ethers.formatEther(estimatedCost), 'ETH');
        console.log('当前余额:', ethers.formatEther(currentBalance), 'ETH');

        if(currentBalance < estimatedCost) {
            console.error('余额不足，无法进行存款。');
            return;
        }

        const result = await deposit();
        if (result.success) {
            console.log('存款成功！');
            console.log('请保存好你的 note:', result.note);
        } else {
            console.error('存款失败:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await provider.destroy();
        process.exit(0);
    }
}

main();