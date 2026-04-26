const $ = (id) => document.getElementById(id);

const PATH_SEP = " / ";

function regionFromConfig(j) {
    if (j.region) {
        return j.region;
    }
    const m = /\(([^)]+)\)/.exec(j.label || "");
    return m ? m[1] : (j.label || "?").replace(/^0G\s+/i, "");
}

function clearChildren(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

function renderWalletBar(j) {
    const bar = $("wallet-bar");
    const val = $("wallet-value");
    clearChildren(val);
    bar.classList.remove("lc-wallet-ok", "lc-wallet-warn", "lc-wallet-err");

    const hasKey = Boolean(j.hasPrivateKey);
    const addr = j.walletAddress;

    if (hasKey && addr) {
        bar.classList.add("lc-wallet-ok");
        val.appendChild(
            document.createTextNode(
                "Uploads are signed on this machine with EVM address ",
            ),
        );
        const code = document.createElement("code");
        code.className = "lc-wallet-addr";
        code.textContent = addr;
        code.title = addr;
        val.appendChild(code);
        if (j.storageAddressUrl) {
            val.appendChild(document.createTextNode(" / "));
            const a = document.createElement("a");
            a.className = "lc-wallet-link";
            a.href = j.storageAddressUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = "Open this wallet on StorageScan";
            val.appendChild(a);
        }
    } else if (!hasKey && addr) {
        bar.classList.add("lc-wallet-warn");
        val.appendChild(
            document.createTextNode(
                "WALLET_ADDRESS is set (",
            ),
        );
        const code = document.createElement("code");
        code.className = "lc-wallet-addr";
        code.textContent = addr;
        code.title = addr;
        val.appendChild(code);
        val.appendChild(
            document.createTextNode(
                ") for explorer links / uploads need PRIVATE_KEY in .env.local",
            ),
        );
        if (j.storageAddressUrl) {
            val.appendChild(document.createTextNode(" / "));
            const a = document.createElement("a");
            a.className = "lc-wallet-link";
            a.href = j.storageAddressUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = "Open this wallet on StorageScan";
            val.appendChild(a);
        }
    } else if (!hasKey && !addr) {
        bar.classList.add("lc-wallet-warn");
        val.textContent =
            "No signer yet. Copy .env.local.example to .env.local / set PRIVATE_KEY / server derives your public address / key never leaves this process.";
    } else {
        bar.classList.add("lc-wallet-err");
        val.textContent =
            "PRIVATE_KEY is set but no valid EVM address could be derived / check .env.local";
    }

    $("btnStore").disabled = !hasKey;
}

function renderBlurbSigner(j) {
    const frag = $("blurb-signer-wrap");
    clearChildren(frag);
    const hasKey = Boolean(j.hasPrivateKey);
    const addr = j.walletAddress;
    if (hasKey && addr) {
        return;
    }
    frag.appendChild(document.createTextNode(" ("));
    if (!hasKey && addr) {
        frag.appendChild(document.createTextNode("explorer address "));
        const c = document.createElement("code");
        c.textContent = addr;
        c.title = addr;
        frag.appendChild(c);
        frag.appendChild(
            document.createTextNode(
                " from WALLET_ADDRESS / add PRIVATE_KEY to sign uploads",
            ),
        );
    } else if (!hasKey && !addr) {
        frag.appendChild(
            document.createTextNode(
                "set PRIVATE_KEY in .env.local / server derives your EVM signer",
            ),
        );
    } else {
        frag.appendChild(
            document.createTextNode(
                "PRIVATE_KEY could not derive a valid EVM signer / check .env.local",
            ),
        );
    }
    frag.appendChild(document.createTextNode(")"));
}

async function loadConfig() {
    const r = await fetch("/api/config");
    const j = await r.json();
    const pill = $("net-pill");
    const label = $("net-label");
    const net = (j.network || "?").toUpperCase();
    const region = regionFromConfig(j);
    const host = j.rpcUrl
        ? j.rpcUrl.replace(/^https:\/\//, "")
        : "";
    label.textContent = host
        ? net + PATH_SEP + region + PATH_SEP + host
        : net + PATH_SEP + region;
    pill.classList.remove("live", "error");
    pill.classList.add(j.hasPrivateKey ? "live" : "error");

    renderWalletBar(j);
    renderBlurbSigner(j);
}

function setButtonLoading(btn, loading, loadingHtml) {
    if (loading) {
        if (!btn.dataset.defaultHtml) {
            btn.dataset.defaultHtml = btn.innerHTML;
        }
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.innerHTML = loadingHtml;
    } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        if (btn.dataset.defaultHtml) {
            btn.innerHTML = btn.dataset.defaultHtml;
        }
    }
}

function show(el, text, ok) {
    el.hidden = false;
    el.textContent = "";
    el.innerHTML = "";
    el.classList.remove("ok", "err", "structured");
    el.classList.add(ok ? "ok" : "err");
    el.textContent = text;
}

function extLink(href, label) {
    const a = document.createElement("a");
    const ok =
        typeof href === "string" &&
        (href.startsWith("https://") || href.startsWith("http://"));
    if (!ok) {
        a.href = "#";
        a.onclick = (ev) => ev.preventDefault();
        a.style.opacity = "0.45";
        a.style.cursor = "not-allowed";
        a.title =
            "Missing URL / restart `bun run ui` after updating the server";
        a.textContent = label;
        return a;
    }
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    return a;
}

async function withExplorerConfig(j) {
    const r = await fetch("/api/config");
    const c = await r.json();
    return { ...c, ...j };
}

function renderUploadResult(j, out) {
    out.hidden = false;
    out.textContent = "";
    out.innerHTML = "";
    out.classList.remove("err");
    out.classList.add("ok", "structured");

    function row(label, node) {
        const wrap = document.createElement("div");
        wrap.className = "row";
        const lab = document.createElement("div");
        lab.className = "row-label";
        lab.textContent = label;
        wrap.appendChild(lab);
        wrap.appendChild(node);
        out.appendChild(wrap);
    }

    const txBlock = document.createElement("div");
    if (j.txHash) {
        const c = document.createElement("code");
        c.style.marginBottom = "0.35rem";
        c.style.display = "block";
        c.textContent = j.txHash;
        txBlock.appendChild(c);
        if (j.l1TxUrl) {
            const div = document.createElement("div");
            div.className = "link-row";
            div.appendChild(
                extLink(j.l1TxUrl, "Open transaction on ChainScan"),
            );
            txBlock.appendChild(div);
        }
    } else {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent =
            "No L1 transaction hash for this upload (0G often deduplicates an already-finalized file). Your data is still stored / use StorageScan submission / history in Explorers when present.";
        txBlock.appendChild(p);
    }
    row("L1 transaction (0G Chain)", txBlock);

    const quick = document.createElement("div");
    quick.className = "link-row";
    if (j.storageAddressUrl) {
        quick.appendChild(
            extLink(
                j.storageAddressUrl,
                "StorageScan / this wallet",
            ),
        );
    }
    if (j.chainAddressUrl) {
        quick.appendChild(
            extLink(j.chainAddressUrl, "ChainScan / this wallet"),
        );
    }
    if (j.storageHistoryUrl) {
        quick.appendChild(
            extLink(
                j.storageHistoryUrl,
                "StorageScan / history (my files)",
            ),
        );
    }
    if (j.storageSubmissionUrl) {
        const subLabel =
            j.txSeq != null
                ? "StorageScan / submission #" + j.txSeq
                : "StorageScan / submission";
        quick.appendChild(extLink(j.storageSubmissionUrl, subLabel));
    }
    row("Explorers", quick);

    const hist = document.createElement("p");
    hist.className = "hint";
    hist.appendChild(
        document.createTextNode(
            "Connect the same wallet in StorageScan as this demo (",
        ),
    );
    if (j.storageAddressUrl && j.walletAddress) {
        hist.appendChild(document.createTextNode(j.walletAddress));
    } else {
        hist.appendChild(document.createTextNode("your signer"));
    }
    hist.appendChild(
        document.createTextNode(") to populate "),
    );
    if (j.storageHistoryUrl) {
        hist.appendChild(extLink(j.storageHistoryUrl, "History"));
    } else {
        hist.appendChild(document.createTextNode("History"));
    }
    hist.appendChild(
        document.createTextNode(" with sequence + L1 tx links."),
    );
    out.appendChild(hist);
}

function renderRetrieveResult(j, out) {
    out.hidden = false;
    out.textContent = "";
    out.innerHTML = "";
    out.classList.remove("err");
    out.classList.add("ok", "structured");

    const pre = document.createElement("pre");
    pre.style.margin = "0 0 0.75rem";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.textContent = j.text;

    const lab = document.createElement("div");
    lab.className = "row-label";
    lab.textContent = "Payload";

    const block = document.createElement("div");
    block.className = "row";
    block.appendChild(lab);
    block.appendChild(pre);
    out.appendChild(block);

    const quick = document.createElement("div");
    quick.className = "link-row";
    if (j.storageAddressUrl) {
        quick.appendChild(
            extLink(
                j.storageAddressUrl,
                "StorageScan / this wallet",
            ),
        );
    }
    if (j.chainAddressUrl) {
        quick.appendChild(
            extLink(j.chainAddressUrl, "ChainScan / this wallet"),
        );
    }
    if (j.storageHistoryUrl) {
        quick.appendChild(
            extLink(
                j.storageHistoryUrl,
                "StorageScan / history (my files)",
            ),
        );
    }
    if (j.storageSubmissionUrl) {
        const subLabel =
            j.txSeq != null
                ? "StorageScan / submission #" + j.txSeq
                : "StorageScan / submission";
        quick.appendChild(extLink(j.storageSubmissionUrl, subLabel));
    }
    const div = document.createElement("div");
    div.className = "row";
    const ll = document.createElement("div");
    ll.className = "row-label";
    ll.textContent = "Explorers";
    div.appendChild(ll);
    div.appendChild(quick);
    out.appendChild(div);
}

const PRESET_TEXT = {
    diary:
        "LoveClaw / diary entry (example)\n" +
        "Date: 2026-04-26\n" +
        "Mood: curious\n" +
        "\n" +
        "Pinned a private reflection here as one UTF-8 blob on 0G.\n" +
        "If LoveClaw replays this root later, it reads the same bytes you signed today.",
    location:
        "LoveClaw / location snapshot (example)\n" +
        "name: home base\n" +
        "latitude: 37.7749\n" +
        "longitude: -122.4194\n" +
        "accuracy_m: 12\n" +
        "source: gnss\n" +
        "\n" +
        "Store coordinates exactly as your agent recorded them; proof covers the whole string.",
    chat:
        "LoveClaw / chat capture (example)\n" +
        "[alice] Can we store this thread verbatim?\n" +
        "[boris] Yes - whole transcript becomes one blob. Dedup still applies if bytes match.\n" +
        "[alice] Perfect. Timestamp: 2026-04-26T20:10Z",
};

function fillPreset(key) {
    const ta = $("storeText");
    ta.value = PRESET_TEXT[key];
    ta.focus();
}

$("presetDiary").addEventListener("click", () => fillPreset("diary"));
$("presetLocation").addEventListener("click", () =>
    fillPreset("location"),
);
$("presetChat").addEventListener("click", () => fillPreset("chat"));

$("btnStore").addEventListener("click", async () => {
    const btn = $("btnStore");
    const out = $("storeOut");
    out.hidden = true;
    setButtonLoading(
        btn,
        true,
        '<span class="spinner" aria-hidden="true"></span><span>Uploading to 0G…</span>',
    );
    try {
        const text = $("storeText").value;
        const r = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        const m = await withExplorerConfig(j);
        renderUploadResult(m, out);
        $("rootInput").value = m.rootHash;
    } catch (e) {
        show(out, String(e.message || e), false);
    }
    setButtonLoading(btn, false, "");
});

$("btnRetrieve").addEventListener("click", async () => {
    const btn = $("btnRetrieve");
    const out = $("retrieveOut");
    const root = $("rootInput").value.trim();
    out.hidden = true;
    setButtonLoading(
        btn,
        true,
        '<span class="spinner" aria-hidden="true"></span><span>Downloading…</span>',
    );
    try {
        if (!root) throw new Error("Enter a root hash");
        const r = await fetch(
            "/api/retrieve?rootHash=" + encodeURIComponent(root),
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        const m = await withExplorerConfig(j);
        renderRetrieveResult(m, out);
    } catch (e) {
        show(out, String(e.message || e), false);
    }
    setButtonLoading(btn, false, "");
});

loadConfig().catch(() => {
    $("net-label").textContent = "could not load /api/config";
    const pill = $("net-pill");
    pill.classList.remove("live");
    pill.classList.add("error");
    const bar = $("wallet-bar");
    const val = $("wallet-value");
    bar.classList.remove("lc-wallet-ok", "lc-wallet-warn");
    bar.classList.add("lc-wallet-err");
    val.textContent =
        "Could not load signer status from the server. Run `bun run ui` in examples/0g-storage-memory.";
    $("btnStore").disabled = true;
    const bs = $("blurb-signer-wrap");
    if (bs) {
        clearChildren(bs);
        bs.appendChild(document.createTextNode(" ("));
        bs.appendChild(
            document.createTextNode(
                "signer status unavailable / start `bun run ui`",
            ),
        );
        bs.appendChild(document.createTextNode(")"));
    }
});
