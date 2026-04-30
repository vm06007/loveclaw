import { state, saveState } from "../lib/state.js";
import { PACT_RULES, sanitizeCustomPactRules } from "../lib/invite.js";
import { looksLikeSwapRequest, parseSwapIntent, fetchSwapQuote, formatQuoteSummary } from "./swap.js";
import {
    getAiSettings,
    isShareConversationsOn,
    getLoveclawAiConfigGap,
    LOVCLAW_PACT_ARCHITECT_SYSTEM,
} from "./ai-settings.js";
import { addBubble } from "./chat-log.js";
import { VAULT_ADDRESS, fetchVaultBalances } from "./vault.js";
import { transportSend } from "./transport.js";

const RESERVED_PACT_RULE_IDS = new Set(PACT_RULES.map((r) => r.id));

function looksLikeVaultQuery(text) {
    const q = String(text || "").replace(/^@love(?:c(?:l(?:a(?:w)?)?)?)?\s*|^@claw\s*|^@lovc(?:l(?:a(?:w)?)?)?\s*/i, "").trim().toLowerCase();
    return /\b(vault|balance|eth|usdc|fund|mutual|deposit|how much|crypto|wallet)\b/.test(q);
}

function looksLikeLoveclawPrompt(text) {
    // Exact match or common typos: @love, @claw, @lovclaw, @lovecl, @lovelaw, etc.
    return /^@love(c(l(a(w)?)?)?)?(\s|$)|^@claw(\s|$)|^@lovc(l(a(w)?)?)?(\s|$)/i.test(String(text || "").trim());
}

function addUniqueRule(baseRules, rule) {
    const clean = sanitizeCustomPactRules(baseRules);
    if (!rule || clean.some(r => r.id === rule.id)) {
        return clean;
    }
    return sanitizeCustomPactRules([...clean, rule]);
}

function buildGeneralLoveclawReply(text) {
    const q = String(text || "").replace(/^@love(?:c(?:l(?:a(?:w)?)?)?)?\s*|^@claw\s*|^@lovc(?:l(?:a(?:w)?)?)?\s*/i, "").trim().toLowerCase();
    if (!q) {
        return "I am here. Tell me what you want to monitor, automate, or add to your pact.";
    }
    if (q.includes("how are you")) {
        return "I am online and synced. Ready to help you both shape pact rules, suggest triggers, and prepare partner confirmations.";
    }
    if (q.includes("help")) {
        return "You can ask me to draft pact changes, explain current rules, or suggest new breach/automation ideas. I will route anything risky through partner confirmation.";
    }
    return "Understood. I can chat normally, and when your request can become a pact update I will draft it and ask your partner to confirm before applying.";
}

function extractJsonObjectFromLlmText(s) {
    const raw = String(s || "").trim();
    if (!raw) {
        return null;
    }
    const tryParse = (t) => {
        try {
            return JSON.parse(t);
        } catch {
            return null;
        }
    };
    let j = tryParse(raw);
    if (j && typeof j === "object") {
        return j;
    }
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        j = tryParse(fence[1].trim());
        if (j && typeof j === "object") {
            return j;
        }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
        j = tryParse(raw.slice(start, end + 1));
        if (j && typeof j === "object") {
            return j;
        }
    }
    return null;
}

function normalizeArchitectRule(rule) {
    if (!rule || typeof rule !== "object") {
        return null;
    }
    let id = String(rule.id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    if (!id || id.length > 48) {
        return null;
    }
    if (RESERVED_PACT_RULE_IDS.has(id)) {
        return null;
    }
    if ((state.customPactRules || []).some((r) => r.id === id)) {
        return null;
    }
    const label = String(rule.label || "").trim().slice(0, 200);
    const hint = String(rule.hint || "").trim().slice(0, 800);
    const category = rule.category === "automation" ? "automation" : "breach";
    if (!label || !hint) {
        return null;
    }
    return { id, label, hint, category };
}

function scrubPartnerWord(text, partnerName) {
    let out = String(text || "");
    if (!out) {
        return out;
    }
    const name = String(partnerName || "").trim();
    const sub = name && name.toLowerCase() !== "partner" ? name : "they";
    const possessive = name && name.toLowerCase() !== "partner" ? `${name}'s` : "their";
    out = out.replace(/\byour spouse'?s\b/gi, possessive);
    out = out.replace(/\byour partner'?s\b/gi, possessive);
    out = out.replace(/\bthe partner'?s\b/gi, possessive);
    out = out.replace(/\bspouse'?s\b/gi, possessive);
    out = out.replace(/\bpartner'?s\b/gi, possessive);
    out = out.replace(/\byour spouse\b/gi, sub);
    out = out.replace(/\byour partner\b/gi, sub);
    out = out.replace(/\bthe partner\b/gi, sub);
    out = out.replace(/\bspouse\b/gi, sub);
    out = out.replace(/\bpartner\b/gi, sub);
    return out;
}

/**
 * @param {object} settings
 * @param {{ role: string; content: string }[]} messages
 * @param {number} temperature
 * @param {boolean} jsonMode ask API for JSON where supported
 * @returns {Promise<string|null>} assistant text
 */
async function fetchLoveclawChatCompletions(settings, messages, temperature, jsonMode = false) {
    const endpoint = settings.customUrl || String(import.meta.env?.VITE_LOVECLAW_LLM_URL || "").trim();
    const openrouterKey = settings.openrouterKey || String(import.meta.env?.VITE_OPENROUTER_API_KEY || "").trim();
    const openrouterModel = settings.openrouterModel || String(import.meta.env?.VITE_OPENROUTER_MODEL || "").trim() || "openai/gpt-4o-mini";
    const huggingfaceKey = settings.huggingfaceKey || String(import.meta.env?.VITE_HUGGINGFACE_API_KEY || "").trim();
    const huggingfaceModel = settings.huggingfaceModel || "google/gemma-2-9b-it";
    const zgComputeUrl = settings.zgComputeUrl || String(import.meta.env?.VITE_ZG_COMPUTE_URL || "").trim();
    const zgComputeSecret = settings.zgComputeSecret || String(import.meta.env?.VITE_ZG_COMPUTE_SECRET || "").trim();
    const zgComputeModel = settings.zgComputeModel || String(import.meta.env?.VITE_ZG_COMPUTE_MODEL || "qwen/qwen-2.5-7b-instruct").trim();
    const localUrl = settings.localUrl || "http://127.0.0.1:11434";
    const localModel = settings.localModel || "gemma3:4b";
    const appUrl = String(import.meta.env?.VITE_OPENROUTER_APP_URL || "http://localhost:1420").trim();
    const appTitle = String(import.meta.env?.VITE_OPENROUTER_APP_TITLE || "LoveClaw").trim();

    const provider = settings.provider || "openrouter";

    if (provider === "openrouter" && openrouterKey) {
        try {
            const body = {
                model: openrouterModel,
                messages,
                temperature,
                ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            };
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openrouterKey}`,
                    "HTTP-Referer": appUrl,
                    "X-Title": appTitle,
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                const reply = String(data?.choices?.[0]?.message?.content || "").trim();
                if (reply) {
                    return reply;
                }
            }
        } catch {
            // Fall through.
        }
    }

    if (provider === "huggingface" && huggingfaceKey) {
        try {
            const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${huggingfaceKey}`,
                },
                body: JSON.stringify({
                    model: huggingfaceModel,
                    messages,
                    temperature,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const reply = String(data?.choices?.[0]?.message?.content || "").trim();
                if (reply) {
                    return reply;
                }
            }
        } catch {
            // Fall through.
        }
    }

    if (provider === "zgcompute" && zgComputeUrl && zgComputeSecret) {
        try {
            const base = zgComputeUrl.replace(/\/$/, "");
            const res = await fetch(`${base}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${zgComputeSecret}`,
                },
                body: JSON.stringify({
                    model: zgComputeModel,
                    messages,
                    temperature,
                    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const reply = String(data?.choices?.[0]?.message?.content || "").trim();
                if (reply) {
                    return reply;
                }
            }
        } catch {
            // Fall through.
        }
    }

    if (provider === "local") {
        try {
            const body = {
                model: localModel,
                messages,
                stream: false,
                ...(jsonMode ? { format: "json" } : {}),
            };
            const res = await fetch(`${localUrl.replace(/\/$/, "")}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                const reply = String(data?.message?.content || "").trim();
                if (reply) {
                    return reply;
                }
            }
        } catch {
            // Fall through.
        }
    }

    if (!endpoint) {
        return null;
    }
    try {
        const token = settings.customToken || String(import.meta.env?.VITE_LOVECLAW_LLM_TOKEN || "").trim();
        const joined = messages.map((m) => `${String(m.role || "").toUpperCase()}: ${String(m.content || "")}`).join("\n\n");
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                message: joined,
                context: {
                    paired: Boolean(state.paired),
                    triggers: state.triggers || [],
                    stakeEth: state.stakeEth ?? 0,
                    loveclawJsonMode: Boolean(jsonMode),
                },
            }),
        });
        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
        return reply || null;
    } catch {
        return null;
    }
}

async function fetchLoveclawLlmReplyWithSettings(settings, text) {
    const promptBody = String(text || "").replace(/^@love(?:c(?:l(?:a(?:w)?)?)?)?\s*|^@claw\s*|^@lovc(?:l(?:a(?:w)?)?)?\s*/i, "").trim();
    const messages = [
        {
            role: "system",
            content: "You are LoveClaw, a concise relationship pact copilot. Be supportive, practical, and privacy-aware.",
        },
        {
            role: "user",
            content: promptBody,
        },
    ];
    return fetchLoveclawChatCompletions(settings, messages, 0.6, false);
}

async function getLoveclawLlmReply(text) {
    return fetchLoveclawLlmReplyWithSettings(getAiSettings(), text);
}

export async function testLoveclawAiConnection(draftSettings) {
    const s = { ...getAiSettings(), ...draftSettings };
    if (!s.enabled) {
        return { ok: true, skipped: true };
    }
    const gap = getLoveclawAiConfigGap(s);
    if (gap) {
        return { ok: false, skipped: false, reason: gap };
    }
    const probe = await fetchLoveclawLlmReplyWithSettings(s, "@loveclaw reply with exactly: OK");
    if (probe && probe.trim()) {
        return { ok: true, skipped: false };
    }
    return { ok: false, skipped: false, reason: "Could not reach the model or the response was empty." };
}

async function loveclawRunPactArchitect(text) {
    const settings = getAiSettings();
    const promptBody = String(text || "").replace(/^@love(?:c(?:l(?:a(?:w)?)?)?)?\s*|^@claw\s*|^@lovc(?:l(?:a(?:w)?)?)?\s*/i, "").trim();
    const myName = String(state.myName || "").trim();
    const partnerName = String(state.partnerName || "").trim();
    const ctx = JSON.stringify({
        paired: Boolean(state.paired),
        myName: myName || "",
        partnerName: partnerName || "",
        activeTriggers: [...(state.triggers || [])],
        customRules: (state.customPactRules || []).map((r) => ({
            id: r.id,
            label: r.label,
            category: r.category,
        })),
    });
    const userContent =
        `User message:\n${promptBody}\n\nCurrent pact snapshot (JSON):\n${ctx}\n\n` +
        "Output a single JSON object exactly as in your system instructions. No markdown. " +
        "Do not use the word \"partner\" or \"spouse\" anywhere in reply_to_user. " +
        (partnerName
            ? `When you reference the other person, use their name "${partnerName}" verbatim.`
            : "Refer to the other person as \"they\" instead of \"partner\".");
    const messages = [
        { role: "system", content: LOVCLAW_PACT_ARCHITECT_SYSTEM },
        { role: "user", content: userContent },
    ];
    const raw = await fetchLoveclawChatCompletions(settings, messages, 0.35, true);
    if (!raw) {
        return {
            status: "chat",
            reply_to_user: "I could not reach the AI provider to plan that. Check AI settings or try again.",
        };
    }
    const data = extractJsonObjectFromLlmText(raw);
    if (!data || typeof data !== "object") {
        return {
            status: "chat",
            reply_to_user: "I got a reply I could not parse as a plan. Try rephrasing, or ask for one concrete rule at a time.",
        };
    }
    const status = String(data.status || "chat").trim().toLowerCase();
    const allowed = new Set(["chat", "propose_rule", "not_possible", "need_info"]);
    if (!allowed.has(status)) {
        return {
            status: "chat",
            reply_to_user: String(data.reply_to_user || "").trim() || buildGeneralLoveclawReply(text),
        };
    }
    const reply_to_user = String(data.reply_to_user || "").trim();
    const clarifying_question = String(data.clarifying_question || "").trim();
    let mergedReply = reply_to_user;
    if (status === "need_info" && clarifying_question) {
        mergedReply = mergedReply ? `${mergedReply} ${clarifying_question}` : clarifying_question;
    }
    return {
        status,
        reply_to_user: scrubPartnerWord(mergedReply || reply_to_user, partnerName),
        proposed_rule: data.proposed_rule,
    };
}

function addLoveclawLine(message, { shareWithPartner = true } = {}) {
    const clean = String(message || "").trim();
    if (!clean) {
        return;
    }
    addBubble("left", `LoveClaw: ${clean}`, true);
    if (shareWithPartner && state.paired && state.partnerAxlKey) {
        transportSend({
            type: "agentic_chat_line",
            from: state.myName || "me",
            text: clean,
            ts: Date.now(),
        });
    }
}

async function proposeLoveclawRule(extractedRule, { skipAnnounce = false } = {}) {
    const mergedCustomRules = addUniqueRule(state.customPactRules || [], extractedRule);
    const proposal = {
        triggers: [...new Set([...(state.triggers || []), extractedRule.id])],
        stakeEth: Number.isFinite(Number(state.stakeEth)) && Number(state.stakeEth) >= 0 ? Number(state.stakeEth) : 0,
        customRules: mergedCustomRules,
        omittedBaseBreachTriggerIds: [...(state.omittedBaseBreachTriggerIds || [])],
    };
    if (!skipAnnounce) {
        addLoveclawLine(
            `drafted rule "${extractedRule.label}". I will propose this pact update to your partner for confirmation.`,
        );
    }
    if (!state.paired || !state.partnerAxlKey) {
        addLoveclawLine("partner is not connected yet, so I cannot send this proposal.");
        return;
    }
    state.pactChangesOutgoingPending = true;
    state.pactChangesOutgoingProposal = proposal;
    transportSend({
        type: "pact_changes_propose",
        from: state.myName || "me",
        proposal,
        ts: Date.now(),
    });
    saveState(state);
    void import("../dashboard/render.js").then((m) => m.renderPact());
}

export async function maybeHandleLoveclawPrompt(text) {
    const aiSettings = getAiSettings();
    if (!aiSettings.enabled) {
        if (looksLikeLoveclawPrompt(text)) {
            addLoveclawLine(
                "LoveClaw AI is turned off on this device. Open AI settings, check \"Enable LoveClaw AI on this device\", then save. Saving an API key alone does not turn it on.",
                { shareWithPartner: false },
            );
        }
        return;
    }
    if (!looksLikeLoveclawPrompt(text)) {
        return;
    }
    const share = isShareConversationsOn();
    if (looksLikeSwapRequest(text)) {
        const intent = parseSwapIntent(text);
        if (!intent) {
            addLoveclawLine(
                "I can help swap tokens from the vault. Try: swap 0.1 ETH for USDC",
                { shareWithPartner: share },
            );
            return;
        }
        const swapper = String(state.myProfile?.agentWalletAddress || VAULT_ADDRESS);
        addLoveclawLine(`fetching quote: ${intent.amount} ${intent.symbolIn} → ${intent.symbolOut}…`, { shareWithPartner: false });
        try {
            const quoteResp = await fetchSwapQuote(intent, swapper);
            const summary = formatQuoteSummary(intent, quoteResp);
            state.swapPending   = {
                intent,
                quoteResp,
                summary,
                proposer: state.myName || "me",
                ts: Date.now(),
                myConfirmed: true,
                partnerConfirmed: false,
            };
            state.swapExecuting = null;
            state.swapResult    = null;
            saveState(state);
            if (state.paired && state.partnerAxlKey) {
                transportSend({
                    type: "swap_propose",
                    from: state.myName,
                    intent: { amount: intent.amount, symbolIn: intent.symbolIn, symbolOut: intent.symbolOut },
                    summary,
                    ts: Date.now(),
                });
            }
            void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
        } catch (err) {
            addLoveclawLine(`Swap quote failed: ${err.message}`, { shareWithPartner: false });
        }
        return;
    }
    if (looksLikeVaultQuery(text)) {
        addLoveclawLine("checking vault balance on-chain...", { shareWithPartner: false });
        const balanceMsg = await fetchVaultBalances(VAULT_ADDRESS);
        addLoveclawLine(balanceMsg, { shareWithPartner: share });
        return;
    }
    const plan = await loveclawRunPactArchitect(text);
    const reply = String(plan?.reply_to_user || "").trim();
    if (reply) {
        addLoveclawLine(reply, { shareWithPartner: share });
    }
    if (plan?.status === "propose_rule") {
        const rule = normalizeArchitectRule(plan.proposed_rule);
        if (rule) {
            await proposeLoveclawRule(rule, { skipAnnounce: Boolean(reply) });
        } else if (!reply) {
            addLoveclawLine(
                "The model proposed a rule I could not safely apply. Try again with measurable limits, a time window, or a specific app name.",
                { shareWithPartner: share },
            );
        }
    } else if (!reply) {
        const fb = await getLoveclawLlmReply(text);
        addLoveclawLine(fb || buildGeneralLoveclawReply(text), { shareWithPartner: share });
    }
}
