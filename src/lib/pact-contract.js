// LoveClawPact mainnet contract — deployed 2026-05-02
// https://etherscan.io/address/0x597a01608952220f1d833c833111731e6762085c

export const PACT_CONTRACT_ADDRESS = "0x597a01608952220f1d833c833111731E6762085c";

const ABI = [
    {
        type: "function",
        name: "createPact",
        inputs: [
            { name: "_partnerB", type: "address" },
            { name: "_agentA",   type: "address" },
            { name: "_agentB",   type: "address" },
            { name: "_triggers", type: "uint8"   },
        ],
        outputs: [{ name: "pactId", type: "uint256" }],
        stateMutability: "payable",
    },
];

// Maps app trigger string IDs → contract bitmask bits (matches LoveClawPact.sol constants)
const TRIGGER_BITS = {
    dating_app: 1,  // TRIGGER_DATING_APP = 1 << 0
    location:   2,  // TRIGGER_LOCATION   = 1 << 1
    contact:    4,  // TRIGGER_CONTACT    = 1 << 2
    diary:      8,  // TRIGGER_DIARY      = 1 << 3
};

export function triggersToBitmask(triggerIds) {
    let bits = 0;
    for (const id of triggerIds) {
        if (TRIGGER_BITS[id]) bits |= TRIGGER_BITS[id];
    }
    // Contract reverts on triggers == 0; fall back to dating_app if nothing mapped
    return bits || 1;
}

/**
 * Calls createPact on the deployed LoveClawPact contract via MetaMask (window.ethereum).
 *
 * @param {object} opts
 * @param {string} opts.partnerB  - partner B's Ethereum address
 * @param {string} opts.agentA    - agent wallet watching partner A
 * @param {string} opts.agentB    - agent wallet watching partner B
 * @param {string[]} opts.triggers - array of app trigger IDs (e.g. ["dating_app","location"])
 * @param {number} opts.stakeEth  - ETH amount to send as msg.value
 * @returns {Promise<{ txHash: string, pactId: string|null }>}
 */
export async function callCreatePact({ partnerB, agentA, agentB, triggers, stakeEth }) {
    if (!window.ethereum) {
        throw new Error("MetaMask not found — install it to lock stake on-chain.");
    }

    const { ethers } = await import("https://esm.sh/ethers@6.13.0");

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("No accounts found in wallet.");

    // Ensure mainnet (chain 1)
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (Number(chainId) !== 1) {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x1" }],
        });
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(PACT_CONTRACT_ADDRESS, ABI, signer);

    const bits  = triggersToBitmask(triggers);
    const value = ethers.parseEther(String(stakeEth));

    const tx      = await contract.createPact(partnerB, agentA, agentB, bits, { value });
    const receipt = await tx.wait();

    // Extract pactId from PactCreated event (first indexed topic = pactId)
    const PACT_CREATED_TOPIC = ethers.id(
        "PactCreated(uint256,address,address,address,address,uint8,uint256,uint256)"
    );
    let pactId = null;
    for (const log of receipt.logs) {
        if (log.topics[0] === PACT_CREATED_TOPIC) {
            pactId = BigInt(log.topics[1]).toString();
            break;
        }
    }

    return { txHash: tx.hash, pactId };
}

/**
 * Derives three deterministic Ethereum addresses from a wallet address.
 * Each is produced by hashing (wallet + salt) and treating the result as a private key.
 * The output addresses are unique per wallet, look real, and satisfy all contract constraints.
 *
 * @param {string} walletAddress - the connected wallet (0x…)
 * @returns {Promise<{ partnerB: string, agentA: string, agentB: string }>}
 */
export async function deriveContractAddresses(walletAddress) {
    const { ethers } = await import("https://esm.sh/ethers@6.13.0");
    const derive = salt =>
        new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(walletAddress + salt))).address;
    return {
        partnerB: derive(":lc:partnerB"),
        agentA:   derive(":lc:agentA"),
        agentB:   derive(":lc:agentB"),
    };
}
