const TOKEN_KEY = "farmTokenBalance";
const XP_KEY = "farmXp";
const WALLET_KEY = "farmWallet";
const PLAYER_STYLE_KEY = "farmPlayerStyle";

const TILE = 32;
const COLS = 50;
const ROWS = 30;
const VIEW_W = 800;
const VIEW_H = 480;

const canvas = document.getElementById("game");
const DPR = window.devicePixelRatio || 1;
canvas.width = VIEW_W * DPR;
canvas.height = VIEW_H * DPR;
canvas.style.width = `${VIEW_W}px`;
canvas.style.height = `${VIEW_H}px`;
const ctx = canvas.getContext("2d");
ctx.scale(DPR, DPR);

const balanceEl = document.getElementById("balance");
const onlineCountEl = document.getElementById("onlineCount");
const levelDisplayEl = document.getElementById("levelDisplay");
const walletGate = document.getElementById("walletGate");
const gateConnectBtn = document.getElementById("gateConnectBtn");
const gateStatus = document.getElementById("gateStatus");
const leaderboardListEl = document.getElementById("leaderboardList");

const otherPlayers = {};

// --- Balance & XP / leveling ---
function getBalance() {
  return parseFloat(localStorage.getItem(TOKEN_KEY) || "0");
}

function setBalance(value) {
  localStorage.setItem(TOKEN_KEY, value.toFixed(2));
  balanceEl.textContent = `${value.toFixed(2)} $FARM`;
}

function levelForXp(xp) {
  return Math.floor(xp / 100) + 1;
}

function getXp() {
  return parseFloat(localStorage.getItem(XP_KEY) || "0");
}

function setXp(value) {
  localStorage.setItem(XP_KEY, value.toFixed(2));
  levelDisplayEl.textContent = `Lv. ${levelForXp(value)}`;
}

// --- World ---
let terrain = [];

function terrainColor(col, row, now) {
  const t = terrain[row][col];
  if (t === "water") {
    const wave = Math.sin(col * 0.6 + row * 0.4 + now / 500);
    return `hsl(205, 60%, ${40 + wave * 6}%)`;
  }
  if (t === "sand") {
    return (col + row) % 2 === 0 ? "#d9c08c" : "#e0c896";
  }
  if (t === "rock") {
    return (col + row) % 2 === 0 ? "#5d4037" : "#6b4c3f";
  }
  return (col + row) % 2 === 0 ? "#3a8d3f" : "#418f46";
}

const RARITY_COLORS = {
  common: "rgba(255,255,255,0.25)",
  uncommon: "#60a5fa",
  rare: "#facc15",
};

// --- Resource tiers ---
const RESOURCE_TYPES = {
  wheat: { icon: "🌾", gatherTime: 1000, cooldown: 8000, reward: [1, 3], fail: 0, rarity: "common" },
  corn: { icon: "🌽", gatherTime: 2500, cooldown: 18000, reward: [4, 8], fail: 0, rarity: "uncommon" },
  pumpkin: { icon: "🎃", gatherTime: 5000, cooldown: 40000, reward: [10, 18], fail: 0, rarity: "rare" },

  commonFish: { icon: "🐟", gatherTime: 1500, cooldown: 12000, reward: [2, 5], fail: 0.25, rarity: "common" },
  bigFish: { icon: "🐡", gatherTime: 3500, cooldown: 28000, reward: [8, 15], fail: 0.35, rarity: "uncommon" },
  legendaryFish: { icon: "🦈", gatherTime: 7000, cooldown: 75000, reward: [25, 45], fail: 0.45, rarity: "rare" },

  copper: { icon: "⛏️", gatherTime: 2000, cooldown: 16000, reward: [3, 7], fail: 0, rarity: "common" },
  silver: { icon: "🔩", gatherTime: 4500, cooldown: 38000, reward: [12, 22], fail: 0, rarity: "uncommon" },
  gold: { icon: "💎", gatherTime: 9000, cooldown: 100000, reward: [35, 60], fail: 0.2, rarity: "rare" },
};

// --- Deterministic world layout (same map for every player) ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);
const occupied = new Set();

const nodes = [];
function addNode(col, row, type) {
  nodes.push({ col, row, type, cooldownUntil: 0, gathering: null });
}

const decorations = [];

// Mixed landscape: mostly green farmland, with a handful of ponds and
// rocky mining patches scattered across the map.
for (let r = 0; r < ROWS; r++) {
  terrain.push(new Array(COLS).fill("grass"));
}

function paintBlob(cx, cy, radius, type) {
  const minR = Math.max(0, Math.floor(cy - radius));
  const maxR = Math.min(ROWS - 1, Math.ceil(cy + radius));
  const minC = Math.max(0, Math.floor(cx - radius));
  const maxC = Math.min(COLS - 1, Math.ceil(cx + radius));
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const dx = c - cx;
      const dy = r - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) + (rng() - 0.5) * 1.6;
      if (dist <= radius) terrain[r][c] = type;
    }
  }
}

// Ponds
for (let i = 0; i < 6; i++) {
  paintBlob(2 + rng() * (COLS - 4), 2 + rng() * (ROWS - 4), 2 + rng() * 2.5, "water");
}

// Mining patches
for (let i = 0; i < 5; i++) {
  paintBlob(2 + rng() * (COLS - 4), 2 + rng() * (ROWS - 4), 2 + rng() * 2.5, "rock");
}

// Sandy shoreline around ponds
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (terrain[r][c] !== "grass") continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nr = r + dy;
      const nc = c + dx;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (terrain[nr][nc] === "water") {
        terrain[r][c] = "sand";
        break;
      }
    }
  }
}

function scatterOnTerrain(terrainType, count, place) {
  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${c},${r}`;
      if (terrain[r][c] === terrainType && !occupied.has(key)) candidates.push([c, r]);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    const [c, r] = candidates[i];
    occupied.add(`${c},${r}`);
    place(c, r);
  }
}

// Farmland
scatterOnTerrain("grass", 22, (c, r) => addNode(c, r, "wheat"));
scatterOnTerrain("grass", 7, (c, r) => addNode(c, r, "corn"));
scatterOnTerrain("grass", 2, (c, r) => addNode(c, r, "pumpkin"));
scatterOnTerrain("grass", 40, (c, r) => decorations.push({ col: c, row: r, icon: "🌳" }));
scatterOnTerrain("grass", 25, (c, r) => decorations.push({ col: c, row: r, icon: "🌿" }));

// Ponds
scatterOnTerrain("water", 10, (c, r) => addNode(c, r, "commonFish"));
scatterOnTerrain("water", 4, (c, r) => addNode(c, r, "bigFish"));
scatterOnTerrain("water", 2, (c, r) => addNode(c, r, "legendaryFish"));
scatterOnTerrain("water", 8, (c, r) => decorations.push({ col: c, row: r, icon: "🪷" }));

// Mining patches
scatterOnTerrain("rock", 10, (c, r) => addNode(c, r, "copper"));
scatterOnTerrain("rock", 4, (c, r) => addNode(c, r, "silver"));
scatterOnTerrain("rock", 2, (c, r) => addNode(c, r, "gold"));
scatterOnTerrain("rock", 15, (c, r) => decorations.push({ col: c, row: r, icon: "🪨" }));

// --- Player ---
const player = {
  x: 8 * TILE + TILE / 2,
  y: 15 * TILE + TILE / 2,
  size: 24,
  speed: 2.8,
};

function loadPlayerStyle() {
  let style = localStorage.getItem(PLAYER_STYLE_KEY);
  if (style) return JSON.parse(style);
  const emojis = ["🙂", "🤠", "🧑‍🌾", "🧑‍🚀", "🥷", "🧑‍🎤", "🦊", "🐸"];
  const colors = ["#fbbf24", "#f87171", "#60a5fa", "#a78bfa", "#34d399", "#f472b6"];
  style = {
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
  };
  localStorage.setItem(PLAYER_STYLE_KEY, JSON.stringify(style));
  return style;
}

const playerStyle = loadPlayerStyle();
const sessionId = Math.random().toString(36).slice(2, 10);

let wallet = localStorage.getItem(WALLET_KEY) || null;
let walletConnected = false;

function shortWallet(addr) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function hatForLevel(level) {
  if (level >= 20) return "👑";
  if (level >= 10) return "🎩";
  if (level >= 5) return "🧢";
  return null;
}

function toolForType(type) {
  if (type === "copper" || type === "silver" || type === "gold") return "⛏️";
  if (type === "commonFish" || type === "bigFish" || type === "legendaryFish") return "🎣";
  return null;
}

// --- Input ---
const keys = {};
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === " " || k === "e") {
    e.preventDefault();
    tryGather();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

const floatingTexts = [];

function nearbyNode() {
  const pc = Math.floor(player.x / TILE);
  const pr = Math.floor(player.y / TILE);
  let closest = null;
  for (const node of nodes) {
    const dist = Math.max(Math.abs(node.col - pc), Math.abs(node.row - pr));
    if (dist <= 1) {
      closest = node;
      break;
    }
  }
  return closest;
}

function tryGather() {
  if (!walletConnected) return;
  const now = Date.now();
  const node = nearbyNode();
  if (!node || node.gathering || now < node.cooldownUntil) return;
  const def = RESOURCE_TYPES[node.type];
  node.gathering = { start: now, duration: def.gatherTime };
}

function update() {
  if (!walletConnected) return;

  let dx = 0;
  let dy = 0;
  if (keys["arrowup"] || keys["w"]) dy -= 1;
  if (keys["arrowdown"] || keys["s"]) dy += 1;
  if (keys["arrowleft"] || keys["a"]) dx -= 1;
  if (keys["arrowright"] || keys["d"]) dx += 1;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    player.x += (dx / len) * player.speed;
    player.y += (dy / len) * player.speed;
    player.x = Math.max(player.size / 2, Math.min(COLS * TILE - player.size / 2, player.x));
    player.y = Math.max(player.size / 2, Math.min(ROWS * TILE - player.size / 2, player.y));
  }

  const now = Date.now();
  for (const node of nodes) {
    if (!node.gathering) continue;
    const elapsed = now - node.gathering.start;
    if (elapsed < node.gathering.duration) continue;

    const def = RESOURCE_TYPES[node.type];
    const cx = node.col * TILE + TILE / 2;
    const cy = node.row * TILE + TILE / 2;
    const failed = Math.random() < (def.fail || 0);

    if (failed) {
      floatingTexts.push({ x: cx, y: cy, text: "Missed!", life: 900, start: now, color: "#f87171" });
    } else {
      const [min, max] = def.reward;
      const reward = min + Math.random() * (max - min);
      setBalance(getBalance() + reward);
      setXp(getXp() + reward);
      floatingTexts.push({ x: cx, y: cy, text: `+${reward.toFixed(2)} $FARM`, life: 900, start: now, color: "#4ade80" });
      syncPlayerToServer();
    }

    node.gathering = null;
    node.cooldownUntil = now + def.cooldown;
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    if (now - floatingTexts[i].start > floatingTexts[i].life) floatingTexts.splice(i, 1);
  }
}

function getCamera() {
  let x = player.x - VIEW_W / 2;
  let y = player.y - VIEW_H / 2;
  x = Math.max(0, Math.min(COLS * TILE - VIEW_W, x));
  y = Math.max(0, Math.min(ROWS * TILE - VIEW_H, y));
  return { x, y };
}

function draw() {
  const now = Date.now();
  const cam = getCamera();

  ctx.fillStyle = "#0c1014";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  const startCol = Math.max(0, Math.floor(cam.x / TILE));
  const endCol = Math.min(COLS, Math.ceil((cam.x + VIEW_W) / TILE));
  const startRow = Math.max(0, Math.floor(cam.y / TILE));
  const endRow = Math.min(ROWS, Math.ceil((cam.y + VIEW_H) / TILE));

  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      ctx.fillStyle = terrainColor(c, r, now);
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

      if (terrain[r][c] === "grass" && (c * 31 + r * 17) % 7 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fillRect(c * TILE + 6, r * TILE + 9, 3, 9);
        ctx.fillRect(c * TILE + 18, r * TILE + 15, 3, 9);
      }
    }
  }

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let c = startCol; c <= endCol; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE, startRow * TILE);
    ctx.lineTo(c * TILE, endRow * TILE);
    ctx.stroke();
  }
  for (let r = startRow; r <= endRow; r++) {
    ctx.beginPath();
    ctx.moveTo(startCol * TILE, r * TILE);
    ctx.lineTo(endCol * TILE, r * TILE);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const d of decorations) {
    if (d.col < startCol - 1 || d.col > endCol || d.row < startRow - 1 || d.row > endRow) continue;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = "20px serif";
    ctx.fillText(d.icon, d.col * TILE + TILE / 2, d.row * TILE + TILE / 2);
    ctx.restore();
  }

  const active = nearbyNode();
  for (const node of nodes) {
    const def = RESOURCE_TYPES[node.type];
    const cx = node.col * TILE + TILE / 2;
    const cy = node.row * TILE + TILE / 2;
    const onCooldown = now < node.cooldownUntil;

    if (def.rarity !== "common") {
      ctx.beginPath();
      ctx.arc(cx, cy, TILE / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = RARITY_COLORS[def.rarity];
      ctx.lineWidth = 2;
      ctx.globalAlpha = onCooldown ? 0.25 : 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.font = "22px serif";
    if (onCooldown) ctx.globalAlpha = 0.3;
    ctx.fillText(def.icon, cx, cy);
    ctx.restore();

    if (node.gathering) {
      const progress = Math.min(1, (now - node.gathering.start) / node.gathering.duration);
      ctx.fillStyle = "#000";
      ctx.fillRect(cx - 14, cy - TILE / 2 - 6, 28, 4);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(cx - 14, cy - TILE / 2 - 6, 28 * progress, 4);
    } else if (onCooldown) {
      const remaining = Math.ceil((node.cooldownUntil - now) / 1000);
      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${remaining}s`, cx, cy + TILE / 2 - 4);
    } else if (node === active) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("Press E", cx, cy - TILE / 2 - 4);
    }
  }

  const cutoff = now - 8000;
  for (const id in otherPlayers) {
    const p = otherPlayers[id];
    if (p.ts < cutoff) continue;
    drawCharacter(p.x, p.y, { emoji: p.emoji, color: p.color }, p.level || 1, p.label || "anon", p.tool || null, !!p.gathering);
  }

  let activeNode = active;
  for (const node of nodes) {
    if (node.gathering) {
      activeNode = node;
      break;
    }
  }
  const selfTool = activeNode ? toolForType(activeNode.type) : null;
  const selfGathering = !!(activeNode && activeNode.gathering);

  drawCharacter(player.x, player.y, playerStyle, levelForXp(getXp()), wallet ? shortWallet(wallet) : "you", selfTool, selfGathering);

  for (const ft of floatingTexts) {
    const elapsed = now - ft.start;
    const progress = elapsed / ft.life;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = ft.color;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(ft.text, ft.x, ft.y - progress * 22);
    ctx.restore();
  }

  ctx.restore();
}

function drawCharacter(x, y, style, level, label, tool, gathering) {
  const r = player.size / 2;

  // shadow
  ctx.beginPath();
  ctx.ellipse(x, y + r + 2, r, r / 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  // body with glossy gradient
  const grad = ctx.createRadialGradient(x - r / 2.5, y - r / 2.5, 1, x, y, r);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.35, style.color);
  grad.addColorStop(1, style.color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // face
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(style.emoji, x, y + 1);

  // hat for higher levels
  const hat = hatForLevel(level);
  if (hat) {
    ctx.font = "16px serif";
    ctx.fillText(hat, x, y - r - 4);
  }

  // name + level tag
  const text = `Lv.${level}  ${label}`;
  ctx.font = "bold 10px sans-serif";
  const w = ctx.measureText(text).width + 10;
  const tagY = y - r - (hat ? 24 : 14);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - w / 2, tagY - 7, w, 14);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, tagY);

  // tool held in hand
  if (tool) {
    ctx.save();
    const angle = gathering ? -0.6 + Math.sin(Date.now() / 90) * 0.5 : -0.35;
    ctx.translate(x + r + 6, y + r / 2);
    ctx.rotate(angle);
    ctx.font = "18px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tool, 0, 0);
    ctx.restore();
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

setBalance(getBalance());
setXp(getXp());

// --- Wallet gate ---
function getProvider() {
  return window?.phantom?.solana || window.solana || null;
}

function unlockGame() {
  walletConnected = true;
  walletGate.classList.add("hidden");
  loadPlayerFromServer();
}

async function connectWallet() {
  const provider = getProvider();
  if (!provider) {
    gateStatus.textContent = "No Solana wallet found. Install Phantom (phantom.app) and refresh.";
    return;
  }
  try {
    gateStatus.textContent = "Connecting...";
    const resp = await provider.connect();
    wallet = resp.publicKey.toString();
    localStorage.setItem(WALLET_KEY, wallet);
    unlockGame();
  } catch (err) {
    gateStatus.textContent = "Connection cancelled — try again.";
  }
}

gateConnectBtn.addEventListener("click", connectWallet);

(async function tryAutoConnect() {
  const provider = getProvider();
  if (!wallet || !provider) return;
  try {
    const resp = await provider.connect({ onlyIfTrusted: true });
    if (resp.publicKey.toString() === wallet) {
      unlockGame();
    }
  } catch (err) {
    // not auto-approved; player must click connect
  }
})();

// --- Multiplayer + leaderboard (Supabase) ---
let supabaseClient = null;
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && typeof window.supabase !== "undefined") {
  supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

function updateOnlineCount() {
  const now = Date.now();
  const cutoff = now - 8000;
  let count = 1; // self
  for (const id in otherPlayers) {
    if (otherPlayers[id].ts >= cutoff) count++;
  }
  onlineCountEl.textContent = `${count} player${count === 1 ? "" : "s"}`;
}
setInterval(updateOnlineCount, 1000);

if (supabaseClient) {
  const channel = supabaseClient.channel("farm-world", {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "move" }, ({ payload }) => {
    if (!payload || payload.id === sessionId) return;
    otherPlayers[payload.id] = {
      x: payload.x,
      y: payload.y,
      emoji: payload.emoji,
      color: payload.color,
      level: payload.level,
      label: payload.label,
      tool: payload.tool,
      gathering: payload.gathering,
      ts: Date.now(),
    };
    updateOnlineCount();
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      onlineCountEl.textContent = "1 player";
      setInterval(() => {
        let activeNode = nearbyNode();
        for (const node of nodes) {
          if (node.gathering) {
            activeNode = node;
            break;
          }
        }
        channel.send({
          type: "broadcast",
          event: "move",
          payload: {
            id: sessionId,
            x: Math.round(player.x),
            y: Math.round(player.y),
            emoji: playerStyle.emoji,
            color: playerStyle.color,
            level: levelForXp(getXp()),
            label: wallet ? shortWallet(wallet) : "anon",
            tool: activeNode ? toolForType(activeNode.type) : null,
            gathering: !!(activeNode && activeNode.gathering),
          },
        });
      }, 120);
    }
  });
} else {
  onlineCountEl.textContent = "Offline";
}

async function loadPlayerFromServer() {
  if (!supabaseClient || !wallet) return;
  try {
    const { data } = await supabaseClient.from("players").select("*").eq("wallet", wallet).maybeSingle();
    if (data) {
      const serverXp = parseFloat(data.xp) || 0;
      const serverBalance = parseFloat(data.balance) || 0;
      if (serverXp > getXp()) setXp(serverXp);
      if (serverBalance > getBalance()) setBalance(serverBalance);
    }
  } catch (err) {
    console.warn("Could not load player from Supabase", err);
  }
  syncPlayerToServer();
  refreshLeaderboard();
}

async function syncPlayerToServer() {
  if (!supabaseClient || !wallet) return;
  const xp = getXp();
  const balance = getBalance();
  const level = levelForXp(xp);
  try {
    await supabaseClient.from("players").upsert({
      wallet,
      level,
      xp,
      balance,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Could not sync player to Supabase", err);
  }
}

async function refreshLeaderboard() {
  if (!supabaseClient) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Multiplayer not configured.</li>';
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from("players")
      .select("wallet, level, xp")
      .order("xp", { ascending: false })
      .limit(10);
    if (error) throw error;
    renderLeaderboard(data || []);
  } catch (err) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Leaderboard unavailable — run supabase/schema.sql in your Supabase project.</li>';
  }
}

function renderLeaderboard(rows) {
  if (!rows.length) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">No grinders yet — be the first!</li>';
    return;
  }
  leaderboardListEl.innerHTML = rows
    .map((row, i) => {
      const isSelf = wallet && row.wallet === wallet;
      return `<li class="${isSelf ? "self" : ""}">
        <span class="rank">#${i + 1}</span>
        <span class="wallet">${shortWallet(row.wallet)}</span>
        <span class="level">Lv.${row.level}</span>
        <span class="xp">${Math.floor(row.xp)} XP</span>
      </li>`;
    })
    .join("");
}

setInterval(refreshLeaderboard, 8000);
setInterval(syncPlayerToServer, 10000);
refreshLeaderboard();

loop();
