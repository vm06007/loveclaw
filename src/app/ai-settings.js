import { state, saveState } from "../lib/state.js";

export const LOVCLAW_PACT_ARCHITECT_SYSTEM = `You are LoveClaw, the pact copilot for a couples app with on-device agents and AXL sync.

Your job: read the user message and decide how to respond using ONE JSON object only (no markdown fences).

Naming rules (very important):
- The user message is from the person referenced in context as "you" (their name is provided as "myName" in the snapshot).
- The other person's name is provided as "partnerName" in the snapshot.
- In reply_to_user you MUST refer to the other person by their actual name (partnerName) when you need to mention them — never write the literal words "partner", "your partner", "spouse", or "your spouse".
- If partnerName is empty or the value "partner", and you really must reference them, write "they" instead. Never invent names.
- You may address the user directly as "you" or by their first name (myName) when natural. Do not use the word "partner" anywhere.

Built-in pact rules already exist — never propose duplicate ids: dating_app, location, contact, diary.
- dating_app: agent infers dating-oriented installs from app metadata (packages, names, context) — not a fixed keyword list.
- location: movement vs usual routine (stops, routes, timing).
- contact: long unexplained offline while battery suggests the phone could be online.
- diary: automation — AI daily diary from shared signals (not a breach monitor).

Signals the product can approximate today (honest scope): battery % / charging; GPS / network location; foreground app / package focus; notification metadata (categories, not message bodies); online/presence patterns vs battery; screen-on / unlock patterns and late-night usage windows; diary context bundle; optional heartbeat, now playing, spending category bands.

You may propose a NEW custom pact rule only if it could be evaluated from those signals (alone or combined). If the user wants something impossible with this stack (e.g. read private DM text, exact keystrokes, third-party app message bodies), use status "not_possible" and explain in reply_to_user.

If you need a number, app id, or time window to make the rule enforceable, use status "need_info" and put ONE short clarifying_question (reply_to_user can restate what you need).

If the user is just chatting (greetings, thanks, general help), use status "chat" with a brief supportive reply_to_user and proposed_rule null.

If you can propose a concrete custom rule, use status "propose_rule" with proposed_rule:
- id: lowercase a-z, digits, underscore only, max 48 chars, not a reserved id, not duplicating an id in the pact snapshot.
- label: short human title.
- hint: one or two sentences on how detection would work with the signals above (mention limitations).
- category: usually "breach". Use "automation" only for diary-style summaries, not surveillance.

Always include reply_to_user (non-empty string) for every status — it is shown in chat. For propose_rule, reply_to_user should confirm what you queued in plain language and refer to the other person by partnerName (never as "partner") — e.g. yes, I added "…" and sent it to <partnerName> for confirmation.`;

export const DEFAULT_AI_SETTINGS = {
    enabled: true,
    shareConversations: false,
    provider: "zgcompute",
    openrouterKey: "",
    openrouterModel: String(import.meta.env?.VITE_OPENROUTER_MODEL || "openai/gpt-4o-mini"),
    huggingfaceKey: "",
    huggingfaceModel: String(import.meta.env?.VITE_HUGGINGFACE_MODEL || "google/gemma-2-9b-it"),
    zgComputeUrl: String(import.meta.env?.VITE_ZG_COMPUTE_URL || ""),
    zgComputeSecret: String(import.meta.env?.VITE_ZG_COMPUTE_SECRET || ""),
    zgComputeModel: String(import.meta.env?.VITE_ZG_COMPUTE_MODEL || "qwen/qwen-2.5-7b-instruct"),
    localUrl: String(import.meta.env?.VITE_LOCAL_OLLAMA_URL || "http://127.0.0.1:11434"),
    localModel: String(import.meta.env?.VITE_LOCAL_OLLAMA_MODEL || "gemma3:4b"),
    customUrl: "",
    customToken: "",
};

export function isShareConversationsOn() {
    const raw = state.aiSettings && typeof state.aiSettings === "object" ? state.aiSettings : {};
    return raw.shareConversations === true; // default false
}

export function getAiSettings() {
    const raw = state.aiSettings && typeof state.aiSettings === "object" ? state.aiSettings : {};
    return {
        enabled: Boolean(raw.enabled),
        shareConversations: raw.shareConversations !== false,
        provider: String(raw.provider || DEFAULT_AI_SETTINGS.provider),
        openrouterKey: String(raw.openrouterKey || ""),
        openrouterModel: String(raw.openrouterModel || DEFAULT_AI_SETTINGS.openrouterModel),
        huggingfaceKey: String(raw.huggingfaceKey || ""),
        huggingfaceModel: String(raw.huggingfaceModel || DEFAULT_AI_SETTINGS.huggingfaceModel),
        zgComputeUrl: String(raw.zgComputeUrl || DEFAULT_AI_SETTINGS.zgComputeUrl),
        zgComputeSecret: String(raw.zgComputeSecret || DEFAULT_AI_SETTINGS.zgComputeSecret),
        zgComputeModel: String(raw.zgComputeModel || DEFAULT_AI_SETTINGS.zgComputeModel),
        localUrl: String(raw.localUrl || DEFAULT_AI_SETTINGS.localUrl),
        localModel: String(raw.localModel || DEFAULT_AI_SETTINGS.localModel),
        customUrl: String(raw.customUrl || ""),
        customToken: String(raw.customToken || ""),
    };
}

export function persistAiSettings(nextSettings) {
    state.aiSettings = { ...getAiSettings(), ...nextSettings };
    saveState(state);
}

export function setAiSettingsModal(open) {
    const m = document.getElementById("modal-ai-settings");
    if (m) {
        m.classList.toggle("hidden", !open);
    }
}

export function syncAiProviderFields(provider) {
    document.querySelectorAll(".ai-settings-group[data-provider]").forEach((group) => {
        const p = group.getAttribute("data-provider");
        group.classList.toggle("hidden", p !== provider);
    });
}

export function loadAiSettingsIntoModal() {
    const s = getAiSettings();
    const provider = document.getElementById("ai-provider");
    const aiEnabled = document.getElementById("ai-enabled");
    const openrouterKey = document.getElementById("ai-openrouter-key");
    const openrouterModel = document.getElementById("ai-openrouter-model");
    const hfKey = document.getElementById("ai-hf-key");
    const hfModel = document.getElementById("ai-hf-model");
    const zgUrl = document.getElementById("ai-zg-url");
    const zgSecret = document.getElementById("ai-zg-secret");
    const zgModel = document.getElementById("ai-zg-model");
    const localUrl = document.getElementById("ai-local-url");
    const localModel = document.getElementById("ai-local-model");
    const customUrl = document.getElementById("ai-custom-url");
    const customToken = document.getElementById("ai-custom-token");
    const aiShareConversations = document.getElementById("ai-share-conversations");
    if (aiEnabled instanceof HTMLInputElement) aiEnabled.checked = Boolean(s.enabled);
    if (aiShareConversations instanceof HTMLInputElement) aiShareConversations.checked = s.shareConversations;
    if (provider) provider.value = s.provider;
    if (openrouterKey) openrouterKey.value = s.openrouterKey;
    if (openrouterModel) openrouterModel.value = s.openrouterModel;
    if (hfKey) hfKey.value = s.huggingfaceKey;
    if (hfModel) hfModel.value = s.huggingfaceModel;
    if (zgUrl) zgUrl.value = s.zgComputeUrl;
    if (zgSecret) zgSecret.value = s.zgComputeSecret;
    if (zgModel) zgModel.value = s.zgComputeModel;
    if (localUrl) localUrl.value = s.localUrl;
    if (localModel) localModel.value = s.localModel;
    if (customUrl) customUrl.value = s.customUrl;
    if (customToken) customToken.value = s.customToken;
    syncAiProviderFields(s.provider);
}

export function readAiSettingsFromModal() {
    return {
        enabled: Boolean(document.getElementById("ai-enabled")?.checked),
        shareConversations: document.getElementById("ai-share-conversations")?.checked ?? true,
        provider: String(document.getElementById("ai-provider")?.value || DEFAULT_AI_SETTINGS.provider).trim(),
        openrouterKey: String(document.getElementById("ai-openrouter-key")?.value || "").trim(),
        openrouterModel: String(document.getElementById("ai-openrouter-model")?.value || DEFAULT_AI_SETTINGS.openrouterModel).trim(),
        huggingfaceKey: String(document.getElementById("ai-hf-key")?.value || "").trim(),
        huggingfaceModel: String(document.getElementById("ai-hf-model")?.value || DEFAULT_AI_SETTINGS.huggingfaceModel).trim(),
        zgComputeUrl: String(document.getElementById("ai-zg-url")?.value || DEFAULT_AI_SETTINGS.zgComputeUrl).trim(),
        zgComputeSecret: String(document.getElementById("ai-zg-secret")?.value || DEFAULT_AI_SETTINGS.zgComputeSecret).trim(),
        zgComputeModel: String(document.getElementById("ai-zg-model")?.value || DEFAULT_AI_SETTINGS.zgComputeModel).trim(),
        localUrl: String(document.getElementById("ai-local-url")?.value || DEFAULT_AI_SETTINGS.localUrl).trim(),
        localModel: String(document.getElementById("ai-local-model")?.value || DEFAULT_AI_SETTINGS.localModel).trim(),
        customUrl: String(document.getElementById("ai-custom-url")?.value || "").trim(),
        customToken: String(document.getElementById("ai-custom-token")?.value || "").trim(),
    };
}

export function getLoveclawAiConfigGap(settings) {
    const s = { ...getAiSettings(), ...settings };
    const p = s.provider || "openrouter";
    if (p === "openrouter") {
        const key = s.openrouterKey || String(import.meta.env?.VITE_OPENROUTER_API_KEY || "").trim();
        return key ? null : "OpenRouter API key is missing.";
    }
    if (p === "huggingface") {
        const key = s.huggingfaceKey || String(import.meta.env?.VITE_HUGGINGFACE_API_KEY || "").trim();
        return key ? null : "Hugging Face API key is missing.";
    }
    if (p === "zgcompute") {
        const url = s.zgComputeUrl || String(import.meta.env?.VITE_ZG_COMPUTE_URL || "").trim();
        const secret = s.zgComputeSecret || String(import.meta.env?.VITE_ZG_COMPUTE_SECRET || "").trim();
        if (!url) {
            return "0G Compute URL is missing.";
        }
        if (!secret) {
            return "0G Compute secret is missing.";
        }
        return null;
    }
    if (p === "local") {
        return s.localUrl ? null : "Local Ollama URL is missing.";
    }
    if (p === "custom") {
        const url = s.customUrl || String(import.meta.env?.VITE_LOVECLAW_LLM_URL || "").trim();
        return url ? null : "Custom endpoint URL is missing.";
    }
    return "Unknown AI provider.";
}
