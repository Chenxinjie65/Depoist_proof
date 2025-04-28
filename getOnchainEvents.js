require('dotenv').config();
const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');

const URL = process.env.RPC_URL;
const provider = new ethers.JsonRpcProvider(URL);


/*
  检索链上的depoist事件，提前写入到本地cache文件夹中，方便后续使用
  默认写到cache文件夹下的sepolia文件夹中
*/
const abi = [
    "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)"
];

const addresstornado = process.env.TORNADO_ADDRESS;
const contract = new ethers.Contract(addresstornado, abi, provider);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(delay * (i + 1));
        }
    }
}

async function main() {
    try {
        const outputDir = path.join(__dirname, 'cache', 'sepolia');
        const outputPath = path.join(outputDir, 'deposits_eth_0.1.json');

        // 确保目录存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 确定起始区块
        let startBlock = 0;
        let existingEvents = [];
        if (fs.existsSync(outputPath)) {
            const fileContent = fs.readFileSync(outputPath, 'utf8');
            existingEvents = JSON.parse(fileContent);
            if (existingEvents.length > 0) {
                startBlock = existingEvents[existingEvents.length - 1].blockNumber;
                console.log(`从区块 ${startBlock} 开始继续检索...`);
            }
        }

        const currentBlock = await provider.getBlockNumber();
        console.log(`当前区块高度: ${currentBlock}`);

        const transferEvents = await contract.queryFilter('Deposit', startBlock, 'latest');
        console.log(`找到 ${transferEvents.length} 个新事件，开始处理...`);

        const newEvents = [];
        for (const event of transferEvents) {
            // 跳过已经存在的区块的事件
            if (event.blockNumber <= startBlock) continue;

            await sleep(100);
            const block = await retry(() => event.getBlock());
            newEvents.push({
                blockNumber: Number(event.blockNumber),
                transactionHash: event.transactionHash,
                commitment: event.args[0],
                leafIndex: Number(event.args[1]),
                timestamp: block.timestamp.toString()
            });
            console.log(`处理进度: ${newEvents.length}/${transferEvents.length}`);
        }

        // 合并并排序所有事件
        const allEvents = [...existingEvents, ...newEvents];
        allEvents.sort((a, b) => a.leafIndex - b.leafIndex);

        // 写入文件
        fs.writeFileSync(outputPath, JSON.stringify(allEvents, null, 2));
        console.log(`数据已保存到: ${outputPath}`);
        console.log(`共更新了 ${newEvents.length} 条记录`);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();