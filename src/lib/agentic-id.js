// 0G Agentic ID (ERC-7857) — MetaMask-based minting on 0G Galileo testnet

export const CONTRACT_ADDRESS = "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";
const ZG_CHAIN_ID = 16602;
const ZG_CHAIN_ID_HEX = "0x" + ZG_CHAIN_ID.toString(16);
const ZG_RPC = "https://evmrpc-testnet.0g.ai";
export const EXPLORER_BASE = "https://chainscan-galileo.0g.ai";

const MINIMAL_ABI = [
    {
        name: "delegateAccess",
        type: "function",
        inputs: [{ name: "assistant", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        name: "delegatedAssistant",
        type: "function",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    {
        name: "mintFee",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "iMint",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            {
                name: "datas",
                type: "tuple[]",
                components: [
                    { name: "dataDescription", type: "string" },
                    { name: "dataHash", type: "bytes32" },
                ],
            },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "payable",
    },
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "tokenOfOwnerByIndex",
        type: "function",
        inputs: [
            { name: "owner", type: "address" },
            { name: "index", type: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "authorizeUsage",
        type: "function",
        inputs: [
            { name: "tokenId", type: "uint256" },
            { name: "user", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        name: "isAuthorizedUser",
        type: "function",
        inputs: [
            { name: "tokenId", type: "uint256" },
            { name: "user", type: "address" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        name: "revokeAuthorization",
        type: "function",
        inputs: [
            { name: "tokenId", type: "uint256" },
            { name: "user", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
];

let _ethers = null;

async function loadEthers() {
    if (_ethers) return _ethers;
    const mod = await import("https://esm.sh/ethers@6.13.0");
    _ethers = mod.ethers;
    return _ethers;
}

async function ensureZgNetwork() {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainId, 16) === ZG_CHAIN_ID) return;
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ZG_CHAIN_ID_HEX }],
        });
    } catch (err) {
        if (err.code === 4902) {
            await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                    chainId: ZG_CHAIN_ID_HEX,
                    chainName: "0G-Galileo-Testnet",
                    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
                    rpcUrls: [ZG_RPC],
                    blockExplorerUrls: [EXPLORER_BASE],
                }],
            });
        } else {
            throw err;
        }
    }
}

/**
 * Mint an Agentic ID for the current user.
 * @param {string} agentName
 * @param {(status: string) => void} [onStatus] - progress callback
 * @returns {{ tokenId: string, walletAddress: string }}
 */
export async function registerAgenticId(agentName, onStatus) {
    const emit = s => onStatus?.(s);

    if (!window.ethereum) {
        throw new Error("No wallet found. Connect a wallet to register your agent.");
    }
    const ethers = await loadEthers();

    emit("connecting...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const walletAddress = accounts[0];

    await ensureZgNetwork();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, signer);

    const mintFee = await contract.mintFee();

    emit("approve in wallet...");
    const k = str => ethers.keccak256(ethers.toUtf8Bytes(str));
    const datas = [
        { dataDescription: "agent_name", dataHash: k(String(agentName)) },
        { dataDescription: "model", dataHash: k("claude-sonnet-4-6") },
        { dataDescription: "capabilities", dataHash: k("relationship_trust,breach_detection,diary") },
        { dataDescription: "system_prompt", dataHash: k(`LoveClaw trust monitoring agent for ${agentName}`) },
    ];

    const tx = await contract.iMint(walletAddress, datas, { value: mintFee });

    emit("confirming...");
    const receipt = await tx.wait();

    // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    let tokenId = null;
    for (const log of receipt.logs) {
        if (log.topics?.length >= 4 && log.topics[0]?.toLowerCase() === TRANSFER_SIG) {
            tokenId = BigInt(log.topics[3]).toString();
            break;
        }
    }

    if (!tokenId) return { tokenId: null, walletAddress, agentWalletAddress: null, agentWalletKey: null };

    // Generate a dedicated agent wallet (hot wallet for the running agent)
    emit("generating agent wallet...");
    const agentWallet = ethers.Wallet.createRandom();

    // authorizeUsage: the agent wallet can prove it's authorized for this NFT
    emit("authorizing agent...");
    const authTx = await contract.authorizeUsage(BigInt(tokenId), agentWallet.address);
    await authTx.wait();

    // delegateAccess: the agent wallet can sign on the owner's behalf
    emit("delegating access...");
    const delTx = await contract.delegateAccess(agentWallet.address);
    await delTx.wait();

    // Return raw key ONE TIME so caller can immediately encrypt it with a user PIN.
    // After that the plain key must not be retained.
    return { tokenId, walletAddress, agentWalletAddress: agentWallet.address, _agentWalletKeyOnce: agentWallet.privateKey };
}

/**
 * For users who already minted but have no agent wallet yet —
 * generate one, authorize it on their existing token, and delegate.
 * Returns { agentWalletAddress, agentWalletKey }.
 */
export async function setupAgentWallet(tokenId, onStatus) {
    const emit = s => onStatus?.(s);
    if (!window.ethereum) throw new Error("No wallet found.");
    const ethers = await loadEthers();

    emit("connecting...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureZgNetwork();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, signer);

    emit("generating agent wallet...");
    const agentWallet = ethers.Wallet.createRandom();

    emit("authorizing agent...");
    const authTx = await contract.authorizeUsage(BigInt(tokenId), agentWallet.address);
    await authTx.wait();

    emit("delegating access...");
    const delTx = await contract.delegateAccess(agentWallet.address);
    await delTx.wait();

    return { agentWalletAddress: agentWallet.address, _agentWalletKeyOnce: agentWallet.privateKey };
}

/**
 * Silently check MetaMask for a connected account and look up their token on-chain.
 * Does NOT prompt the user. Returns { tokenId, walletAddress } or null.
 */
export async function silentLookup() {
    if (!window.ethereum) return null;
    try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!accounts || !accounts[0]) return null;
        const walletAddress = accounts[0];
        const tokenId = await lookupAgenticTokenId(walletAddress);
        if (!tokenId) return null;
        return { tokenId, walletAddress };
    } catch {
        return null;
    }
}

/** Read-only lookup — finds first Agentic ID token owned by walletAddress. */
export async function lookupAgenticTokenId(walletAddress) {
    if (!walletAddress) return null;
    try {
        const ethers = await loadEthers();
        const provider = new ethers.JsonRpcProvider(ZG_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        if (balance === 0n) return null;
        const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, 0n);
        return tokenId.toString();
    } catch {
        return null;
    }
}

export function agenticExplorerUrl(tokenId) {
    return `${EXPLORER_BASE}/nft/${CONTRACT_ADDRESS}/${tokenId}`;
}

export function agentWalletExplorerUrl(walletAddress) {
    return `${EXPLORER_BASE}/address/${walletAddress}`;
}
