/**
 * Easter egg: triple-click the claw art calls LoveClawPact.dissolvePact(9)
 * on Ethereum mainnet — same on-chain path as the in-app dissolve flow.
 */
const PACT_CONTRACT_ADDRESS = "0x597a01608952220f1d833c833111731E6762085c";
const PRESET_PACT_ID = 9;

const DISSOLVE_ABI = [
    {
        type: "function",
        name: "dissolvePact",
        inputs: [{ name: "_pactId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
];

function showWebToast(message, isError) {
    const el = document.getElementById("web-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("is-hidden");
    el.classList.toggle("web-toast--err", Boolean(isError));
    clearTimeout(showWebToast._hide);
    showWebToast._hide = setTimeout(() => el.classList.add("is-hidden"), 10000);
}

async function dissolvePresetPact() {
    if (!window.ethereum) {
        showWebToast("Connect a wallet first.", true);
        return;
    }
    showWebToast(`Confirm dissolvePact(${PRESET_PACT_ID}) in your wallet…`);
    try {
        const { ethers } = await import("https://esm.sh/ethers@6.13.0");

        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (!accounts?.length) {
            showWebToast("No account selected.", true);
            return;
        }

        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (Number(chainId) !== 1) {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x1" }],
            });
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(PACT_CONTRACT_ADDRESS, DISSOLVE_ABI, signer);
        const tx = await contract.dissolvePact(BigInt(PRESET_PACT_ID));
        showWebToast(`Tx sent ${tx.hash.slice(0, 12)}…`);
        await tx.wait();
        showWebToast(`dissolvePact(${PRESET_PACT_ID}) confirmed`);
    } catch (err) {
        console.warn("[web dissolve-secret]", err);
        const m = String(err?.shortMessage || err?.message || err);
        showWebToast(m.length > 140 ? `${m.slice(0, 140)}…` : m, true);
    }
}

function bindSecretTripleClick() {
    const img = document.querySelector(".web-empty-icon-img");
    if (!img) return;

    let count = 0;
    let resetTimer = null;
    let busy = false;

    img.addEventListener("click", () => {
        if (busy) return;
        count += 1;
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            count = 0;
        }, 750);
        if (count < 3) return;
        count = 0;
        clearTimeout(resetTimer);
        busy = true;
        void dissolvePresetPact().finally(() => {
            busy = false;
        });
    });
}

bindSecretTripleClick();
