
const $ = (id) => document.getElementById(id);
const textEncoder = new TextEncoder();

function toHex(buffer) {
    const b = new Uint8Array(buffer);
    const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return hex;
}

async function hashSha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', textEncoder.encode(str));
    return toHex(buf);
}

async function doubleSHA256(str) {
    const first = await hashSha256Hex(str);
    const second = await hashSha256Hex(first);
    return second;
}

function targetRegex(d) { return new RegExp('^' + '0'.repeat(d)); }

function joinHeaderString(prev, data, nonce) {
    return `${prev}|${data}|${nonce}`;
}

// --- DOM Elements ---
const prevHash = $('prevHash');
const dataEl = $('data');
const difficulty = $('difficulty');
const nonce = $('nonce');
const headerPreview = $('headerPreview');
const hashOut = $('hashOut');
const triesEl = $('tries');
const bestHashEl = $('bestHash');
const hpsEl = $('hps');
const status = $('status');
const targetEl = $('target');
const difficultyLabel = $('difficultyLabel');
const progressBar = $('progressBar');

const tryBtn = $('tryBtn');
const autoBtn = $('autoBtn');
const stopBtn = $('stopBtn');
const resetBtn = $('resetBtn');
const shareBtn = $('shareBtn');

// --- State ---
let tries = 0;
let bestHash = null;
let mining = false;
let lastTick = performance.now();
let tickTries = 0;

function updateHeaderPreview() {
    const header = joinHeaderString(prevHash.value.trim(), dataEl.value.trim(), nonce.value);
    headerPreview.textContent = header;
}

async function computeHash() {
    const header = joinHeaderString(prevHash.value.trim(), dataEl.value.trim(), nonce.value);
    const hash = await doubleSHA256(header);
    hashOut.textContent = hash;
    tries++;
    tickTries++;
    triesEl.textContent = tries.toLocaleString();
    if (!bestHash || hash < bestHash) bestHash = hash;
    bestHashEl.textContent = bestHash || '—';
    return hash;
}

function updateTargetUI() {
    const d = Math.max(1, Math.min(6, Number(difficulty.value) || 1));
    difficulty.value = d;
    targetEl.textContent = `^0{${d}}.*`;
    difficultyLabel.textContent = String(d);
}

function setStatus(msg) { status.textContent = msg; }

function setMining(active) {
    mining = active;
    autoBtn.textContent = active ? 'Auto Mining… ⏸' : 'Auto Mine ▶';
}

function resetAll() {
    tries = 0; bestHash = null; tickTries = 0; lastTick = performance.now();
    triesEl.textContent = '0'; bestHashEl.textContent = '—'; hpsEl.textContent = '0 H/s';
    hashOut.textContent = ''; progressBar.style.width = '0%';
    nonce.value = 0; setStatus('Reset. Ready.');
    updateHeaderPreview(); updateTargetUI();
}

function updatePerfomanceHashRate() {
    const now = performance.now();
    if (now - lastTick >= 1000) {
        hpsEl.textContent = `${tickTries.toLocaleString()} H/s`;
        tickTries = 0;
        lastTick = now;
    }
}

function updateProgressBar() {
    const d = Number(difficulty.value);
    const expected = Math.pow(16, d); // hex base
    const frac = Math.min(1, (tries % expected) / expected);
    progressBar.style.width = `${(frac * 100).toFixed(2)}%`;
}

async function mineOneBlock() {
    updateHeaderPreview();
    const hash = await computeHash();
    const isHashMeetTarget = targetRegex(Number(difficulty.value)).test(hash);

    updatePerfomanceHashRate(); 
    updateProgressBar();

    if (isHashMeetTarget) {
        setStatus(`🎉 Success! Valid block found at nonce=${nonce.value}. Hash starts with ${'0'.repeat(Number(difficulty.value))}.`);
        setMining(false);
        document.body.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.3)' }, { filter: 'brightness(1)' }], { duration: 500 });
        return true;
    } else {
        setStatus('Nope. Try again or auto‑mine.');
    }
    return false;
}

async function autoLoop() {
    if (!mining) return;
    // Batch a few nonces per frame for speed without freezing UI
    for (let i = 0; i < 50 && mining; i++) {
        const found = await mineOneBlock();
        
        if (found) break;
        nonce.value = Number(nonce.value) + 1;
    }
    if (mining) requestAnimationFrame(autoLoop);
}

// --- Events ---
tryBtn.addEventListener('click', async () => {
    await mineOneBlock();
    nonce.value = Number(nonce.value) + 1;
});

autoBtn.addEventListener('click', () => {
    if (mining) { setMining(false); return; }
    setMining(true); setStatus('Auto mining…'); requestAnimationFrame(autoLoop);
});

stopBtn.addEventListener('click', () => { setMining(false); setStatus('Stopped.'); });
resetBtn.addEventListener('click', resetAll);

prevHash.addEventListener('input', updateHeaderPreview);
dataEl.addEventListener('input', updateHeaderPreview);
nonce.addEventListener('input', updateHeaderPreview);

difficulty.addEventListener('input', () => { updateTargetUI(); updateHeaderPreview(); });

shareBtn.addEventListener('click', async () => {
    const payload = {
        prev: prevHash.value.trim(),
        data: dataEl.value.trim(),
        nonce: Number(nonce.value),
        hash: hashOut.textContent.trim(),
        difficulty: Number(difficulty.value),
        tries
    };
    const text = `I mined a block!\nDifficulty: ${payload.difficulty}\nNonce: ${payload.nonce}\nHash: ${payload.hash}\nTries: ${payload.tries.toLocaleString()}\n#Bitcoin #ProofOfWork`;
    try {
        await navigator.clipboard.writeText(text);
        setStatus('Copied summary to clipboard. Paste anywhere!');
    } catch (e) { setStatus('Copy failed. Select text manually.'); }
});
updateHeaderPreview(); updateTargetUI(); setStatus('Ready.');