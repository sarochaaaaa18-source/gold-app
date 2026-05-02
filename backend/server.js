const axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require("cors");
app.use(cors({
  origin: "*"
}));
const path = require("path");

// ===== SERVE FRONTEND =====
app.use(express.static(path.join(__dirname, "../frontend")));

const SECRET = process.env.JWT_SECRET;
let goldPriceData = {
  buy: 0,
  sell: 0
};

// ===== CONNECT DB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// ===== SCHEMA =====
const transactionSchema = new mongoose.Schema({
  type: String,
  amount: Number,
  date: String,
  to: String,    
  from: String   
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  balance: Number,

  goldBalance: {
    type: Number,
    default: 0
  },

  avgBuyPrice: { type: Number, default: 0 },

  goalGold: { type: Number, default: 0 },

  transactions: [transactionSchema]
});

const User = mongoose.model("User", userSchema);

// ===== AUTH MIDDLEWARE =====
function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  console.log("AUTH HEADER:", authHeader); // 🔥 debug

  if (!authHeader) {
    return res.status(401).json({ message: "No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log("TOKEN ERROR:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("REGISTER:", email);

    const exist = await User.findOne({ email });

    if (exist) {
      console.log("USER EXISTS");
      return res.json({ success: false, message: "User exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      password: hashedPassword,
      balance: 1000,
      transactions: []
    });

    await newUser.save();

    console.log("REGISTER SUCCESS");

    res.json({ success: true });

  } catch (err) {
    console.log("REGISTER ERROR:", err.message);
    res.json({ success: false, error: err.message });
  }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("LOGIN INPUT:", email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ success: true, token });

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ===== GET USER =====
app.get("/me", auth, async (req, res) => {
  const user = await User.findOne({ email: req.user.email });

  if (!user) return res.json({ success: false });

  res.json({
    success: true,
    user: {
      email: user.email,
      balance: user.balance,
      goldBalance: user.goldBalance || 0,
      avgBuyPrice: user.avgBuyPrice || 0,
      goalGold: user.goalGold || 0,
      transactions: user.transactions || []
    }
  });
});

// ===== DEPOSIT =====
app.post("/deposit", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findOne({ email: req.user.email });

    user.balance += numAmount;

    user.transactions.push({
      type: "deposit",
      amount: numAmount,
      date: new Date().toLocaleString()
    });

    await user.save();

    res.json({ success: true, user });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===== WITHDRAW =====
app.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findOne({ email: req.user.email });

    if (user.balance < numAmount) {
      return res.json({ success: false, message: "Not enough money" });
    }

    user.balance -= numAmount;

    user.transactions.push({
      type: "withdraw",
      amount: numAmount,
      date: new Date().toLocaleString()
    });

    await user.save();

    res.json({ success: true, user });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===== TRANSFER =====
app.post("/transfer", auth, async (req, res) => {
  try {
    const { toEmail, amount } = req.body;
    const fromEmail = req.user.email;

    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const sender = await User.findOne({ email: fromEmail });
    const receiver = await User.findOne({ email: toEmail });

    if (!receiver) {
      return res.json({ success: false, message: "Receiver not found" });
    }

    if (sender.balance < numAmount) {
      return res.json({ success: false, message: "Not enough money" });
    }

    //  หักเงิน
    sender.balance -= numAmount;

    //  เพิ่มเงิน
    receiver.balance += numAmount;

    //  log sender
    sender.transactions.push({
      type: "transfer_out",
      amount: numAmount,
      to: toEmail,
      date: new Date().toLocaleString()
    });

    //  log receiver
    receiver.transactions.push({
      type: "transfer_in",
      amount: numAmount,
      from: fromEmail,
      date: new Date().toLocaleString()
    });

    await sender.save();
    await receiver.save();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===== SET GOAL =====
app.post("/set-goal", auth, async (req, res) => {
  try {
    const goal = Number(req.body.goal);

    if (isNaN(goal) || goal <= 0) {
      return res.json({ success: false, message: "Invalid goal" });
    }

    const user = await User.findOne({ email: req.user.email });

    user.goalGold = goal;

    await user.save();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===== SERVE FRONTEND =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ===== GOLD PRICE =====
app.get("/gold-price", (req, res) => {
  res.json(goldPriceData);
});

setInterval(updateGoldPrice, 10000);

// โหลดครั้งแรก
updateGoldPrice();

// ===== UPDATE GOLD PRICE FROM API =====
async function updateGoldPrice() {
  try {
    const res = await axios.get("https://api.gold-api.com/price/XAU");

    const usd = res.data.price;

    // แปลงเป็นบาท (ประมาณ)
    const thb = usd * 36;

    goldPriceData.buy = Math.floor(thb);
    goldPriceData.sell = Math.floor(thb + 200);

    console.log("🔥 Gold updated:", goldPriceData);

  } catch (err) {
    console.log("❌ GOLD API ERROR:", err.message);
  }
}

// ===== BUY GOLD =====
app.post("/buy-gold", auth, async (req, res) => {
  try {
    const num = Number(req.body.amount);

    if (req.body.amount === undefined) {
      return res.json({ success: false, message: "Missing amount" });
    }

    if (!goldPriceData.buy || !goldPriceData.sell) {
      return res.json({ success: false, message: "Gold price not ready" });
    }

    if (isNaN(num) || num <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findOne({ email: req.user.email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.balance < num) {
      return res.json({ success: false, message: "Not enough money" });
    }

    const price = goldPriceData.buy;
    const goldAmount = num / price;

    // คำนวณต้นทุนเฉลี่ยใหม่
    const totalGold = (user.goldBalance || 0) + goldAmount;

    user.avgBuyPrice =
      ((user.avgBuyPrice * (user.goldBalance || 0)) + num) / totalGold;

    user.goldBalance = totalGold;
    user.balance -= num;

    user.transactions.push({
      type: "buy_gold",
      amount: num,
      date: new Date().toLocaleString()
    });

    await user.save();

    res.json({ success: true, user });

  } catch (err) {
    console.log("BUY ERROR:", err);
    res.json({ success: false, message: err.message });
  }
});

// ===== SELL GOLD =====
app.post("/sell-gold", auth, async (req, res) => {
  try {
    const num = Number(req.body.gold);

    if (req.body.gold === undefined) {
      return res.json({ success: false, message: "Missing gold" });
    }

    if (!goldPriceData.sell || !goldPriceData.buy) {
      return res.json({ success: false, message: "Gold price not ready" });
    }

    if (isNaN(num) || num <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findOne({ email: req.user.email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if ((user.goldBalance || 0) < num) {
      return res.json({ success: false, message: "Not enough gold" });
    }

    const price = goldPriceData.sell;
    const money = num * price;

    user.goldBalance -= num;
    user.balance += money;

    user.transactions.push({
      type: "sell_gold",
      amount: money,
      date: new Date().toLocaleString()
    });

    await user.save();

    res.json({ success: true, user });

  } catch (err) {
    console.log("SELL ERROR:", err);
    res.json({ success: false, message: err.message });
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

app.get("/reset", async (req, res) => {
  await User.deleteMany({});
  res.send("DB reset success");
});
