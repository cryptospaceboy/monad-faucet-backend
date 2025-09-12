require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

// ---------- CORS ----------
const FRONTEND_URL = "http://localhost:5173"; 
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// ---------- Faucet contract config ----------
const FAUCET_CONTRACT_ADDRESS = process.env.FAUCET_CONTRACT_ADDRESS;
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const PROVIDER_URL = process.env.PROVIDER_URL; // Monad testnet RPC

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(FAUCET_PRIVATE_KEY, provider);
const FAUCET_ABI = [
  "function claim(address _to) external",
  "function nextClaimTime(address _user) view returns(uint256)"
];
const contract = new ethers.Contract(FAUCET_CONTRACT_ADDRESS, FAUCET_ABI, wallet);

// In-memory cooldown storage
const claims = {}; // { address: timestamp }
const COOLDOWN_HOURS = 9;

// ---------- Check cooldown ----------
app.post('/cooldown', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    const nextClaim = await contract.nextClaimTime(address);
    res.json({ nextClaim: nextClaim.toNumber() });
  } catch (err) {
    console.error("Cooldown error:", err);
    res.status(500).json({ error: 'Failed to fetch cooldown' });
  }
});

// ---------- Claim endpoint ----------
app.post('/claim', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    const now = Math.floor(Date.now() / 1000);
    const nextClaim = await contract.nextClaimTime(address);
    if (nextClaim.toNumber() > now) {
      return res.status(400).json({ success: false, error: 'Cooldown active' });
    }

    const tx = await contract.claim(address);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error("Claim error:", err);
    res.status(500).json({ success: false, error: err.reason || err.message });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Faucet backend running on port ${PORT}`);
});