# Tornado Cash Interaction Demo

A demonstration project for interacting with Tornado Cash smart contracts on the Sepolia testnet, implementing deposit and zero-knowledge proof-based withdrawal functionality.

## Disclaimer

This project is intended solely for educational and research purposes. Users assume all risks and responsibilities associated with using this code. The authors are not responsible for any misuse or legal consequences resulting from the use of this software.

## Overview

This project demonstrates:
- ETH deposits to Tornado Cash contracts on Sepolia testnet
- Anonymous withdrawals using Zero-Knowledge Proofs
- Merkle tree construction and verification
- ZK-SNARK proof generation and verification

## Technical Stack

- Node.js
- ethers.js 
- circomlib (Pedersen hash implementation)
- websnark (ZK-SNARK proof generation)
- fixed-merkle-tree (Merkle tree implementation)

## Prerequisites

- Node.js 
- Git
- Basic understanding of Ethereum and Zero-Knowledge Proofs

## Installation

1. Clone the repository
```bash
git clone https://github.com/Chenxinjie65/Tornado_Sepolia.git
cd Tornado_Sepolia
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory with the following parameters:
```plaintext

Network Configuration
--------------------
RPC_URL=https://sepolia.infura.io/v3/YOUR-PROJECT-ID
NETWORK_ID=11155111
TORNADO_ADDRESS=0x8C4A04d872a6C1BE37964A21ba3a138525dFF50b

Account Configuration
--------------------
PRIVATE_KEY=your_private_key

Depoist Configuration
------------------------
DEPOSIT_AMOUNT=0.1

Withdraw Configuration
------------------------
NOTE=
RECIPIENT_ADDRESS=
RELAYER_ADDRESS=
FEE=0
```

## Usage

### 1. Deposit ETH

Execute the deposit script:
```bash
node depoist.js
```

The script will:
- Generate random nullifier and secret
- Create a commitment
- Submit the deposit transaction
- Output a note (IMPORTANT: Save this note securely)

### 2. Update Merkle Tree

Before withdrawal, fetch the latest deposit events:
```bash
node getOnchainEvents.js
```

This script fetches all deposit events from the blockchain and caches them locally. This cached data will be used later to construct the Merkle tree during the withdrawal process.

### 3. Withdraw ETH

To withdraw your deposited ETH:
1. Set your note in the `.env` file:
```plaintext
NOTE=your_saved_note
```

2. Execute the withdrawal script:
```bash
node withdraw.js
```

The script will:
- Parse your note
- Generate a zero-knowledge proof
- Submit the withdrawal transaction
- Transfer ETH to your recipient address

## Architecture

- `depoist.js`: Handles deposit functionality
- `withdraw.js`: Implements withdrawal logic with ZK-proof generation
- `getOnchainEvents.js`: Fetches and caches depoist events from blockchain
- `build/`: Contains compiled circuits and proving keys
- `cache/`: Stores deposit events 
## Security Considerations

- Never share your note or private key
- Ensure secure storage of deposit notes
- Use different addresses for deposit and withdrawal
- Wait for sufficient block confirmations
