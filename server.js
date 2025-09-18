require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

// ---------- CORS ----------
const FRONTEND_URLS = [
  "https://monad-faucet-vert-three.vercel.app",
  "http://localhost:5173"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // Allow Postman or mobile apps with no origin
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
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Address required' });

    const tx = await contract.claim(address);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error("Claim error:", err);

    // Safe error handling
    let errorMessage = "Unknown error";
    if (err) {
      if (err.reason) errorMessage = err.reason;
      else if (err.message) errorMessage = err.message;
    }

    res.status(500).json({ success: false, error: errorMessage });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(🚀 Faucet backend running on port ${PORT});
});