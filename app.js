// ================= KONFIGURASI (sudah terisi, jangan diubah) =================
const SUPABASE_URL = "https://zmahdcrhemlkdumhyeiq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PWZsSbNt7MFuhmRUh3jGRA_hXTg737h";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Escape teks dari pengguna agar aman ditampilkan di HTML
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[c]);
}
function findOrder(id) {
  return myOrders.find(o => o.id === id) || allAdminOrders.find(o => o.id === id);
}
function makeUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ================= LABEL STATUS =================
const STATUS_LABELS = {
  pending: "Menunggu Konfirmasi",
  confirmed: "Dikonfirmasi",
  on_the_way: "Dalam Perjalanan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak"
};
const PAY_LABELS = {
  unpaid: "Menunggu Pembayaran",
  pending_verification: "Menunggu Verifikasi",
  verified: "Lunas",
  rejected: "Ditolak (Cek Alasan)"
};
const TRIP_LABELS = { one_way: "Sekali Jalan", round_trip: "Pulang-Pergi" };

function getStatusBadge(s) {
  switch (s) {
    case "pending": return "badge-warning";
    case "confirmed":
    case "on_the_way": return "badge-info";
    case "completed": return "badge-success";
    default: return "badge-danger";
  }
}
function getPayBadge(p) {
  return p === "verified" ? "badge-success" : (p === "pending_verification" ? "badge-info" : "badge-warning");
}

// ================= FORMAT TANGGAL =================
const DT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit"
});
function fmtPickup(iso) {
  try { return DT.format(new Date(iso)) + " WIB"; } catch { return iso; }
}
function fmtRp(n) { return "Rp" + Number(n || 0).toLocaleString("id-ID"); }

// ================= STATE GLOBAL =================
let currentUser = null;
let userProfile = null;
let isAdmin = false;
let currentSettings = {
  admin_whatsapp: "6285876026804",
  one_way_fare: 5000,
  round_trip_fare: 9000,
  qris_path: "",
  qris_active: false
};
let myOrders = [];
let allAdminOrders = [];
let currentPayingOrder = null;

// ================= INISIALISASI =================
document.addEventListener("DOMContentLoaded", async () => {
  await fetchSettings();
  initAuth();
});

async function fetchSettings() {
  const [setRes, fareRes] = await Promise.all([
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("fare_settings").select("*").eq("id", 1).maybeSingle()
  ]);
  if (setRes.data) {
    currentSettings.admin_whatsapp = setRes.data.admin_whatsapp || currentSettings.admin_whatsapp;
    currentSettings.qris_path = setRes.data.qris_path || "";
    currentSettings.qris_active = !!setRes.data.qris_active;
  }
  if (fareRes.data) {
    if (fareRes.data.one_way_fare) currentSettings.one_way_fare = Number(fareRes.data.one_way_fare);
    if (fareRes.data.round_trip_fare) currentSettings.round_trip_fare = Number(fareRes.data.round_trip_fare);
  }
  document.getElementById("displayBaseFare").innerText = fmtRp(currentSettings.one_way_fare);
  document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
}

// ================= AUTH =================
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await fetchProfile();
  } else {
    updateAuthUI(null);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await fetchProfile();
    } else {
      currentUser = null;
      userProfile = null;
      isAdmin = false;
      updateAuthUI(null);
    }
  });
}

async function fetchProfile() {
  if (!currentUser) return;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", currentUser.id)
  ]);
  userProfile = profile || null;
  isAdmin = !!(roles || []).some(r => r.role === "admin");
  updateAuthUI(userProfile);
}

function updateAuthUI(profile) {
  const authSec = document.getElementById("authSection");
  const adminBtn = document.getElementById("navAdminBtn");

  if (profile) {
    authSec.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:13px; font-weight:700;">Halo, ${esc((profile.full_name || "").split(" ")[0])}</span>
        <button class="btn btn-secondary btn-sm" onclick="handleLogout()">Keluar</button>
      </div>
    `;
    adminBtn.style.display = isAdmin ? "inline-block" : "none";
  } else {
    authSec.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="openModal('authModal')">Masuk / Daftar</button>`;
    adminBtn.style.display = "none";
  }
}

// ================= LOGIN / DAFTAR / KELUAR =================
function switchAuthMode(mode) {
  const loginF = document.getElementById("loginForm");
  const regF = document.getElementById("registerForm");
  const tabL = document.getElementById("tabLoginBtn");
  const tabR = document.getElementById("tabRegisterBtn");

  if (mode === "login") {
    loginF.classList.remove("hidden");
    regF.classList.add("hidden");
    tabL.classList.add("active");
    tabR.classList.remove("active");
  } else {
    loginF.classList.add("hidden");
    regF.classList.remove("hidden");
    tabR.classList.add("active");
    tabL.classList.remove("active");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    showToast("Login gagal: " + error.message);
  } else {
    showToast("Berhasil login!");
    closeModal("authModal");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;
  const fullName = document.getElementById("regName").value;
  let phone = document.getElementById("regPhone").value.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, whatsapp: phone }
    }
  });

  if (error) {
    showToast("Registrasi gagal: " + error.message);
  } else {
    showToast("Registrasi berhasil! Cek email untuk verifikasi, lalu login.");
    switchAuthMode("login");
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  showToast("Anda telah keluar.");
  showTab("home");
}

// ================= NAVIGASI TAB =================
function showTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(el => el.classList.remove("active"));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add("active");
  const navMap = { home: 0, booking: 1, history: 2, admin: 3 };
  const navBtns = document.querySelectorAll(".nav-link");
  if (navBtns[navMap[tabId]]) navBtns[navMap[tabId]].classList.add("active");

  if (tabId === "history") loadHistory();
  if (tabId === "admin") loadAdminDashboard();
}

function checkAuthAndGo(tabId) {
  if (!currentUser) {
    openModal("authModal");
    showToast("Silakan login akun mahasiswa terlebih dahulu.");
    return;
  }
  showTab(tabId);
}

// ================= PEMESANAN & TARIF =================
function calculateFarePreview() {
  const type = document.getElementById("tripType").value;
  const fare = type === "round_trip" ? currentSettings.round_trip_fare : currentSettings.one_way_fare;
  document.getElementById("calculatedFare").innerText = fmtRp(fare);
  return fare;
}

// Jeda minimal 15 menit dari sekarang, maksimal 60 hari ke depan
function validatePickupTime(iso) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  if (t < now + 15 * 60 * 1000) return "Waktu jemput minimal 15 menit dari sekarang.";
  if (t > now + 60 * 24 * 60 * 60 * 1000) return "Waktu jemput maksimal 60 hari ke depan.";
  return null;
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  if (!currentUser) {
    openModal("authModal");
    return;
  }

  const pickupLoc = document.getElementById("pickupLoc").value.trim();
  const destLoc = document.getElementById("destLoc").value.trim();
  const pickupDate = document.getElementById("pickupDate").value;
  const pickupTime = document.getElementById("pickupTime").value;
  const tripType = document.getElementById("tripType").value;
  const notes = document.getElementById("tripNotes").value.trim();

  if (!pickupDate || !pickupTime) {
    showToast("Isi tanggal dan waktu jemput dulu ya.");
    return;
  }
  // Waktu lokal Indonesia (WIB, UTC+7) dikonversi ke format internasional
  const pickupAt = new Date(`${pickupDate}T${pickupTime}:00+07:00`).toISOString();
  const timeErr = validatePickupTime(pickupAt);
  if (timeErr) {
    showToast(timeErr);
    return;
  }

  showToast("Membuat pesanan...");
  const { data, error } = await sb.rpc("create_booking", {
    p_pickup: pickupLoc,
    p_destination: destLoc,
    p_pickup_at: pickupAt,
    p_trip_type: tripType,
    p_notes: notes || null,
    p_request_id: makeUuid()
  });

  if (error) {
    showToast("Gagal membuat pesanan: " + errMsg(error));
  } else {
    showToast("Pesanan berhasil dibuat! Lanjut ke pembayaran.");
    document.getElementById("bookingForm").reset();
    document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
    openPaymentModal(data);
  }
}

// ================= PEMBAYARAN QRIS & BUKTI =================
async function openPaymentModal(order) {
  currentPayingOrder = order;
  document.getElementById("payOrderCode").innerText = `#${order.code}`;
  document.getElementById("payAmount").innerText = fmtRp(order.fare);

  const img = document.getElementById("qrisModalImage");
  if (currentSettings.qris_active && currentSettings.qris_path) {
    const { data } = await sb.storage.from("qris").createSignedUrl(currentSettings.qris_path, 3600);
    if (data?.signedUrl) {
      img.src = data.signedUrl;
    } else {
      img.src = "qris.jpg";
    }
  } else {
    img.src = "qris.jpg";
  }

  const waBtn = document.getElementById("btnWaPayment");
  waBtn.onclick = () => sendOrderWhatsapp(order);

  openModal("paymentModal");
}

async function uploadProof() {
  const fileInput = document.getElementById("proofFileInput");
  if (!fileInput.files.length) {
    showToast("Pilih file bukti pembayaran terlebih dahulu.");
    return;
  }
  if (!currentPayingOrder) return;

  const file = fileInput.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast("Ukuran file maksimal 5 MB.");
    return;
  }
  // Buka tab WhatsApp sekarang (sebelum proses async) agar tidak diblokir popup blocker
  const waWin = window.open("", "_blank");
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${currentUser.id}/${currentPayingOrder.id}-${Date.now()}.${fileExt}`;

  showToast("Mengunggah bukti transfer...");
  const { error: uploadErr } = await sb.storage
    .from("payment-proofs")
    .upload(fileName, file, { upsert: false });

  if (uploadErr) {
    if (waWin) waWin.close();
    showToast("Gagal upload gambar: " + errMsg(uploadErr));
    return;
  }

  const { error: rpcErr } = await sb.rpc("submit_payment_proof", {
    p_booking_id: currentPayingOrder.id,
    p_path: fileName
  });

  if (rpcErr) {
    if (waWin) waWin.close();
    showToast("Gagal menyimpan bukti: " + errMsg(rpcErr));
  } else {
    showToast("Bukti pembayaran terkirim! Membuka WhatsApp admin...");
    const waLink = adminWaUrl(currentPayingOrder, "pending_verification", "Bukti transfer sudah saya unggah di website. Mohon diverifikasi.");
    if (waWin) waWin.location.href = waLink; else window.open(waLink, "_blank");
    fileInput.value = "";
    closeModal("paymentModal");
    showTab("history");
  }
}

async function viewProof(path) {
  const { data, error } = await sb.storage.from("payment-proofs").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    showToast("Gagal membuka bukti: " + errMsg(error));
    return;
  }
  window.open(data.signedUrl, "_blank");
}

// ================= PESAN WHATSAPP =================
function normalizeWa(num) {
  let phone = String(num || "").replace(/\D/g, "");
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);
  return phone;
}

function buildOrderWaText(order, payStatusOverride, extra) {
  const name = userProfile?.full_name || order.profiles?.full_name || "Mahasiswa USH";
  const pay = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const payLabel = PAY_LABELS[payStatusOverride || pay?.status] || PAY_LABELS.unpaid;
  return `Halo Admin GOSH USH, saya ingin konfirmasi pesanan:\n\n` +
    `*ID Pesanan:* #${order.code}\n` +
    `*Nama:* ${name}\n` +
    `*Rute:* ${order.pickup_location} ➔ ${order.destination} (${TRIP_LABELS[order.trip_type] || order.trip_type})\n` +
    `*Jadwal:* ${fmtPickup(order.pickup_at)}\n` +
    `*Tarif:* ${fmtRp(order.fare)}\n` +
    `*Status Pembayaran:* ${payLabel}\n` +
    (extra ? `\n${extra}\n` : "") +
    `\nMohon segera diproses ya kak. Terima kasih!`;
}
function adminWaUrl(order, payStatusOverride, extra) {
  const phone = normalizeWa(currentSettings.admin_whatsapp || "6285876026804");
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildOrderWaText(order, payStatusOverride, extra))}`;
}
function sendOrderWhatsapp(order) {
  window.open(adminWaUrl(order), "_blank");
}
// Admin -> chat ke mahasiswa pemesan
function sendWaToStudent(order) {
  const phone = normalizeWa(order.profiles?.whatsapp);
  if (!phone) { showToast("Nomor WhatsApp mahasiswa tidak tersedia."); return; }
  const pay = one(order.payments) || {};
  const text = `Halo ${order.profiles?.full_name || "kak"}, ini Admin GOSH USH.\n\n` +
    `Pesanan *#${order.code}* (${order.pickup_location} ➔ ${order.destination})\n` +
    `Status pembayaran: ${PAY_LABELS[pay.status] || "-"}\n` +
    `Status perjalanan: ${STATUS_LABELS[order.status] || order.status}\n\nTerima kasih!`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
}

// ================= RIWAYAT =================
async function loadHistory() {
  if (!currentUser) return;
  const listEl = document.getElementById("ordersList");
  listEl.innerHTML = "<p>Mengambil riwayat transaksi...</p>";

  const { data, error } = await sb
    .from("bookings")
    .select("*, payments(*), reviews(*)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p>Gagal memuat: ${errMsg(error)}</p>`;
    return;
  }

  myOrders = data || [];
  renderOrderList(myOrders);
}

function one(arr) { return Array.isArray(arr) ? arr[0] : arr; }

function renderOrderList(orders) {
  const listEl = document.getElementById("ordersList");
  if (!orders.length) {
    listEl.innerHTML = `<div class="empty-state">Belum ada riwayat pesanan tebengan.</div>`;
    return;
  }

  listEl.innerHTML = orders.map(ord => {
    const pay = one(ord.payments) || {};
    const rev = one(ord.reviews);
    const payLabel = PAY_LABELS[pay.status] || PAY_LABELS.unpaid;
    const canPay = pay.status === "unpaid" || pay.status === "rejected";
    const canCancel = ord.status === "pending" && (pay.status === "unpaid" || !pay.status);
    const canReview = ord.status === "completed" && !rev;
    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <strong>#${esc(ord.code)}</strong>
            <div style="font-size:12px; color:var(--text-secondary);">${fmtPickup(ord.pickup_at)}</div>
          </div>
          <div>
            <span class="badge ${getStatusBadge(ord.status)}">${STATUS_LABELS[ord.status] || ord.status}</span>
          </div>
        </div>
        <div style="font-size:14px; margin-bottom:10px;">
          <strong>Rute:</strong> ${esc(ord.pickup_location)} ➔ ${esc(ord.destination)} (${TRIP_LABELS[ord.trip_type] || ord.trip_type})<br/>
          <strong>Total Tarif:</strong> ${fmtRp(ord.fare)}
          <span class="badge ${getPayBadge(pay.status)}">${payLabel}</span>
          ${pay.rejection_reason ? `<br/><span style="color:#b91c1c; font-size:12px;">Alasan ditolak: ${esc(pay.rejection_reason)}</span>` : ""}
          ${ord.notes ? `<br/><span style="font-size:12px; color:var(--text-secondary);">Catatan: ${esc(ord.notes)}</span>` : ""}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${canPay ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(findOrder('${ord.id}'))">Bayar QRIS</button>` : ""}
          ${pay.proof_path ? `<button class="btn btn-secondary btn-sm" onclick="viewProof('${esc(pay.proof_path)}')">Lihat Bukti Transfer</button>` : ""}
          <button class="btn btn-secondary btn-sm" onclick="sendOrderWhatsapp(findOrder('${ord.id}'))">Chat Admin WA</button>
          ${canCancel ? `<button class="btn btn-secondary btn-sm" onclick="cancelOrder('${ord.id}')">Batalkan</button>` : ""}
          ${canReview ? `<button class="btn btn-primary btn-sm" onclick="openReviewModal('${ord.id}')">Beri Ulasan</button>` : ""}
          ${rev ? `<button class="btn btn-secondary btn-sm" onclick="openReviewModal('${ord.id}')">Edit Ulasan</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function filterOrders() {
  const search = document.getElementById("searchOrderInput").value.toLowerCase();
  const status = document.getElementById("statusFilter").value;

  const filtered = myOrders.filter(o => {
    const matchCode = o.code.toLowerCase().includes(search);
    const matchStatus = status ? o.status === status : true;
    return matchCode && matchStatus;
  });

  renderOrderList(filtered);
}

async function cancelOrder(orderId) {
  if (!confirm("Batalkan pesanan ini?")) return;
  const { error } = await sb.rpc("cancel_my_booking", { p_booking_id: orderId });
  if (error) {
    showToast("Gagal membatalkan: " + errMsg(error));
  } else {
    showToast("Pesanan dibatalkan.");
    loadHistory();
  }
}

// ================= ULASAN & RATING =================
function openReviewModal(orderId) {
  document.getElementById("reviewOrderId").value = orderId;
  const ord = findOrder(orderId);
  const rev = ord ? one(ord.reviews) : null;
  if (rev) {
    document.getElementById("reviewRating").value = String(rev.rating);
    document.getElementById("reviewComment").value = rev.comment || "";
  } else {
    document.getElementById("reviewRating").value = "5";
    document.getElementById("reviewComment").value = "";
  }
  openModal("reviewModal");
}

async function submitReview() {
  const orderId = document.getElementById("reviewOrderId").value;
  const rating = Number(document.getElementById("reviewRating").value);
  const comment = document.getElementById("reviewComment").value.trim();

  const ord = findOrder(orderId);
  const rev = ord ? one(ord.reviews) : null;

  let error;
  if (rev) {
    ({ error } = await sb.from("reviews")
      .update({ rating, comment: comment || null })
      .eq("booking_id", orderId)
      .eq("user_id", currentUser.id));
  } else {
    ({ error } = await sb.from("reviews").insert([
      { booking_id: orderId, user_id: currentUser.id, rating, comment: comment || null }
    ]));
  }

  if (error) {
    showToast("Gagal menyimpan ulasan: " + errMsg(error));
  } else {
    showToast("Terima kasih atas ulasan Anda!");
    closeModal("reviewModal");
    loadHistory();
  }
}

// ================= PANEL ADMIN =================
async function loadAdminDashboard() {
  if (!isAdmin) {
    showToast("Halaman ini khusus admin.");
    showTab("home");
    return;
  }

  // Muat pengaturan ke form
  document.getElementById("settingAdminWa").value = currentSettings.admin_whatsapp || "";
  document.getElementById("settingBaseFare").value = currentSettings.one_way_fare;
  document.getElementById("settingRoundFare").value = currentSettings.round_trip_fare;

  // Muat semua pesanan
  const tableEl = document.getElementById("adminOrdersTable");
  const { data: orders, error } = await sb
    .from("bookings")
    .select("*, payments(*), reviews(*), profiles(full_name, whatsapp)")
    .order("created_at", { ascending: false });

  if (!error && orders) {
    allAdminOrders = orders;
    renderAdminTable(orders);
  } else if (error) {
    tableEl.innerHTML = `<p>Gagal memuat pesanan: ${errMsg(error)}</p>`;
  }

  // Muat ulasan
  const reviewsEl = document.getElementById("adminReviewsList");
  const { data: revs } = await sb
    .from("reviews")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });

  if (revs && revs.length) {
    reviewsEl.innerHTML = revs.map(r => `
      <div class="card" style="margin-bottom:8px;">
        <strong>${esc(r.profiles?.full_name || "Mhs")}</strong> — ${"⭐".repeat(r.rating)}
        <p style="font-size:13px; color:var(--text-secondary);">${esc(r.comment || "Tidak ada komentar.")}</p>
      </div>
    `).join("");
  } else {
    reviewsEl.innerHTML = "<p>Belum ada ulasan yang masuk.</p>";
  }
}

function renderAdminTable(orders) {
  const tableEl = document.getElementById("adminOrdersTable");
  const verifiedTotal = orders.reduce((a, o) => a + ((one(o.payments) || {}).status === "verified" ? Number(o.fare) : 0), 0);
  const waitingCount = orders.filter(o => (one(o.payments) || {}).status === "pending_verification").length;
  const summary = `<div class="fare-box" style="margin-bottom:12px; gap:16px; flex-wrap:wrap;">
      <span>Total pesanan: <strong>${orders.length}</strong></span>
      <span>Menunggu verifikasi: <strong>${waitingCount}</strong></span>
      <span>Pemasukan lunas: <strong>${fmtRp(verifiedTotal)}</strong></span>
    </div>`;
  tableEl.innerHTML = summary + `
    <table>
      <thead>
        <tr>
          <th>ID Pesanan</th>
          <th>Mahasiswa</th>
          <th>Rute & Jadwal</th>
          <th>Tarif</th>
          <th>Bukti Bayar</th>
          <th>Status Bayar</th>
          <th>Status Perjalanan</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => {
          const pay = one(o.payments) || {};
          return `
          <tr>
            <td><strong>#${esc(o.code)}</strong></td>
            <td>${esc(o.profiles?.full_name || "-")}<br><span style="font-size:11px;color:var(--text-secondary);">${esc(o.profiles?.whatsapp || "-")}</span></td>
            <td>${esc(o.pickup_location)} ➔ ${esc(o.destination)}<br><span style="font-size:11px;color:var(--text-secondary);">${fmtPickup(o.pickup_at)}</span></td>
            <td>${fmtRp(o.fare)}</td>
            <td>${pay.proof_path ? `<button class="btn btn-secondary btn-sm" onclick="viewProof('${esc(pay.proof_path)}')">Lihat Bukti</button>` : '<span style="color:#aaa;">Belum ada</span>'}</td>
            <td>
              <span class="badge ${getPayBadge(pay.status)}">${PAY_LABELS[pay.status] || "-"}</span>
              ${pay.status === "pending_verification" ? `
                <div style="margin-top:6px; display:flex; gap:6px;">
                  <button class="btn btn-primary btn-sm" onclick="verifyPayment('${o.id}', true)">Setujui</button>
                  <button class="btn btn-secondary btn-sm" onclick="verifyPayment('${o.id}', false)">Tolak</button>
                </div>` : ""}
              ${pay.rejection_reason ? `<div style="font-size:11px; color:#b91c1c; margin-top:4px;">${esc(pay.rejection_reason)}</div>` : ""}
            </td>
            <td>
              <select onchange="updateTripStatus('${o.id}', this.value)">
                ${Object.keys(STATUS_LABELS).map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
              </select>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="sendWaToStudent(findOrder('${o.id}'))">WA Mhs</button>
            </td>
          </tr>
        `; }).join("")}
      </tbody>
    </table>
  `;
}

async function verifyPayment(orderId, approve) {
  let reason = null;
  if (!approve) {
    reason = prompt("Tuliskan alasan penolakan (minimal 3 huruf):");
    if (!reason || reason.trim().length < 3) {
      showToast("Alasan penolakan minimal 3 huruf.");
      return;
    }
  }
  const { error } = await sb.rpc("admin_verify_payment", {
    p_booking_id: orderId,
    p_approve: approve,
    p_reason: reason
  });
  if (error) {
    showToast("Gagal: " + errMsg(error));
  } else {
    showToast(approve ? "Pembayaran disetujui." : "Pembayaran ditolak.");
    loadAdminDashboard();
  }
}

async function updateTripStatus(orderId, newStatus) {
  const { error } = await sb.rpc("admin_update_booking_status", {
    p_booking_id: orderId,
    p_status: newStatus,
    p_note: null
  });
  if (error) {
    showToast("Gagal: " + errMsg(error));
    loadAdminDashboard();
  } else {
    showToast("Status perjalanan diperbarui.");
    loadAdminDashboard();
  }
}

async function saveAdminSettings() {
  const admin_whatsapp = document.getElementById("settingAdminWa").value.trim();
  const one_way_fare = Number(document.getElementById("settingBaseFare").value);
  const round_trip_fare = Number(document.getElementById("settingRoundFare").value);
  const qrisFileInput = document.getElementById("settingQrisFile");

  if (!admin_whatsapp) { showToast("Nomor WhatsApp admin wajib diisi."); return; }
  if (!one_way_fare || one_way_fare < 0 || !round_trip_fare || round_trip_fare < 0) {
    showToast("Tarif harus berupa angka yang valid.");
    return;
  }

  let qris_path = currentSettings.qris_path;

  if (qrisFileInput.files.length) {
    const file = qrisFileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast("Ukuran gambar QRIS maksimal 5 MB.");
      return;
    }
    const fileName = `qris_dana_${Date.now()}.${(file.name.split(".").pop() || "png").toLowerCase()}`;
    const { error } = await sb.storage.from("qris").upload(fileName, file, { upsert: false });
    if (error) {
      showToast("Gagal upload QRIS: " + errMsg(error));
      return;
    }
    qris_path = fileName;
  }

  const [setRes, fareRes] = await Promise.all([
    sb.from("app_settings").update({
      admin_whatsapp,
      qris_path,
      qris_active: qris_path ? true : currentSettings.qris_active
    }).eq("id", 1),
    sb.from("fare_settings").update({
      one_way_fare,
      round_trip_fare
    }).eq("id", 1)
  ]);

  if (setRes.error || fareRes.error) {
    showToast("Gagal menyimpan: " + errMsg(setRes.error || fareRes.error));
  } else {
    showToast("Pengaturan admin berhasil disimpan!");
    await fetchSettings();
  }
}

// ================= HELPER =================
function errMsg(err) {
  return err?.message || "terjadi kesalahan";
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add("open");
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("open");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3500);
}
