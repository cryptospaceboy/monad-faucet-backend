import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== ENV CONFIG ======
const PORT = process.env.PORT || 4000;
const PROVIDER_URL = process.env.PROVIDER_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// ====== ETHERS SETUP ======
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// faucet contract ABI (from your contract)
const abi = [
  "function claim(address _to) public",
  "function claimAmount() view returns (uint256)",
  "function cooldown() view returns (uint256)",
  "function getBalance() view returns (uint256)",
  "function lastClaimed(address) view returns (uint256)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

// ====== ROUTES ======

// ✅ Check cooldown
app.post("/cooldown", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Address required" });

  try {
    const nextClaim = await contract.lastClaimed(address);
    const cooldown = await contract.cooldown();

    const nextTime = Number(nextClaim) + Number(cooldown);
    res.json({ nextClaim: nextTime });
  } catch (err) {
    console.error("Cooldown check error:", err.message);
    res.status(500).json({ error: "Cooldown check failed" });
  }
});

// ✅ Claim faucet
app.post("/claim", async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: "No address provided" });
  }

  console.log(`➡️ Claim requested for: ${address}`);

  try {
    // 🔹 Wallet activity check (must have 10+ txs)
    const txCount = await provider.getTransactionCount(address, "latest");
    if (txCount < 10) {
      console.log(`❌ Rejected | ${address} has only ${txCount} txs`);
      return res.json({
        success: false,
        error: "Wallet must have at least 10 transactions."
      });
    }

    // 🔹 Send claim tx
    const tx = await contract.claim(address);
    await tx.wait();

    console.log(`✅ Claim successful | Tx: ${tx.hash}`);
    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    if (error.reason?.includes("Cooldown")) {
      console.log(`⏳ Cooldown active for: ${address}`);
      return res.json({ success: false, error: "Cooldown active" });
    }

    console.log(`❌ Claim failed for ${address}: ${error.reason || error.message}`);
    res.json({ success: false, error: error.reason || "Transaction failed" });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Faucet backend running on port ${PORT}`);
});