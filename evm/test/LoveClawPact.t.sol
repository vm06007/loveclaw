// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LoveClawPact.sol";

contract LoveClawPactTest is Test {
    LoveClawPact public pact;

    address alice      = makeAddr("alice");
    address bob        = makeAddr("bob");
    address agentAlice = makeAddr("agentAlice"); // agent assigned to alice / partnerA
    address agentBob   = makeAddr("agentBob");   // agent assigned to bob   / partnerB
    address carol      = makeAddr("carol");       // uninvolved third party

    uint8 constant DEFAULT_TRIGGERS = 0x03; // TRIGGER_DATING_APP | TRIGGER_LOCATION

    function setUp() public {
        pact = new LoveClawPact();
        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
        vm.deal(carol, 10 ether);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _createAndJoin(uint256 stakeA, uint256 stakeB)
        internal
        returns (uint256 pactId)
    {
        vm.prank(alice);
        pactId = pact.createPact{value: stakeA}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
        vm.prank(bob);
        pact.joinPact{value: stakeB}(pactId);
    }

    function _createAndJoin() internal returns (uint256) {
        return _createAndJoin(1 ether, 1 ether);
    }

    // ─── Creation ────────────────────────────────────────────────────────────

    function test_createPact_basic() public {
        vm.prank(alice);
        uint256 id = pact.createPact{value: 1 ether}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);

        assertEq(id, 1);
        assertEq(pact.activePactOf(alice), 1);
        assertEq(pact.activePactOf(bob), 1);

        LoveClawPact.Pact memory p = pact.getPact(1);
        assertEq(p.partnerA, alice);
        assertEq(p.partnerB, bob);
        assertEq(p.agentA,   agentAlice);
        assertEq(p.agentB,   agentBob);
        assertEq(p.stakeA,   1 ether);
        assertEq(p.stakeB,   0);
        assertEq(uint8(p.state), uint8(LoveClawPact.PactState.Active));
        assertEq(p.triggers, DEFAULT_TRIGGERS);
    }

    function test_joinPact() public {
        vm.prank(alice);
        uint256 id = pact.createPact{value: 1 ether}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
        vm.prank(bob);
        pact.joinPact{value: 2 ether}(id);

        LoveClawPact.Pact memory p = pact.getPact(id);
        assertEq(p.stakeA, 1 ether);
        assertEq(p.stakeB, 2 ether);
        assertEq(pact.totalStake(id), 3 ether);
    }

    function test_createPact_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit PactCreated(1, alice, bob, agentAlice, agentBob, DEFAULT_TRIGGERS, 1 ether, 0);
        vm.prank(alice);
        pact.createPact{value: 1 ether}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_zeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(ZeroAddress.selector);
        pact.createPact{value: 0}(address(0), agentAlice, agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_agentZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(ZeroAddress.selector);
        pact.createPact{value: 0}(bob, address(0), agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_sameAddress() public {
        vm.prank(alice);
        vm.expectRevert(SameAddress.selector);
        pact.createPact{value: 0}(alice, agentAlice, agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_zeroTriggers() public {
        vm.prank(alice);
        vm.expectRevert(InvalidTriggers.selector);
        pact.createPact{value: 0}(bob, agentAlice, agentBob, 0);
    }

    function test_revert_createPact_agentsMustDiffer() public {
        vm.prank(alice);
        vm.expectRevert(AgentsMustDiffer.selector);
        pact.createPact{value: 0}(bob, agentAlice, agentAlice, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_agentCannotBePartner() public {
        vm.prank(alice);
        vm.expectRevert(AgentCannotBePartner.selector);
        pact.createPact{value: 0}(bob, alice, agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_createPact_alreadyInPact() public {
        _createAndJoin();
        vm.prank(alice);
        vm.expectRevert(AlreadyInPact.selector);
        pact.createPact{value: 0}(carol, agentAlice, agentBob, DEFAULT_TRIGGERS);
    }

    function test_revert_joinPact_notPartner() public {
        vm.prank(alice);
        uint256 id = pact.createPact{value: 1 ether}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
        vm.prank(carol);
        vm.expectRevert(NotPartner.selector);
        pact.joinPact{value: 1 ether}(id);
    }

    // ─── Triggers ────────────────────────────────────────────────────────────

    function test_hasTrigger() public {
        uint256 id = _createAndJoin();
        assertTrue(pact.hasTrigger(id, uint8(1)));
        assertTrue(pact.hasTrigger(id, uint8(2)));
        assertFalse(pact.hasTrigger(id, uint8(4)));
        assertFalse(pact.hasTrigger(id, uint8(8)));
    }

    // ─── Only agents can breach — partners cannot ─────────────────────────────

    function test_revert_partnerCannotInitiateInstantBreach() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        vm.expectRevert(NotAgent.selector);
        pact.initiateInstantBreach(id, bob, "evidence");
    }

    function test_revert_partnerCannotFileBreachWithDelay() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        vm.expectRevert(NotAgent.selector);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
    }

    // ─── Instant breach ───────────────────────────────────────────────────────

    function test_instantBreach_fullFlow() public {
        uint256 id = _createAndJoin(1 ether, 1 ether);
        uint256 aliceBefore = alice.balance;

        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "tinder detected on bob's phone");

        LoveClawPact.Pact memory p = pact.getPact(id);
        assertEq(uint8(p.state), uint8(LoveClawPact.PactState.InstantBreachPending));
        assertEq(p.breacher, bob);
        assertEq(p.breachInitiator, agentBob);

        vm.prank(agentAlice);
        pact.confirmInstantBreach(id);

        assertEq(alice.balance, aliceBefore + 2 ether); // alice is victim
        assertEq(pact.totalStake(id), 0);
        assertEq(pact.activePactOf(alice), 0);
        assertEq(pact.activePactOf(bob), 0);
        assertEq(uint8(pact.getPact(id).state), uint8(LoveClawPact.PactState.Dissolved));
    }

    function test_instantBreach_agentAInitiates() public {
        uint256 id = _createAndJoin(1 ether, 1 ether);
        uint256 bobBefore = bob.balance;

        vm.prank(agentAlice);
        pact.initiateInstantBreach(id, alice, "evidence against alice");

        vm.prank(agentBob);
        pact.confirmInstantBreach(id);

        assertEq(bob.balance, bobBefore + 2 ether);
    }

    function test_instantBreach_emitsEvents() public {
        uint256 id = _createAndJoin();

        vm.expectEmit(true, true, true, false);
        emit InstantBreachInitiated(id, agentBob, bob, "evidence");
        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        vm.expectEmit(true, true, false, true);
        emit InstantBreachConfirmed(id, alice, 2 ether);
        vm.prank(agentAlice);
        pact.confirmInstantBreach(id);
    }

    function test_rejectInstantBreach() public {
        uint256 id = _createAndJoin(1 ether, 1 ether);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore   = bob.balance;

        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        vm.prank(agentAlice);
        pact.rejectInstantBreach(id);

        // Pact is Active again, no ETH moved
        assertEq(uint8(pact.getPact(id).state), uint8(LoveClawPact.PactState.Active));
        assertEq(pact.getPact(id).breacher, address(0));
        assertEq(alice.balance, aliceBefore);
        assertEq(bob.balance,   bobBefore);
    }

    function test_rejectInstantBreach_emitsEvent() public {
        uint256 id = _createAndJoin();
        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        vm.expectEmit(true, true, false, false);
        emit InstantBreachRejected(id, agentAlice);
        vm.prank(agentAlice);
        pact.rejectInstantBreach(id);
    }

    function test_revert_instantBreach_sameAgentCannotConfirm() public {
        uint256 id = _createAndJoin();
        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        vm.prank(agentBob);
        vm.expectRevert(SameAgentCannotConfirm.selector);
        pact.confirmInstantBreach(id);
    }

    function test_revert_instantBreach_notPending() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        vm.expectRevert(NotInstantBreachPending.selector);
        pact.confirmInstantBreach(id);
    }

    function test_revert_instantBreach_pactNotActive() public {
        uint256 id = _createAndJoin();
        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        // already InstantBreachPending, not Active
        vm.prank(agentAlice);
        vm.expectRevert(PactNotActive.selector);
        pact.initiateInstantBreach(id, alice, "counter");
    }

    function test_revert_instantBreach_evidenceTooLong() public {
        uint256 id = _createAndJoin();
        string memory longEvidence = new string(1025);
        vm.prank(agentBob);
        vm.expectRevert(EvidenceTooLong.selector);
        pact.initiateInstantBreach(id, bob, longEvidence);
    }

    // ─── Delayed breach ───────────────────────────────────────────────────────

    function test_fileBreachWithDelay_defaultWindow() public {
        uint256 id = _createAndJoin();

        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "ipfs://QmFakeEvidenceCID", 0);

        LoveClawPact.Pact memory p = pact.getPact(id);
        assertEq(uint8(p.state), uint8(LoveClawPact.PactState.Breached));
        assertEq(p.breacher, bob);
        assertEq(p.breachEvidence, "ipfs://QmFakeEvidenceCID");
        assertEq(p.breachWindow, 24 hours);
        assertGt(p.breachFiledAt, 0);
    }

    function test_fileBreachWithDelay_customWindow() public {
        uint256 id = _createAndJoin();
        vm.prank(agentBob);
        pact.fileBreachWithDelay(id, alice, "evidence", 48 hours);

        assertEq(pact.getPact(id).breachWindow, 48 hours);
    }

    function test_fileBreachWithDelay_emitsEvent() public {
        uint256 id = _createAndJoin();
        vm.expectEmit(true, true, true, false);
        emit BreachFiled(id, agentAlice, bob, "evidence", 24 hours, block.timestamp);
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
    }

    function test_disputeBreach() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);

        vm.prank(bob);
        pact.disputeBreach(id);

        assertTrue(pact.getPact(id).disputeFiled);
    }

    function test_claimBreachPayout() public {
        uint256 id = _createAndJoin(1 ether, 1 ether);
        uint256 aliceBefore = alice.balance;

        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "tinder detected", 0);

        vm.warp(block.timestamp + 25 hours);

        vm.prank(alice);
        pact.claimBreachPayout(id);

        assertEq(alice.balance, aliceBefore + 2 ether);
        assertEq(pact.totalStake(id), 0);
        assertEq(pact.activePactOf(alice), 0);
        assertEq(pact.activePactOf(bob), 0);
    }

    function test_claimBreachPayout_emitsEvent() public {
        uint256 id = _createAndJoin(1 ether, 1 ether);
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        vm.warp(block.timestamp + 25 hours);

        vm.expectEmit(true, true, false, true);
        emit BreachConfirmed(id, alice, 2 ether);
        vm.prank(alice);
        pact.claimBreachPayout(id);
    }

    function test_isDisputeWindowOpen() public {
        uint256 id = _createAndJoin();
        assertFalse(pact.isDisputeWindowOpen(id));

        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        assertTrue(pact.isDisputeWindowOpen(id));

        vm.warp(block.timestamp + 25 hours);
        assertFalse(pact.isDisputeWindowOpen(id));
    }

    function test_revert_claimBreachPayout_windowStillOpen() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);

        vm.warp(block.timestamp + 12 hours);
        vm.prank(alice);
        vm.expectRevert(DisputeWindowOpen.selector);
        pact.claimBreachPayout(id);
    }

    function test_revert_claimBreachPayout_breacherCannotClaim() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        vm.warp(block.timestamp + 25 hours);

        vm.prank(bob);
        vm.expectRevert(NotBreacher.selector);
        pact.claimBreachPayout(id);
    }

    function test_revert_claimBreachPayout_noBreachFiled() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        vm.expectRevert(NoBreachFiled.selector);
        pact.claimBreachPayout(id);
    }

    function test_revert_disputeBreach_windowClosed() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        vm.warp(block.timestamp + 25 hours);

        vm.prank(bob);
        vm.expectRevert(DisputeWindowClosed.selector);
        pact.disputeBreach(id);
    }

    function test_revert_fileBreachWithDelay_invalidWindow() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        vm.expectRevert(InvalidDisputeWindow.selector);
        pact.fileBreachWithDelay(id, bob, "evidence", 8 days);
    }

    // ─── Unequal stakes ──────────────────────────────────────────────────────

    function test_claimBreachPayout_unequalStakes() public {
        uint256 id = _createAndJoin(3 ether, 1 ether);
        uint256 aliceBefore = alice.balance;

        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        vm.warp(block.timestamp + 25 hours);

        vm.prank(alice);
        pact.claimBreachPayout(id);

        assertEq(alice.balance, aliceBefore + 4 ether);
    }

    // ─── Dissolution ─────────────────────────────────────────────────────────

    function test_dissolvePact_equalStakes() public {
        uint256 id = _createAndJoin(2 ether, 2 ether);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore   = bob.balance;

        vm.prank(alice);
        pact.dissolvePact(id);

        assertEq(alice.balance, aliceBefore + 2 ether);
        assertEq(bob.balance,   bobBefore   + 2 ether);
        assertEq(pact.activePactOf(alice), 0);
        assertEq(pact.activePactOf(bob),   0);
        assertEq(uint8(pact.getPact(id).state), uint8(LoveClawPact.PactState.Dissolved));
    }

    function test_dissolvePact_oddStake() public {
        uint256 id = _createAndJoin(2, 1);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore   = bob.balance;

        vm.prank(alice);
        pact.dissolvePact(id);

        assertEq(alice.balance, aliceBefore + 2);
        assertEq(bob.balance,   bobBefore   + 1);
    }

    function test_dissolvePact_emitsEvent() public {
        uint256 id = _createAndJoin(2 ether, 2 ether);
        vm.expectEmit(true, true, false, true);
        emit PactDissolved(id, alice, 2 ether);
        vm.prank(alice);
        pact.dissolvePact(id);
    }

    function test_revert_dissolvePact_notPartner() public {
        uint256 id = _createAndJoin();
        vm.prank(carol);
        vm.expectRevert(NotPartner.selector);
        pact.dissolvePact(id);
    }

    function test_revert_dissolvePact_alreadyBreached() public {
        uint256 id = _createAndJoin();
        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);

        vm.prank(alice);
        vm.expectRevert(PactNotActive.selector);
        pact.dissolvePact(id);
    }

    // ─── Trigger amendment ───────────────────────────────────────────────────

    function test_amendTriggers() public {
        uint256 id = _createAndJoin();
        uint8 newTriggers = uint8(8);

        vm.prank(alice);
        pact.proposeTriggerAmendment(id, newTriggers);
        assertEq(pact.getPact(id).triggers, DEFAULT_TRIGGERS); // unchanged yet

        vm.prank(bob);
        pact.acceptTriggerAmendment(id);

        assertEq(pact.getPact(id).triggers, newTriggers);
        assertFalse(pact.hasTrigger(id, uint8(1)));
        assertTrue(pact.hasTrigger(id, uint8(8)));
    }

    function test_amendTriggers_emitsEvents() public {
        uint256 id = _createAndJoin();
        uint8 newTriggers = uint8(4);

        vm.expectEmit(true, true, false, true);
        emit AmendmentProposed(id, alice, newTriggers);
        vm.prank(alice);
        pact.proposeTriggerAmendment(id, newTriggers);

        vm.expectEmit(true, false, false, true);
        emit TriggersAmended(id, DEFAULT_TRIGGERS, newTriggers);
        vm.prank(bob);
        pact.acceptTriggerAmendment(id);
    }

    function test_revert_acceptAmendment_noProposal() public {
        uint256 id = _createAndJoin();
        vm.prank(bob);
        vm.expectRevert(AmendmentNotPending.selector);
        pact.acceptTriggerAmendment(id);
    }

    function test_revert_acceptAmendment_proposerCannotAccept() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        pact.proposeTriggerAmendment(id, uint8(8));

        vm.prank(alice);
        vm.expectRevert(NotAmendmentProposer.selector);
        pact.acceptTriggerAmendment(id);
    }

    function test_revert_amendTriggers_zeroTriggers() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        vm.expectRevert(InvalidTriggers.selector);
        pact.proposeTriggerAmendment(id, 0);
    }

    function test_revert_amendTriggers_notActive() public {
        uint256 id = _createAndJoin();
        vm.prank(alice);
        pact.dissolvePact(id);

        vm.prank(alice);
        vm.expectRevert(PactNotActive.selector);
        pact.proposeTriggerAmendment(id, uint8(8));
    }

    // ─── No-stake pact ───────────────────────────────────────────────────────

    function test_noStakePact_instantBreach() public {
        vm.prank(alice);
        uint256 id = pact.createPact{value: 0}(bob, agentAlice, agentBob, uint8(1));
        vm.prank(bob);
        pact.joinPact{value: 0}(id);

        vm.prank(agentBob);
        pact.initiateInstantBreach(id, bob, "evidence");

        uint256 aliceBefore = alice.balance;
        vm.prank(agentAlice);
        pact.confirmInstantBreach(id);
        assertEq(alice.balance, aliceBefore); // no change, no stake
    }

    function test_noStakePact_delayedBreach() public {
        vm.prank(alice);
        uint256 id = pact.createPact{value: 0}(bob, agentAlice, agentBob, uint8(1));
        vm.prank(bob);
        pact.joinPact{value: 0}(id);

        vm.prank(agentAlice);
        pact.fileBreachWithDelay(id, bob, "evidence", 0);
        vm.warp(block.timestamp + 25 hours);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        pact.claimBreachPayout(id);
        assertEq(alice.balance, aliceBefore);
    }

    // ─── Fuzz tests ──────────────────────────────────────────────────────────

    function testFuzz_createPact_stakePreserved(uint96 stakeA, uint96 stakeB) public {
        vm.assume(stakeA <= 5 ether);
        vm.assume(stakeB <= 5 ether);
        vm.deal(alice, stakeA);
        vm.deal(bob,   stakeB);

        vm.prank(alice);
        uint256 id = pact.createPact{value: stakeA}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
        vm.prank(bob);
        pact.joinPact{value: stakeB}(id);

        assertEq(pact.totalStake(id), uint256(stakeA) + uint256(stakeB));
    }

    function testFuzz_dissolveSplitsEvenly(uint96 stakeA, uint96 stakeB) public {
        vm.assume(stakeA <= 5 ether);
        vm.assume(stakeB <= 5 ether);
        vm.deal(alice, stakeA);
        vm.deal(bob,   stakeB);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore   = bob.balance;

        vm.prank(alice);
        uint256 id = pact.createPact{value: stakeA}(bob, agentAlice, agentBob, DEFAULT_TRIGGERS);
        vm.prank(bob);
        pact.joinPact{value: stakeB}(id);

        vm.prank(alice);
        pact.dissolvePact(id);

        uint256 total = uint256(stakeA) + uint256(stakeB);
        assertEq(alice.balance + bob.balance, aliceBefore + bobBefore);
        uint256 diff = alice.balance > bob.balance
            ? alice.balance - bob.balance
            : bob.balance - alice.balance;
        assertLe(diff, total % 2 + 1);
    }

    function testFuzz_triggers_bitmask(uint8 triggers) public {
        vm.assume(triggers != 0);
        vm.prank(alice);
        uint256 id = pact.createPact{value: 0}(bob, agentAlice, agentBob, triggers);
        assertEq(pact.getPact(id).triggers, triggers);
    }
}
