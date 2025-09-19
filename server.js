// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== ENV CONFIG ======
const PORT = process.env.PORT || 5000;
const PROVIDER_URL = process.env.RPC_URL;   // e.g. Ankr/Alchemy/Infura or local node
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CLAIM_AMOUNT = ethers.parseEther("0.05"); // 0.05 MON

// ====== ETHERS SETUP ======
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// faucet contract ABI (must include the claim function)
const abi = [
  "function claim(address to, uint256 amount) public returns (bool)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

// ====== COOLDOWN STORE ======
// Simple in-memory cooldown store
// In production, use Redis or DB
const cooldowns = {};
const COOLDOWN_SECONDS = 24 * 60 * 60; // 24h

// ====== CHECK COOLDOWN ======
app.post("/cooldown", (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Address required" });

  const nextClaim = cooldowns[address?.toLowerCase()] || 0;
  res.json({ nextClaim });
});

// ====== CLAIM ROUTE ======
app.post("/claim", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Address required" });

    const userAddr = address.toLowerCase();

    // --- Cooldown check
    const now = Math.floor(Date.now() / 1000);
    const nextClaim = cooldowns[userAddr] || 0;
    if (now < nextClaim) {
      return res.json({
        success: false,
        error: "Cooldown active. Try again later.",
        nextClaim,
      });
    }

    // --- Wallet safety checks
    const creationTxCount = await provider.getTransactionCount(userAddr, "earliest");
    const txCount = await provider.getTransactionCount(userAddr, "latest");

    if (creationTxCount === 0 && txCount < 3) {
      return res.json({
        success: false,
        error: "Wallet looks too new / inactive. Use a more established wallet.",
      });
    }

    // --- Send claim tx
    const tx = await contract.claim(userAddr, CLAIM_AMOUNT);
    await tx.wait();

    // --- Update cooldown
    cooldowns[userAddr] = now + COOLDOWN_SECONDS;

    res.json({
      success: true,
      txHash: tx.hash,
      nextClaim: cooldowns[userAddr],
    });
  } catch (err) {
    console.error("Claim error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Faucet backend running on port ${PORT}`);
});