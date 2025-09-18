require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ---------- CORS ----------
const FRONTEND_URLS = [
  "https://monad-faucet-vert-three.vercel.app",
  "http://localhost:5173"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (FRONTEND_URLS.indexOf(origin) === -1) {
      return callback(new Error("The CORS policy for this site does not allow access from the specified Origin."), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// ---------- Faucet contract config ----------
const FAUCET_CONTRACT_ADDRESS = process.env.FAUCET_CONTRACT_ADDRESS;
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const PROVIDER_URL = process.env.PROVIDER_URL;

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(FAUCET_PRIVATE_KEY, provider);
const FAUCET_ABI = [
  "function claim(address _to) external",
  "function nextClaimTime(address _user) view returns(uint256)"
];
const contract = new ethers.Contract(FAUCET_CONTRACT_ADDRESS, FAUCET_ABI, wallet);

// ---------- Logging ----------
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}
const logFile = path.join(logDir, "claims.log");

function writeLog(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// ---------- Helper: check wallet rules ----------
async function checkWalletEligibility(address) {
  const txCount = await provider.getTransactionCount(address);
  if (txCount < 10) {
    return { eligible: false, reason: "Wallet must have at least 10 transactions" };
  }

  const history = await provider.getHistory(address);
  if (history.length === 0) {
    return { eligible: false, reason: "Wallet has no transactions" };
  }

  const firstTx = history[0];
  const firstTxBlock = await provider.getBlock(firstTx.blockNumber);
  const walletCreatedAt = firstTxBlock.timestamp;

  const now = Math.floor(Date.now() / 1000);
  const walletAgeDays = (now - walletCreatedAt) / (60 * 60 * 24);

  if (walletAgeDays < 12) {
    return { eligible: false, reason: "Wallet must be at least 12 days old" };
  }

  return { eligible: true };
}

// ---------- Check cooldown ----------
app.post('/cooldown', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    const nextClaim = await contract.nextClaimTime(address);
    res.json({ nextClaim: nextClaim.toNumber() });
  } catch (err) {
    console.error("Cooldown error:", err);
    res.status(500).json({ error: (err && err.message) ? err.message : "Unknown error" });
  }
});

// ---------- Claim endpoint ----------
app.post('/claim', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    writeLog(`❌ Claim attempt without address`);
    return res.status(400).json({ success: false, error: 'Address required' });
  }

  try {
    // 🔹 Eligibility check
    const eligibility = await checkWalletEligibility(address);
    if (!eligibility.eligible) {
      writeLog(`❌ ${address} claim denied - ${eligibility.reason}`);
      return res.status(403).json({ success: false, error: eligibility.reason });
    }

    // 🔹 If eligible, process claim
    const tx = await contract.claim(address);
    await tx.wait();

    writeLog(`✅ ${address} claimed successfully | tx: ${tx.hash}`);
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    let errorMessage = "Unknown error";
    if (err) {
      if (err.reason) errorMessage = err.reason;
      else if (err.message) errorMessage = err.message;
    }
    writeLog(`❌ ${address} claim failed - ${errorMessage}`);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Faucet backend running on port ${PORT}`);
});