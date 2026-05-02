// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LoveClawPactEventsAndErrors.sol";

/// @title  LoveClawPact
/// @notice On-chain relationship pact. Two AI agents (one per partner) are assigned

contract LoveClawPact {

    // ─── Trigger bitmask ────────────────────────────────────────────────────
    uint8 public constant TRIGGER_DATING_APP = 1 << 0; // 1
    uint8 public constant TRIGGER_LOCATION   = 1 << 1; // 2
    uint8 public constant TRIGGER_CONTACT    = 1 << 2; // 4
    uint8 public constant TRIGGER_DIARY      = 1 << 3; // 8

    uint256 public constant DEFAULT_DISPUTE_WINDOW = 24 hours;
    uint256 public constant MAX_DISPUTE_WINDOW     = 7 days;

    // ─── Pact state ─────────────────────────────────────────────────────────
    enum PactState {
        Active,
        InstantBreachPending,
        Breached,
        Dissolved
    }

    struct Pact {
        address partnerA;
        address partnerB;
        address agentA; // AI agent assigned to monitor partnerA
        address agentB; // AI agent assigned to monitor partnerB
        uint256 stakeA;
        uint256 stakeB;
        uint8 triggers;
        uint256 createdAt;
        PactState state;
        // breach fields (shared by both modes)
        address  breacher; // accused partner
        address  breachInitiator; // agent who filed first
        uint256  breachFiledAt;
        string   breachEvidence;
        uint256  breachWindow; // 0 = instant-pending; >0 = delayed dispute window
        bool     disputeFiled;
        // trigger amendment
        uint8    proposedTriggers;
        address  amendmentProposer;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    uint256 public nextPactId;
    mapping(uint256 => Pact) public pacts;
    mapping(address => uint256) public activePactOf;

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyPartner(
        uint256 _pactId
    ) {
        Pact storage p = pacts[_pactId];
        if (msg.sender != p.partnerA && msg.sender != p.partnerB) revert NotPartner();
        _;
    }

    modifier onlyAgent(
        uint256 _pactId
    ) {
        Pact storage p = pacts[_pactId];
        if (msg.sender != p.agentA && msg.sender != p.agentB) revert NotAgent();
        _;
    }

    modifier pactActive(
        uint256 _pactId
    ) {
        if (pacts[_pactId].state != PactState.Active) revert PactNotActive();
        _;
    }

    // ─── Pact creation ───────────────────────────────────────────────────────

    /// @notice Creator calls this providing partnerB's address, one agent per partner,
    ///         and agreed monitoring triggers. PartnerB joins via `joinPact`.
    function createPact(
        address _partnerB,
        address _agentA,
        address _agentB,
        uint8   _triggers
    )
        external payable
        returns (uint256 pactId)
    {
        if (_partnerB == address(0) || _agentA == address(0) || _agentB == address(0))
            revert ZeroAddress();
        if (_partnerB == msg.sender) revert SameAddress();
        if (_agentA == _agentB) revert AgentsMustDiffer();
        if (_agentA == msg.sender || _agentA == _partnerB ||
            _agentB == msg.sender || _agentB == _partnerB) revert AgentCannotBePartner();
        if (_triggers == 0) revert InvalidTriggers();
        if (activePactOf[msg.sender] != 0) revert AlreadyInPact();
        if (activePactOf[_partnerB]  != 0) revert AlreadyInPact();

        pactId = ++nextPactId;
        pacts[pactId] = Pact({
            partnerA:          msg.sender,
            partnerB:          _partnerB,
            agentA:            _agentA,
            agentB:            _agentB,
            stakeA:            msg.value,
            stakeB:            0,
            triggers:          _triggers,
            createdAt:         block.timestamp,
            state:             PactState.Active,
            breacher:          address(0),
            breachInitiator:   address(0),
            breachFiledAt:     0,
            breachEvidence:    "",
            breachWindow:      0,
            disputeFiled:      false,
            proposedTriggers:  0,
            amendmentProposer: address(0)
        });

        activePactOf[msg.sender] = pactId;
        activePactOf[_partnerB]  = pactId;

        emit PactCreated(pactId, msg.sender, _partnerB, _agentA, _agentB, _triggers, msg.value, 0);
    }

    /// @notice partnerB joins and deposits their stake.
    function joinPact(
        uint256 _pactId
    )
        external payable
        onlyPartner(_pactId)
        pactActive(_pactId)
    {
        Pact storage p = pacts[_pactId];
        if (msg.sender != p.partnerB) revert NotPartner();
        if (p.stakeB != 0) revert AlreadyInPact();
        p.stakeB = msg.value;
        emit PactCreated(
            _pactId, p.partnerA, p.partnerB, p.agentA, p.agentB,
            p.triggers, p.stakeA, msg.value
        );
    }

    // ─── Instant breach (both agents must agree) ─────────────────────────────

    function initiateInstantBreach(
        uint256         _pactId,
        address         _accused,
        string calldata _evidence
    )
        external
        onlyAgent(_pactId)
        pactActive(_pactId)
    {
        if (bytes(_evidence).length > 1024) revert EvidenceTooLong();
        Pact storage p = pacts[_pactId];
        if (_accused != p.partnerA && _accused != p.partnerB) revert NotPartner();

        p.breacher        = _accused;
        p.breachInitiator = msg.sender;
        p.breachFiledAt   = block.timestamp;
        p.breachEvidence  = _evidence;
        p.breachWindow    = 0;
        p.state           = PactState.InstantBreachPending;

        emit InstantBreachInitiated(_pactId, msg.sender, _accused, _evidence);
    }

    function confirmInstantBreach(
        uint256 _pactId
    )
        external
        onlyAgent(_pactId)
    {
        Pact storage p = pacts[_pactId];
        if (p.state != PactState.InstantBreachPending) revert NotInstantBreachPending();
        if (msg.sender == p.breachInitiator) revert SameAgentCannotConfirm();

        address victim = (p.breacher == p.partnerA) ? p.partnerB : p.partnerA;
        uint256 total  = p.stakeA + p.stakeB;
        p.stakeA = 0;
        p.stakeB = 0;
        p.state  = PactState.Dissolved;

        activePactOf[p.partnerA] = 0;
        activePactOf[p.partnerB] = 0;

        emit InstantBreachConfirmed(_pactId, victim, total);

        if (total > 0) {
            (bool ok,) = victim.call{value: total}("");
            require(ok, "transfer failed");
        }
    }

    /// @notice Second agent rejects the instant breach — pact returns to Active.
    function rejectInstantBreach(
        uint256 _pactId
    )
        external
        onlyAgent(_pactId)
    {
        Pact storage p = pacts[_pactId];
        if (p.state != PactState.InstantBreachPending) revert NotInstantBreachPending();
        if (msg.sender == p.breachInitiator) revert SameAgentCannotConfirm();

        p.breacher        = address(0);
        p.breachInitiator = address(0);
        p.breachFiledAt   = 0;
        p.breachEvidence  = "";
        p.state           = PactState.Active;

        emit InstantBreachRejected(_pactId, msg.sender);
    }

    // ─── Delayed breach (one agent files, dispute window) ────────────────────

    function fileBreachWithDelay(
        uint256         _pactId,
        address         _accused,
        string calldata _evidence,
        uint256         _windowSeconds
    )
        external
        onlyAgent(_pactId)
        pactActive(_pactId)
    {
        if (bytes(_evidence).length > 1024) revert EvidenceTooLong();
        uint256 window = _windowSeconds == 0 ? DEFAULT_DISPUTE_WINDOW : _windowSeconds;
        if (window > MAX_DISPUTE_WINDOW) revert InvalidDisputeWindow();

        Pact storage p = pacts[_pactId];
        if (_accused != p.partnerA && _accused != p.partnerB) revert NotPartner();

        p.breacher        = _accused;
        p.breachInitiator = msg.sender;
        p.breachFiledAt   = block.timestamp;
        p.breachEvidence  = _evidence;
        p.breachWindow    = window;
        p.state           = PactState.Breached;

        emit BreachFiled(
            _pactId,
            msg.sender,
            _accused,
            _evidence,
            window,
            block.timestamp
        );
    }

    /// @notice Accused partner disputes the delayed breach within the window.
    function disputeBreach(
        uint256 _pactId
    )
        external
        onlyPartner(_pactId)
    {
        Pact storage p = pacts[
            _pactId
        ];

        if (p.state != PactState.Breached) {
            revert NoBreachFiled();
        }

        if (msg.sender != p.breacher) {
            revert NotBreacher();
        }

        if (block.timestamp > p.breachFiledAt + p.breachWindow) {
            revert DisputeWindowClosed();
        }

        p.disputeFiled = true;

        emit BreachDisputed(
            _pactId,
            msg.sender
        );
    }

    function claimBreachPayout(
        uint256 _pactId
    )
        external
        onlyPartner(_pactId)
    {
        Pact storage p = pacts[
            _pactId
        ];

        if (p.state != PactState.Breached) {
            revert NoBreachFiled();
        }

        if (msg.sender == p.breacher) {
            revert NotBreacher();
        }

        if (block.timestamp <= p.breachFiledAt + p.breachWindow) {
            revert DisputeWindowOpen();
        }

        uint256 total = p.stakeA + p.stakeB;
        p.stakeA = 0;
        p.stakeB = 0;

        activePactOf[p.partnerA] = 0;
        activePactOf[p.partnerB] = 0;

        emit BreachConfirmed(
            _pactId,
            msg.sender,
            total
        );

        if (total > 0) {
            (bool ok,) = msg.sender.call{
                value: total
            }("");

            require(
                ok,
                "transfer failed"
            );
        }
    }

    // ─── Dissolution ─────────────────────────────────────────────────────────

    function dissolvePact(
        uint256 _pactId
    )
        external
        onlyPartner(_pactId)
        pactActive(_pactId)
    {
        Pact storage p = pacts[_pactId];
        uint256 half      = (p.stakeA + p.stakeB) / 2;
        uint256 remainder = (p.stakeA + p.stakeB) - (half * 2);

        p.stakeA = 0;
        p.stakeB = 0;
        p.state  = PactState.Dissolved;

        activePactOf[p.partnerA] = 0;
        activePactOf[p.partnerB] = 0;

        emit PactDissolved(_pactId, msg.sender, half);

        if (half + remainder > 0) {
            (bool okA,) = p.partnerA.call{value: half + remainder}("");
            require(okA, "transfer A failed");
        }
        if (half > 0) {
            (bool okB,) = p.partnerB.call{value: half}("");
            require(okB, "transfer B failed");
        }
    }

    // ─── Trigger amendment ───────────────────────────────────────────────────

    function proposeTriggerAmendment(
        uint256 _pactId,
        uint8   _newTriggers
    )
        external
        onlyPartner(_pactId)
        pactActive(_pactId)
    {
        if (_newTriggers == 0) {
            revert InvalidTriggers();
        }

        Pact storage p = pacts[
            _pactId
        ];

        p.proposedTriggers  = _newTriggers;
        p.amendmentProposer = msg.sender;

        emit AmendmentProposed(
            _pactId,
            msg.sender,
            _newTriggers
        );
    }

    function acceptTriggerAmendment(
        uint256 _pactId
    )
        external
        onlyPartner(_pactId)
        pactActive(_pactId)
    {
        Pact storage p = pacts[
            _pactId
        ];

        if (p.amendmentProposer == address(0)) {
            revert AmendmentNotPending();
        }

        if (msg.sender == p.amendmentProposer) {
            revert NotAmendmentProposer();
        }

        uint8 oldTriggers   = p.triggers;
        p.triggers          = p.proposedTriggers;
        p.proposedTriggers  = 0;
        p.amendmentProposer = address(0);

        emit TriggersAmended(
            _pactId,
            oldTriggers,
            p.triggers
        );
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getPact(
        uint256 _pactId
    )
        external view
        returns (Pact memory)
    {
        return pacts[_pactId];
    }

    function hasTrigger(
        uint256 _pactId,
        uint8   _trigger
    )
        external view
        returns (bool)
    {
        return pacts[_pactId].triggers & _trigger != 0;
    }

    function isDisputeWindowOpen(
        uint256 _pactId
    )
        external view
        returns (bool)
    {
        Pact storage p = pacts[
            _pactId
        ];

        return p.state == PactState.Breached && block.timestamp <= p.breachFiledAt + p.breachWindow;
    }

    function totalStake(
        uint256 _pactId
    )
        external view
        returns (uint256)
    {
        return pacts[_pactId].stakeA + pacts[_pactId].stakeB;
    }
}