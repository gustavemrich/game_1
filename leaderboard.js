const WALLET_KEY = "farmWallet";
const XP_KEY = "farmXp";
const TOKEN_KEY = "farmTokenBalance";

const wallet = localStorage.getItem(WALLET_KEY) || null;

const leaderboardListEl = document.getElementById("leaderboardList");
const tabsEl = document.getElementById("leaderboardTabs");
const balanceEl = document.getElementById("balance");
const levelDisplayEl = document.getElementById("levelDisplay");
const onlineCountEl = document.getElementById("onlineCount");

let supabaseClient = null;
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && typeof window.supabase !== "undefined") {
  supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

function shortWallet(addr) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function levelForXp(xp) {
  return Math.floor(xp / 100) + 1;
}

function getXp() {
  return parseFloat(localStorage.getItem(XP_KEY) || "0");
}

function getBalance() {
  return parseFloat(localStorage.getItem(TOKEN_KEY) || "0");
}

balanceEl.textContent = `${getBalance().toFixed(2)} $FARM`;
levelDisplayEl.textContent = `Lv. ${levelForXp(getXp())}`;

// --- Online player count ---
const otherPlayers = {};

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
    if (!payload) return;
    otherPlayers[payload.id] = { ts: Date.now() };
    updateOnlineCount();
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      onlineCountEl.textContent = "1 player";
    }
  });
} else {
  onlineCountEl.textContent = "Offline";
}

const TAB_CONFIG = {
  xp: { column: "xp", label: "XP" },
  mining_xp: { column: "mining_xp", label: "Mining XP" },
  fishing_xp: { column: "fishing_xp", label: "Fishing XP" },
  farming_xp: { column: "farming_xp", label: "Farming XP" },
};

let activeTab = "xp";

async function loadLeaderboard(tab) {
  if (!supabaseClient) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Multiplayer not configured.</li>';
    return;
  }
  const config = TAB_CONFIG[tab];
  leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Loading…</li>';
  try {
    const { data, error } = await supabaseClient
      .from("players")
      .select("wallet, name, level, xp, mining_xp, fishing_xp, farming_xp")
      .order(config.column, { ascending: false })
      .limit(10);
    if (error) throw error;
    renderLeaderboard(data || [], config);
  } catch (err) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Leaderboard unavailable — run supabase/schema.sql in your Supabase project.</li>';
  }
}

function renderLeaderboard(rows, config) {
  if (!rows.length) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">No grinders yet — be the first!</li>';
    return;
  }
  leaderboardListEl.innerHTML = rows
    .map((row, i) => {
      const isSelf = wallet && row.wallet === wallet;
      const name = row.name && row.name.trim() ? row.name.trim() : shortWallet(row.wallet);
      const value = parseFloat(row[config.column]) || 0;
      return `<li class="${isSelf ? "self" : ""}">
        <span class="rank">#${i + 1}</span>
        <span class="wallet">${name}</span>
        <span class="level">Lv.${row.level}</span>
        <span class="xp">${Math.floor(value)} ${config.label}</span>
      </li>`;
    })
    .join("");
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab;
  if (tab === activeTab) return;
  activeTab = tab;
  for (const b of tabsEl.querySelectorAll(".tab-btn")) {
    b.classList.toggle("active", b === btn);
  }
  loadLeaderboard(activeTab);
});

loadLeaderboard(activeTab);
setInterval(() => loadLeaderboard(activeTab), 8000);
