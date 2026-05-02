// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── Events ──────────────────────────────────────────────────────────────────

event PactCreated(
    uint256 indexed pactId,
    address indexed partnerA,
    address indexed partnerB,
    address agentA,
    address agentB,
    uint8   triggers,
    uint256 stakeA,
    uint256 stakeB
);

event InstantBreachInitiated(
    uint256 indexed pactId,
    address indexed agent,
    address indexed breacher,
    string  evidence
);

event InstantBreachConfirmed(
    uint256 indexed pactId,
    address indexed victim,
    uint256 payout
);

event InstantBreachRejected(
    uint256 indexed pactId,
    address indexed agent
);

event BreachFiled(
    uint256 indexed pactId,
    address indexed agent,
    address indexed breacher,
    string  evidence,
    uint256 window,
    uint256 filedAt
);

event BreachDisputed(
    uint256 indexed pactId,
    address indexed disputer
);

event BreachConfirmed(
    uint256 indexed pactId,
    address indexed victim,
    uint256 payout
);

event PactDissolved(
    uint256 indexed pactId,
    address indexed initiator,
    uint256 splitAmount
);

event TriggersAmended(
    uint256 indexed pactId,
    uint8 oldTriggers,
    uint8 newTriggers
);

event AmendmentProposed(
    uint256 indexed pactId,
    address proposer,
    uint8   proposed
);

// ─── Errors ──────────────────────────────────────────────────────────────────

error NotPartner();
error NotAgent();
error AlreadyInPact();
error PactNotActive();
error NoBreachFiled();
error DisputeWindowOpen();
error DisputeWindowClosed();
error NotBreacher();
error SameAddress();
error ZeroAddress();
error EvidenceTooLong();
error InvalidTriggers();
error NotAmendmentProposer();
error AmendmentNotPending();
error AgentsMustDiffer();
error AgentCannotBePartner();
error NotInstantBreachPending();
error SameAgentCannotConfirm();
error InvalidDisputeWindow();
error BreachAlreadyPending();