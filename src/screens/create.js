import { state, saveState } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { buildPact, renderQR, generateKey, PACT_RULES, renderInvitePactSummary } from "../lib/invite.js";
import {
    PACT_TRIGGER_IDS,
    PACT_BREACH_TRIGGER_IDS,
} from "../lib/pact-triggers.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "../app/pairing.js";
import { handleAxlMessage } from "../app/messages.js";

function setTriggerEnabled(id, on) {
    const set = new Set(state.triggers.filter(t => PACT_TRIGGER_IDS.includes(t)));
    if (on) {
        set.add(id);
    } else {
        set.delete(id);
    }
    state.triggers = PACT_TRIGGER_IDS.filter(t => set.has(t));
}

function appendPactRuleBlock(mount, rule) {
    const block = document.createElement("div");
    block.className = "pact-rule-block";

    const row = document.createElement("div");
    row.className = "pact-toggle-row";

    const name = document.createElement("span");
    name.className = "pact-toggle-name";
    name.textContent = rule.label;

    const label = document.createElement("label");
    label.className = "pact-toggle-label";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "pact-toggle-input";
    input.checked = state.triggers.includes(rule.id);
    const val = document.createElement("span");
    val.className = "pact-toggle-val";
    const syncVal = () => {
        const on = input.checked;
        val.textContent = on ? "on" : "off";
        val.classList.toggle("off", !on);
    };
    input.addEventListener("change", () => {
        setTriggerEnabled(rule.id, input.checked);
        syncVal();
    });
    syncVal();

    label.appendChild(input);
    label.appendChild(val);

    row.appendChild(name);
    row.appendChild(label);

    const hint = document.createElement("p");
    hint.className = "pact-rule-hint";
    hint.textContent = rule.hint;

    block.appendChild(row);
    block.appendChild(hint);
    mount.appendChild(block);
}

export function renderPactRuleToggles() {
    const mount = document.getElementById("pact-rules-mount");
    if (!mount) {
        return;
    }
    mount.replaceChildren();

    const breachRules = PACT_RULES.filter(r => PACT_BREACH_TRIGGER_IDS.includes(r.id));

    const breachHeading = document.createElement("p");
    breachHeading.className = "pact-rules-subheading";
    breachHeading.textContent = "breach triggers";
    mount.appendChild(breachHeading);
    breachRules.forEach(rule => appendPactRuleBlock(mount, rule));

    const stakeBlock = document.createElement("div");
    stakeBlock.className = "pact-rule-block pact-stake-block";
    const stakeRow = document.createElement("div");
    stakeRow.className = "pact-toggle-row pact-stake-header-row";
    const stakeName = document.createElement("span");
    stakeName.className = "pact-toggle-name";
    stakeName.textContent = "Mandatory ETH stake";
    const stakeControl = document.createElement("div");
    stakeControl.className = "pact-stake-control";
    const stakeInp = document.createElement("input");
    stakeInp.id = "pact-stake-eth";
    stakeInp.className = "field-input pact-stake-input";
    stakeInp.type = "number";
    stakeInp.min = "0";
    stakeInp.step = "0.001";
    stakeInp.setAttribute("inputmode", "decimal");
    const se0 = state.stakeEth;
    const initial =
        se0 != null && Number.isFinite(Number(se0)) && Number(se0) >= 0
            ? Number(se0)
            : 0;
    stakeInp.value = String(initial);
    stakeInp.addEventListener("change", () => {
        const raw = String(stakeInp.value).trim();
        if (raw === "" || raw === ".") {
            state.stakeEth = 0;
            stakeInp.value = "0";
        } else {
            const n = parseFloat(raw, 10);
            state.stakeEth = Number.isFinite(n) && n >= 0 ? n : 0;
            stakeInp.value = String(state.stakeEth);
        }
        saveState(state);
    });
    const stakeSuf = document.createElement("span");
    stakeSuf.className = "pact-stake-suffix";
    stakeSuf.textContent = "ETH";
    stakeControl.appendChild(stakeInp);
    stakeControl.appendChild(stakeSuf);
    stakeRow.appendChild(stakeName);
    stakeRow.appendChild(stakeControl);
    const stakeHint = document.createElement("p");
    stakeHint.className = "pact-rule-hint";
    stakeHint.textContent =
        "Optional. Leave 0 to skip. Set e.g. 0.01 to encode a proposed lock in the invite.";
    stakeBlock.appendChild(stakeRow);
    stakeBlock.appendChild(stakeHint);
    mount.appendChild(stakeBlock);
}

export function initCreateScreen() {
    document.getElementById("back-create").addEventListener("click", () => showScreen("home"));

    document.getElementById("btn-generate").addEventListener("click", async () => {
        const name = document.getElementById("create-name").value.trim();
        if (!name) {
            alert("enter your name first");
            return;
        }

        const stEl = document.getElementById("pact-stake-eth");
        if (stEl) {
            const raw = String(stEl.value).trim();
            if (raw === "") {
                state.stakeEth = 0;
            } else {
                const n = parseFloat(raw, 10);
                state.stakeEth = Number.isFinite(n) && n >= 0 ? n : 0;
            }
        }

        state.myName = name;
        state.coupleId = generateKey().slice(0, 16);
        state.createdAt = Date.now();
        state.paired = false;
        state.partnerName = "";
        state.partnerAxlKey = "";

        const btn = document.getElementById("btn-generate");
        const origLabel = btn.textContent;
        btn.textContent = "connecting to AXL…";
        btn.disabled = true;

        const axlUp = await axl.init();
        if (!axlUp && !state.myAxlKey) {
            state.myAxlKey = generateKey();
        }

        btn.textContent = origLabel;
        btn.disabled = false;
        saveState(state);

        const code = buildPact();
        document.getElementById("invite-link").textContent = code;
        await renderQR(document.getElementById("qr-wrap"), code);
        renderInvitePactSummary(document.getElementById("invite-pact-summary"));
        showScreen("code");

        startAxlPoll(completePairing, handleAxlMessage);
    });
}
