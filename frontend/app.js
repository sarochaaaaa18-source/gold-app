const API = window.location.origin;

let chart;
let priceHistory = [];
let alertPrice = null;

// ===== TOAST =====
function showToast(msg, type="success") {
  const t = document.getElementById("toast");
  if (!t) return;

  t.textContent = msg;
  t.className = "toast show " + type;

  setTimeout(() => t.className = "toast", 2000);
}

// ===== TOKEN =====
function getToken() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "index.html";
  }
  return token;
}

// ===== SET ALERT =====
function setAlert() {
  const val = document.getElementById("alertInput").value;

  alertPrice = Number(val);

  showToast("ตั้ง alert แล้ว");
}

// ===== API CALL =====
async function api(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getToken()
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    return { success: false, message: "Server error" };
  }

  return res.json();
}

// ===== LOAD USER =====
async function loadUser() {
  const data = await api("/me");

  if (!data.success) {
    logout();
    return;
  }

  const user = data.user;

  // ===== GOAL PROGRESS =====
  if (user.goalGold && user.goalGold > 0) {
    const percent = ((user.goldBalance / user.goalGold) * 100).toFixed(2);

    const el = document.getElementById("goalProgress");
    if (el) {
      el.textContent = percent + "%";
    }
  }


  console.log("USER:", user);

  updatePortfolio(user);

  const welcome = document.getElementById("welcome");
  const balance = document.getElementById("balance");
  const cash = document.getElementById("cash");

  if (cash) cash.textContent = user.balance.toLocaleString();
  if (balance) balance.textContent = user.balance.toLocaleString();

  if (welcome) {
    welcome.innerHTML = "👋 Welcome<br>" + user.email;
  }

  // ✅ gold balance
  const goldEl = document.getElementById("gold");
  if (goldEl) {
    goldEl.textContent = (user.goldBalance || 0).toFixed(5);
  }

  loadTransactions(user.transactions || []);
}

// ===== UPDATE PORTFOLIO =====
async function updatePortfolio(user) {
  const currentPrice = price.sell;
  const avg = user.avgBuyPrice || 0;

  const pnl = currentPrice - avg;
  const pnlPercent = avg > 0 ? ((pnl / avg) * 100).toFixed(2) : 0;

  document.getElementById("pnl").textContent = pnlPercent + "%";
}

// ===== GOLD PRICE =====
async function loadGoldPrice() {
  const res = await fetch("https://gold-app-f1ev.onrender.com/gold-price");
  const data = await res.json();

  document.getElementById("goldBuy").textContent = data.buy;
  document.getElementById("goldSell").textContent = data.sell;

  // ===== ALERT CHECK =====
  if (alertPrice && data.sell >= alertPrice) {
    showToast("🚀 ราคาถึงแล้ว!");
    alertPrice = null;
  }

  updateChart(data.sell);
}

// ===== HISTORY =====
function loadTransactions(transactions = []) {
  const list = document.getElementById("history");
  if (!list) return;

  list.innerHTML = "";

  transactions.slice().reverse().forEach(t => {
    const li = document.createElement("li");

    if (t.type === "deposit") {
      li.style.color = "green";
      li.textContent = "+ " + t.amount.toLocaleString() + " บาท";

    } else if (t.type === "withdraw") {
      li.style.color = "red";
      li.textContent = "- " + t.amount.toLocaleString() + " บาท";

    } else if (t.type === "transfer_out") {
      li.style.color = "orange";
      li.textContent = "→ " + t.amount + " ไป " + t.to;

    } else if (t.type === "transfer_in") {
      li.style.color = "blue";
      li.textContent = "← " + t.amount + " จาก " + t.from;

    } else if (t.type === "buy_gold") {
      li.style.color = "purple";
      li.textContent = "🟡 ซื้อทอง " + t.amount;

    } else if (t.type === "sell_gold") {
      li.style.color = "brown";
      li.textContent = "💰 ขายทอง " + t.amount;
    }

    li.textContent += " (" + t.date + ")";
    list.appendChild(li);
  });
}

// ===== DEPOSIT =====
async function deposit() {
  const el = document.getElementById("depositAmount");
  const amount = el.value;

  if (!amount || Number(amount) <= 0) {
    return alert("Invalid amount");
  }

  const data = await api("/deposit", "POST", { amount });

  if (!data.success) return alert(data.message);

  showToast("Deposit success");
  el.value = "";
  loadUser();
}

// ===== WITHDRAW =====
async function withdraw() {
  const el = document.getElementById("withdrawAmount");
  const amount = el.value;

  if (!amount || Number(amount) <= 0) {
    return alert("Invalid amount");
  }

  const data = await api("/withdraw", "POST", { amount });

  if (!data.success) return alert(data.message);

  showToast("Withdraw success");
  el.value = "";
  loadUser();
}

// ===== TRANSFER =====
async function transfer() {
  const to = document.getElementById("toEmail");
  const amt = document.getElementById("transferAmount");

  if (!amt.value || Number(amt.value) <= 0) {
    return alert("Invalid amount");
  }

  const data = await api("/transfer", "POST", {
    toEmail: to.value,
    amount: amt.value
  });

  if (!data.success) return alert(data.message);

  showToast("Transfer success");

  to.value = "";
  amt.value = "";
  loadUser();
}

// ===== BUY GOLD =====
async function buyGold() {
  const el = document.getElementById("buyAmount");
  const amount = Number(el.value);

  if (!amount || amount <= 0) {
    return alert("Invalid amount");
  }

  const data = await api("https://gold-app-f1ev.onrender.com/buy-gold", "POST", { amount });

  if (!data.success) return alert(data.message);

  showToast("ซื้อทองสำเร็จ");
  el.value = "";
  loadUser();
}

// ===== SELL GOLD =====
async function sellGold() {
  const el = document.getElementById("sellAmount");
  const gold = Number(el.value);

  if (!gold || gold <= 0) {
    return alert("Invalid gold");
  }

  const data = await api("https://gold-app-f1ev.onrender.com/sell-gold", "POST", { gold });

  if (!data.success) return alert(data.message);

  showToast("ขายทองสำเร็จ");
  el.value = "";
  loadUser();
}

// ===== LOGOUT =====
function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

// ===== LOAD PAGE =====
if (window.location.pathname.includes("dashboard.html")) {
  if (!localStorage.getItem("token")) {
    window.location.href = "index.html";
  } else {
    loadUser();
    loadGoldPrice();
    setInterval(loadGoldPrice, 10000);
  }
}

// ===== UPDATE CHART =====
function updateChart(price) {
  priceHistory.push(price);

  if (priceHistory.length > 20) {
    priceHistory.shift();
  }

  const ctx = document.getElementById("goldChart");
  if (!ctx) return;

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: priceHistory.map((_, i) => i),
      datasets: [{
        label: "Gold Price",
        data: priceHistory,
        borderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true
    }
  });
}

// ===== REGISTER =====
const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("https://gold-app-f1ev.onrender.com/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      console.log("REGISTER RESPONSE:", data);

      if (!data.success) {
        alert(data.message || "Register failed");
        return;
      }

      showToast("Register success 🎉");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);

    } catch (err) {
      console.error("REGISTER ERROR:", err);
      alert("Server error");
    }
  });
}

// ===== LOGIN =====
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("https://gold-app-f1ev.onrender.com/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      console.log("LOGIN RESPONSE:", data);

      if (!data.success) {
        alert("Email หรือ Password ไม่ถูกต้อง");
        return;
      }

      // ✅ เก็บ token
      localStorage.setItem("token", data.token);

      showToast("Login success 🎉");

      // ✅ ไป dashboard
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);

    } catch (err) {
      console.error("LOGIN ERROR:", err);
      alert("Server error");
    }
  });
}

// ===== SET GOAL =====
async function setGoal() {
  const goal = document.getElementById("goalInput").value;

  if (!goal || Number(goal) <= 0) {
    return alert("Invalid goal");
  }

  const res = await api("https://gold-app-f1ev.onrender.com/set-goal", "POST", { goal });

  if (!res.success) {
    return alert(res.message);
  }

  showToast("ตั้งเป้าสำเร็จ");
  loadUser();
}