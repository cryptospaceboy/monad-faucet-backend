require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

// ---------- CORS (allow all for testing) ----------
app.use(cors());

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

// ---------- Helper to send responses ----------
function sendRes(res, success, message, extra = {}) {
  return res.json({ success, message, ...extra });
}

// ---------- Claim endpoint with checks ----------
app.post('/claim', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return sendRes(res, false, '⚠️ Address is required');

    // --- Wallet age check ---
    const history = await provider.getHistory(address);
    if (history.length === 0) {
      return sendRes(res, false, "⚠️ Wallet has no transactions yet");
    }

    const firstTx = history[0];
    const firstBlock = await provider.getBlock(firstTx.blockNumber);
    const walletAgeDays = (Date.now() / 1000 - firstBlock.timestamp) / (60 * 60 * 24);

    if (walletAgeDays < 10) {
      return sendRes(res, false, "⏳ Wallet must be at least 10 days old");
    }

    // --- Transaction count check ---
    if (history.length < 10) {
      return sendRes(res, false, "📉 Wallet must have at least 10 transactions");
    }

    // --- Call faucet contract ---
    const tx = await contract.claim(address);
    await tx.wait();

    return sendRes(res, true, "✅ Claim successful", { txHash: tx.hash });
  } catch (err) {
    console.error("Claim error:", err);
    return sendRes(res, false, "❌ Something went wrong, try again later");
  }
});

// ---------- Cooldown endpoint ----------
app.post('/cooldown', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return sendRes(res, false, '⚠️ Address is required');

    const nextClaim = await contract.nextClaimTime(address);
    return sendRes(res, true, "✅ Cooldown fetched", { nextClaim: nextClaim.toNumber() });
  } catch (err) {
    console.error("Cooldown error:", err);
    return sendRes(res, false, "❌ Could not fetch cooldown");
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Faucet backend running on port ${PORT}`);
});