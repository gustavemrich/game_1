const TOKEN_KEY = "farmTokenBalance";
const PLAYER_ID_KEY = "farmPlayerId";
const PLAYER_STYLE_KEY = "farmPlayerStyle";

const TILE = 32;
const COLS = 25;
const ROWS = 15;

const canvas = document.getElementById("game");
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext("2d");

const balanceEl = document.getElementById("balance");
const onlineCountEl = document.getElementById("onlineCount");

const otherPlayers = {};

function getBalance() {
  return parseFloat(localStorage.getItem(TOKEN_KEY) || "0");
}

function setBalance(value) {
  localStorage.setItem(TOKEN_KEY, value.toFixed(2));
  balanceEl.textContent = `${value.toFixed(2)} $FARM`;
}

// --- World ---
const ZONE_COLORS = {
  grass: "#2e7d32",
  water: "#1565c0",
  rock: "#5d4037",
};

function zoneAt(col) {
  if (col < 8) return "grass";
  if (col < 17) return "water";
  return "rock";
}

const RARITY_COLORS = {
  common: "rgba(255,255,255,0.25)",
  uncommon: "#60a5fa",
  rare: "#facc15",
};

// --- Resource tiers ---
const RESOURCE_TYPES = {
  wheat: { icon: "🌾", zone: "grass", gatherTime: 1000, cooldown: 8000, reward: [1, 3], fail: 0, rarity: "common" },
  corn: { icon: "🌽", zone: "grass", gatherTime: 2500, cooldown: 18000, reward: [4, 8], fail: 0, rarity: "uncommon" },
  pumpkin: { icon: "🎃", zone: "grass", gatherTime: 5000, cooldown: 40000, reward: [10, 18], fail: 0, rarity: "rare" },

  commonFish: { icon: "🐟", zone: "water", gatherTime: 1500, cooldown: 12000, reward: [2, 5], fail: 0.25, rarity: "common" },
  bigFish: { icon: "🐡", zone: "water", gatherTime: 3500, cooldown: 28000, reward: [8, 15], fail: 0.35, rarity: "uncommon" },
  legendaryFish: { icon: "🦈", zone: "water", gatherTime: 7000, cooldown: 75000, reward: [25, 45], fail: 0.45, rarity: "rare" },

  copper: { icon: "⛏️", zone: "rock", gatherTime: 2000, cooldown: 16000, reward: [3, 7], fail: 0, rarity: "common" },
  silver: { icon: "🔩", zone: "rock", gatherTime: 4500, cooldown: 38000, reward: [12, 22], fail: 0, rarity: "uncommon" },
  gold: { icon: "💎", zone: "rock", gatherTime: 9000, cooldown: 100000, reward: [35, 60], fail: 0.2, rarity: "rare" },
};

const nodes = [];
function addNode(col, row, type) {
  nodes.push({ col, row, type, cooldownUntil: 0, gathering: null });
}

// Fields (cols 0-7)
[[1, 2], [3, 2], [1, 6], [3, 6], [1, 10], [3, 10]].forEach(([c, r]) => addNode(c, r, "wheat"));
[[5, 3], [5, 8], [6, 12]].forEach(([c, r]) => addNode(c, r, "corn"));
addNode(2, 13, "pumpkin");

// Lake (cols 8-16)
[[9, 2], [12, 2], [15, 2], [9, 7], [12, 7], [15, 7]].forEach(([c, r]) => addNode(c, r, "commonFish"));
[[10, 11], [14, 11]].forEach(([c, r]) => addNode(c, r, "bigFish"));
addNode(12, 13, "legendaryFish");

// Mountains (cols 17-24)
[[18, 2], [20, 2], [22, 2], [18, 7], [20, 7], [22, 7]].forEach(([c, r]) => addNode(c, r, "copper"));
[[19, 11], [23, 11]].forEach(([c, r]) => addNode(c, r, "silver"));
addNode(21, 13, "gold");

// --- Player ---
const player = {
  x: 12 * TILE + TILE / 2,
  y: 7 * TILE + TILE / 2,
  size: 22,
  speed: 2.6,
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

function loadPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (id) return id;
  id = Math.random().toString(36).slice(2, 10);
  localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

const playerId = loadPlayerId();
const playerStyle = loadPlayerStyle();

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
  const now = Date.now();
  const node = nearbyNode();
  if (!node || node.gathering || now < node.cooldownUntil) return;
  const def = RESOURCE_TYPES[node.type];
  node.gathering = { start: now, duration: def.gatherTime };
}

function update() {
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
    player.x = Math.max(player.size / 2, Math.min(canvas.width - player.size / 2, player.x));
    player.y = Math.max(player.size / 2, Math.min(canvas.height - player.size / 2, player.y));
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
      floatingTexts.push({ x: cx, y: cy, text: `+${reward.toFixed(2)} $FARM`, life: 900, start: now, color: "#4ade80" });
    }

    node.gathering = null;
    node.cooldownUntil = now + def.cooldown;
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    if (now - floatingTexts[i].start > floatingTexts[i].life) floatingTexts.splice(i, 1);
  }
}

function draw() {
  // terrain
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = ZONE_COLORS[zoneAt(c)];
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }

  // grid
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE, 0);
    ctx.lineTo(c * TILE, canvas.height);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * TILE);
    ctx.lineTo(canvas.width, r * TILE);
    ctx.stroke();
  }

  const now = Date.now();
  const active = nearbyNode();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

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
      ctx.globalAlpha = onCooldown ? 0.25 : 0.8;
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

  // other players
  drawCharacter(player.x, player.y, playerStyle.emoji, playerStyle.color, null);
  const cutoff = now - 8000;
  for (const id in otherPlayers) {
    const p = otherPlayers[id];
    if (p.ts < cutoff) continue;
    drawCharacter(p.x, p.y, p.emoji, p.color, id.slice(0, 4));
  }

  // floating texts
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
}

function drawCharacter(x, y, emoji, color, label) {
  ctx.beginPath();
  ctx.arc(x, y, player.size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y + 1);
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(label, x, y - player.size / 2 - 6);
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

setBalance(getBalance());
loop();

// --- Multiplayer (Supabase Realtime) ---
function updateOnlineCount() {
  const now = Date.now();
  const cutoff = now - 8000;
  let count = 1; // include self
  for (const id in otherPlayers) {
    if (otherPlayers[id].ts >= cutoff) count++;
  }
  onlineCountEl.textContent = `${count} player${count === 1 ? "" : "s"}`;
}
setInterval(updateOnlineCount, 1000);

(function initMultiplayer() {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key || typeof window.supabase === "undefined") {
    onlineCountEl.textContent = "Offline";
    return;
  }

  const client = window.supabase.createClient(url, key);
  const channel = client.channel("farm-world", {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "move" }, ({ payload }) => {
    if (!payload || payload.id === playerId) return;
    otherPlayers[payload.id] = {
      x: payload.x,
      y: payload.y,
      emoji: payload.emoji,
      color: payload.color,
      ts: Date.now(),
    };
    updateOnlineCount();
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      onlineCountEl.textContent = "1 player";
      setInterval(() => {
        channel.send({
          type: "broadcast",
          event: "move",
          payload: {
            id: playerId,
            x: Math.round(player.x),
            y: Math.round(player.y),
            emoji: playerStyle.emoji,
            color: playerStyle.color,
          },
        });
      }, 120);
    }
  });
})();
