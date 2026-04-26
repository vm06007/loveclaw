import { ethers } from "ethers";

/**
 * Optional `WALLET_ADDRESS` in `.env.local` overrides the address derived from
 * `PRIVATE_KEY` (same 0x-prefixed checksummed address MetaMask shows).
 */
export function resolveWalletAddress(): string | null {
    const override = process.env.WALLET_ADDRESS?.trim();
    if (override) {
        try {
            return ethers.getAddress(override);
        } catch {
            return null;
        }
    }
    const pk = process.env.PRIVATE_KEY?.trim();
    if (!pk) {
        return null;
    }
    try {
        return new ethers.Wallet(pk).address;
    } catch {
        return null;
    }
}
