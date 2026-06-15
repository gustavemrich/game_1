const TOKEN_KEY = "farmTokenBalance";

const TILE = 32;
const COLS = 25;
const ROWS = 15;

const canvas = document.getElementById("game");
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;
const ctx = canvas.getContext("2d");

const balanceEl = document.getElementById("balance");

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

const ICONS = { crop: "🌾", fish: "🐟", ore: "⛏️" };
const REWARD_RANGE = {
  crop: [1, 3],
  fish: [2, 5],
  ore: [3, 7],
};
const FAIL_CHANCE = { crop: 0, fish: 0.3, ore: 0.1 };
const GATHER_TIME = { crop: 1000, fish: 1500, ore: 2000 };
const COOLDOWN_TIME = { crop: 8000, fish: 12000, ore: 16000 };

const nodes = [];
function addNode(col, row, type) {
  nodes.push({ col, row, type, cooldownUntil: 0, gathering: null });
}

for (let i = 0; i < 6; i++) {
  addNode(1 + (i % 3) * 2, 2 + Math.floor(i / 3) * 6, "crop");
}
for (let i = 0; i < 5; i++) {
  addNode(9 + (i % 3) * 3, 2 + Math.floor(i / 3) * 6, "fish");
}
for (let i = 0; i < 6; i++) {
  addNode(18 + (i % 3) * 2, 2 + Math.floor(i / 3) * 6, "ore");
}

// --- Player ---
const player = {
  x: 12 * TILE + TILE / 2,
  y: 7 * TILE + TILE / 2,
  size: 22,
  speed: 2.6,
};

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
  node.gathering = { start: now, duration: GATHER_TIME[node.type] };
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

    const cx = node.col * TILE + TILE / 2;
    const cy = node.row * TILE + TILE / 2;
    const failed = Math.random() < (FAIL_CHANCE[node.type] || 0);

    if (failed) {
      floatingTexts.push({ x: cx, y: cy, text: "Missed!", life: 900, start: now, color: "#f87171" });
    } else {
      const [min, max] = REWARD_RANGE[node.type];
      const reward = min + Math.random() * (max - min);
      setBalance(getBalance() + reward);
      floatingTexts.push({ x: cx, y: cy, text: `+${reward.toFixed(2)} $FARM`, life: 900, start: now, color: "#4ade80" });
    }

    node.gathering = null;
    node.cooldownUntil = now + COOLDOWN_TIME[node.type];
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
    const cx = node.col * TILE + TILE / 2;
    const cy = node.row * TILE + TILE / 2;
    const onCooldown = now < node.cooldownUntil;

    ctx.save();
    ctx.font = "22px serif";
    if (onCooldown) ctx.globalAlpha = 0.3;
    ctx.fillText(ICONS[node.type], cx, cy);
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

  // player
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "18px serif";
  ctx.fillText("🙂", player.x, player.y + 1);

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

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

setBalance(getBalance());
loop();
