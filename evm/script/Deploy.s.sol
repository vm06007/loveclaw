// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LoveClawPact.sol";

/// @notice Deploy LoveClawPact.
///
/// Local anvil:
///   anvil &
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Testnet (Base Sepolia example):
///   forge script script/Deploy.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC \
///     --private-key $PRIVATE_KEY \
///     --broadcast --verify
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        LoveClawPact pact = new LoveClawPact();
        console2.log("LoveClawPact deployed at:", address(pact));
        vm.stopBroadcast();
    }
}

/// @notice End-to-end demo: deploy, create pact with two agents, run both breach modes.
///         Run against a local anvil fork to see the full lifecycle in one shot.
///
///   forge script script/Deploy.s.sol:DemoLifecycle \
///     --rpc-url http://127.0.0.1:8545 --broadcast
contract DemoLifecycle is Script {
    function run() external {
        // Anvil default accounts
        address alice      = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        address bob        = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address agentAlice = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // anvil account 2
        address agentBob   = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // anvil account 3

        uint256 aliceKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        uint256 bobKey   = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        uint256 agentAliceKey = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
        uint256 agentBobKey   = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;

        // ── Deploy ───────────────────────────────────────────────────────────
        vm.startBroadcast(aliceKey);
        LoveClawPact pact = new LoveClawPact();
        console2.log("Deployed:", address(pact));

        uint8 triggers = uint8(1) | uint8(2); // dating app + location
        uint256 pactId = pact.createPact{value: 0.1 ether}(bob, agentAlice, agentBob, triggers);
        console2.log("Pact created, id:", pactId);
        vm.stopBroadcast();

        vm.startBroadcast(bobKey);
        pact.joinPact{value: 0.1 ether}(pactId);
        console2.log("Bob joined. Total stake:", pact.totalStake(pactId));
        vm.stopBroadcast();

        // ── Demo: instant breach (both agents agree) ─────────────────────────
        console2.log("--- Instant breach demo ---");

        vm.startBroadcast(agentBobKey);
        pact.initiateInstantBreach(pactId, bob, "ipfs://QmInstantBreachEvidence");
        console2.log("agentBob initiated instant breach against bob");
        vm.stopBroadcast();

        vm.startBroadcast(agentAliceKey);
        pact.confirmInstantBreach(pactId);
        console2.log("agentAlice confirmed - alice received full stake immediately");
        vm.stopBroadcast();

        // ── Deploy a second pact for delayed breach demo ─────────────────────
        console2.log("--- Delayed breach demo ---");

        vm.startBroadcast(aliceKey);
        uint256 pactId2 = pact.createPact{value: 0.1 ether}(bob, agentAlice, agentBob, triggers);
        console2.log("Pact2 created, id:", pactId2);
        vm.stopBroadcast();

        vm.startBroadcast(bobKey);
        pact.joinPact{value: 0.1 ether}(pactId2);
        vm.stopBroadcast();

        vm.startBroadcast(agentAliceKey);
        pact.fileBreachWithDelay(pactId2, bob, "ipfs://QmDelayedBreachEvidence", 0);
        console2.log("agentAlice filed delayed breach against bob (24h window)");
        vm.stopBroadcast();

        vm.warp(block.timestamp + 25 hours);

        vm.startBroadcast(aliceKey);
        pact.claimBreachPayout(pactId2);
        console2.log("Alice claimed breach payout after window");
        vm.stopBroadcast();
    }
}

