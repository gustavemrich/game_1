const TOKEN_KEY = "farmTokenBalance";

const connectBtn = document.getElementById("connectBtn");
const walletInfo = document.getElementById("walletInfo");
const balancePill = document.getElementById("balance");
const farmBalanceEl = document.getElementById("farmBalance");
const solBalanceEl = document.getElementById("solBalance");
const swapForm = document.getElementById("swapForm");
const fromAmount = document.getElementById("fromAmount");
const toAmount = document.getElementById("toAmount");

// Placeholder pre-launch rate: purely illustrative until $FARM trades on-chain.
const PLACEHOLDER_RATE = 1; // 1 in-game $FARM => 1 future $FARM token

let publicKey = null;

function getProvider() {
  return window?.phantom?.solana || window.solana || null;
}

function getBalance() {
  return parseFloat(localStorage.getItem(TOKEN_KEY) || "0");
}

function refreshFarmBalance() {
  const value = getBalance();
  farmBalanceEl.textContent = value.toFixed(2);
  balancePill.textContent = `${value.toFixed(2)} $FARM`;
}

async function fetchSolBalance() {
  if (!publicKey || typeof solanaWeb3 === "undefined") {
    solBalanceEl.textContent = "-";
    return;
  }
  try {
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("mainnet-beta"));
    const lamports = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
    solBalanceEl.textContent = (lamports / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
  } catch (err) {
    solBalanceEl.textContent = "N/A";
  }
}

function setConnectedUI(address) {
  walletInfo.textContent = `Connected: ${address.slice(0, 4)}...${address.slice(-4)}`;
  connectBtn.textContent = "Disconnect";
}

function setDisconnectedUI() {
  walletInfo.textContent = "Wallet not connected";
  connectBtn.textContent = "Connect Wallet";
  solBalanceEl.textContent = "-";
}

async function connectWallet() {
  const provider = getProvider();
  if (!provider) {
    alert("No Solana wallet found. Install Phantom (phantom.app) to connect.");
    return;
  }
  try {
    const resp = await provider.connect();
    publicKey = resp.publicKey.toString();
    setConnectedUI(publicKey);
    await fetchSolBalance();
  } catch (err) {
    console.error("Wallet connection failed", err);
  }
}

async function disconnectWallet() {
  const provider = getProvider();
  if (provider && provider.disconnect) {
    try {
      await provider.disconnect();
    } catch (err) {
      console.error("Wallet disconnect failed", err);
    }
  }
  publicKey = null;
  setDisconnectedUI();
}

connectBtn.addEventListener("click", () => {
  if (publicKey) {
    disconnectWallet();
  } else {
    connectWallet();
  }
});

fromAmount.addEventListener("input", () => {
  const value = parseFloat(fromAmount.value) || 0;
  toAmount.value = (value * PLACEHOLDER_RATE).toFixed(2);
});

swapForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(fromAmount.value) || 0;
  if (amount <= 0) {
    alert("Enter an amount of $FARM to swap.");
    return;
  }
  if (amount > getBalance()) {
    alert("You don't have that much $FARM yet — keep farming, fishing, and mining!");
    return;
  }
  if (!publicKey) {
    alert("Connect your Solana wallet first so we know where to send your $FARM at launch.");
    return;
  }
  alert("Swapping isn't live yet — $FARM hasn't launched on Solana. Your balance is saved and will be claimable once the token goes live.");
});

// Attempt silent reconnect if the wallet is already trusted.
(async function init() {
  refreshFarmBalance();
  const provider = getProvider();
  if (provider && provider.isConnected && provider.publicKey) {
    publicKey = provider.publicKey.toString();
    setConnectedUI(publicKey);
    await fetchSolBalance();
  }
})();

window.addEventListener("storage", refreshFarmBalance);
setInterval(refreshFarmBalance, 1000);
