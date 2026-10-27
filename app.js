// ================= KONFIGURASI SUPABASE ANDA =================
// Isi dari Supabase Dashboard > Project Settings > API:
//   Project URL  -> SUPABASE_URL
//   anon / publishable key -> SUPABASE_ANON_KEY  (JANGAN pakai service_role)
const SUPABASE_URL = "https://GANTI-PROJECT-ID.supabase.co";
const SUPABASE_ANON_KEY = "GANTI_DENGAN_ANON_ATAU_PUBLISHABLE_KEY";
const CONFIG_BELUM_DIISI = SUPABASE_URL.includes("GANTI") || SUPABASE_ANON_KEY.includes("GANTI");
const STORAGE_KEY = "gosh-demo-state-v1";
const DEMO_ROUTE_POINTS = [
  "Kost Melati",
  "Kost Mawar",
  "Gerbang Barat USH",
  "Masjid USH",
  "Perpustakaan Utama",
  "Terminal Kampus"
];
const DEMO_USER = {
  id: "demo-user-1",
  email: "demo@mhs.ush.id",
  user_metadata: { full_name: "Demo Mahasiswa", whatsapp: "6281234567890" }
};

const sb = typeof window !== "undefined" && window.supabase && !CONFIG_BELUM_DIISI
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function isDemoMode() {
  return !sb || CONFIG_BELUM_DIISI;
}

function safeParseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadDemoState() {
  const state = safeParseJSON(localStorage.getItem(STORAGE_KEY), null) || {
    settings: {
      admin_whatsapp: "6285876026804",
      one_way_fare: 5000,
      round_trip_fare: 9000,
      qris_path: "qris.jpg",
      qris_active: true
    },
    orders: []
  };

  if (!state.settings) state.settings = {};
  if (!state.orders) state.orders = [];

  currentSettings = {
    ...currentSettings,
    ...state.settings
  };

  return state;
}

function saveDemoState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function populateRouteSelects() {
  const pickupSelect = document.getElementById("pickupPoint");
  const destSelect = document.getElementById("destPoint");
  if (!pickupSelect || !destSelect) return;

  const createOptions = () => [
    '<option value="">— Pilih titik —</option>',
    ...pickupPoints.filter(point => point.is_active).map(point =>
      `<option value="${esc(point.name)}">${esc(point.name)} (${esc(point.zone)})</option>`
    )
  ].join("");

  pickupSelect.innerHTML = createOptions();
  destSelect.innerHTML = createOptions();
}

async function loadPickupPoints() {
  const [pointsRes, faresRes] = await Promise.all([
    sb.from("pickup_points").select("id, name, zone, is_active").eq("is_active", true).order("name"),
    sb.from("zone_fares").select("id, origin_zone, destination_zone, one_way_fare, round_trip_fare")
  ]);

  if (pointsRes.error) {
    showToast("Gagal memuat titik jemput: " + errMsg(pointsRes.error));
  } else {
    pickupPoints = pointsRes.data || [];
  }

  if (faresRes.error) {
    showToast("Gagal memuat tarif zona: " + errMsg(faresRes.error));
  } else {
    zoneFares = faresRes.data || [];
  }

  populateRouteSelects();
}

function ensureDemoUser() {
  const state = loadDemoState();
  const savedUser = safeParseJSON(localStorage.getItem("gosh-demo-user"), null);

  if (savedUser?.id) {
    currentUser = savedUser;
    userProfile = savedUser.profile || {
      id: savedUser.id,
      full_name: savedUser.full_name || savedUser.user_metadata?.full_name || "Demo Mahasiswa",
      whatsapp: savedUser.whatsapp || savedUser.user_metadata?.whatsapp || "6281234567890"
    };
    return;
  }

  currentUser = DEMO_USER;
  userProfile = {
    id: DEMO_USER.id,
    full_name: DEMO_USER.user_metadata.full_name,
    whatsapp: DEMO_USER.user_metadata.whatsapp
  };
  localStorage.setItem("gosh-demo-user", JSON.stringify({
    ...DEMO_USER,
    full_name: userProfile.full_name,
    whatsapp: userProfile.whatsapp,
    profile: userProfile
  }));
  saveDemoState(state);
}

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
let pickupPoints = [];
let zoneFares = [];
let adminOrdersPage = 0;
const ADMIN_ORDERS_PAGE_SIZE = 50;

// ================= INISIALISASI =================
document.addEventListener("DOMContentLoaded", async () => {
  bindAdminEventHandlers();
  populateRouteSelects();

  if (isDemoMode()) {
    ensureDemoUser();
    await fetchSettings();
    updateAuthUI(userProfile);
    showToast("Mode demo aktif. Data tersimpan di browser untuk preview lokal.");
    pickupPoints = DEMO_ROUTE_POINTS.map((name, index) => ({
      id: `demo-point-${index}`,
      name,
      zone: index < 2 ? "Kost" : "Kampus",
      is_active: true
    }));
    populateRouteSelects();
    loadHistory();
    return;
  }

  await fetchSettings();
  await loadPickupPoints();
  initAuth();
});

async function fetchSettings() {
  if (isDemoMode()) {
    const state = loadDemoState();
    currentSettings = {
      ...currentSettings,
      ...state.settings
    };
    if (document.getElementById("displayBaseFare")) document.getElementById("displayBaseFare").innerText = fmtRp(currentSettings.one_way_fare);
    if (document.getElementById("calculatedFare")) document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
    return;
  }

  const [setRes, fareRes] = await Promise.all([
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("fare_settings").select("*").eq("id", 1).maybeSingle()
  ]);
  if (setRes.error) showToast("Gagal memuat pengaturan admin: " + errMsg(setRes.error));
  if (fareRes.error) showToast("Gagal memuat tarif cadangan: " + errMsg(fareRes.error));
  if (setRes.data) {
    currentSettings.admin_whatsapp = setRes.data.admin_whatsapp || currentSettings.admin_whatsapp;
    currentSettings.qris_path = setRes.data.qris_path || "";
    currentSettings.qris_active = !!setRes.data.qris_active;
  }
  if (fareRes.data) {
    if (fareRes.data.one_way_fare) currentSettings.one_way_fare = Number(fareRes.data.one_way_fare);
    if (fareRes.data.round_trip_fare) currentSettings.round_trip_fare = Number(fareRes.data.round_trip_fare);
  }
  if (document.getElementById("displayBaseFare")) document.getElementById("displayBaseFare").innerText = fmtRp(currentSettings.one_way_fare);
  if (document.getElementById("calculatedFare")) document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
}

// ================= AUTH =================
async function initAuth() {
  if (isDemoMode()) {
    ensureDemoUser();
    updateAuthUI(userProfile);
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await fetchProfile();
  } else {
    updateAuthUI(null);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      isAdmin = false;
      userProfile = null;
      updateAuthUI(null);
      currentUser = session.user;
      await fetchProfile();
    } else {
      currentUser = null;
      userProfile = null;
      isAdmin = false;
      clearAdminView();
      updateAuthUI(null);
    }
  });
}

async function fetchProfile() {
  if (isDemoMode()) {
    if (!currentUser) {
      userProfile = null;
      isAdmin = false;
      return;
    }
    userProfile = {
      id: currentUser.id,
      full_name: currentUser.user_metadata?.full_name || currentUser.full_name || "Demo Mahasiswa",
      whatsapp: currentUser.user_metadata?.whatsapp || currentUser.whatsapp || "6281234567890"
    };
    isAdmin = false;
    updateAuthUI(userProfile);
    return;
  }

  if (!currentUser) return;
  const [profileRes, rolesRes] = await Promise.all([
    sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", currentUser.id)
  ]);
  if (profileRes.error || rolesRes.error) {
    userProfile = profileRes.data || null;
    isAdmin = false;
    clearAdminView();
    updateAuthUI(userProfile);
    showToast("Gagal memverifikasi profil/role: " + errMsg(profileRes.error || rolesRes.error));
    return;
  }
  userProfile = profileRes.data || null;
  isAdmin = !!(rolesRes.data || []).some(r => r.role === "admin");
  if (!isAdmin) clearAdminView();
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
    adminBtn.style.display = isAdmin && !isDemoMode() ? "inline-block" : "none";
  } else {
    authSec.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="openModal('authModal')">Masuk / Daftar</button>`;
    adminBtn.style.display = "none";
  }
}

// ================= LOGIN / DAFTAR / KELUAR =================
function switchAuthMode(mode) {
  const loginF = document.getElementById("loginForm");
  const regF = document.getElementById("registerForm");
  const driverF = document.getElementById("driverForm");
  const tabL = document.getElementById("tabLoginBtn");
  const tabR = document.getElementById("tabRegisterBtn");
  const tabD = document.getElementById("tabDriverBtn");

  loginF.classList.add("hidden");
  regF.classList.add("hidden");
  driverF.classList.add("hidden");
  tabL.classList.remove("active");
  tabR.classList.remove("active");
  tabD.classList.remove("active");

  if (mode === "login") {
    loginF.classList.remove("hidden");
    tabL.classList.add("active");
  } else if (mode === "driver") {
    driverF.classList.remove("hidden");
    tabD.classList.add("active");
  } else {
    regF.classList.remove("hidden");
    tabR.classList.add("active");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (isDemoMode()) {
    const profile = {
      id: makeUuid(),
      full_name: email.split("@")[0] || "Demo Mahasiswa",
      whatsapp: "6281234567890"
    };
    currentUser = { id: profile.id, email, user_metadata: { full_name: profile.full_name, whatsapp: profile.whatsapp } };
    userProfile = profile;
    isAdmin = false;
    localStorage.setItem("gosh-demo-user", JSON.stringify({ ...currentUser, profile }));
    updateAuthUI(userProfile);
    closeModal("authModal");
    showToast("Mode demo: berhasil login.");
    return;
  }

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
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const fullName = document.getElementById("regName").value.trim();
  let phone = document.getElementById("regPhone").value.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);

  if (isDemoMode()) {
    currentUser = { id: makeUuid(), email, user_metadata: { full_name: fullName, whatsapp: phone } };
    userProfile = { id: currentUser.id, full_name: fullName, whatsapp: phone };
    isAdmin = false;
    localStorage.setItem("gosh-demo-user", JSON.stringify({ ...currentUser, profile: userProfile }));
    updateAuthUI(userProfile);
    closeModal("authModal");
    showToast("Mode demo: akun dibuat dan otomatis masuk.");
    return;
  }

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
  if (isDemoMode()) {
    currentUser = null;
    userProfile = null;
    isAdmin = false;
    localStorage.removeItem("gosh-demo-user");
    clearAdminView();
    updateAuthUI(null);
    showToast("Anda telah keluar.");
    showTab("home");
    return;
  }

  isAdmin = false;
  updateAuthUI(null);
  const { error } = await sb.auth.signOut();
  if (error) {
    showToast("Gagal keluar: " + errMsg(error));
    await fetchProfile();
    return;
  }
  currentUser = null;
  userProfile = null;
  clearAdminView();
  showToast("Anda telah keluar.");
  showTab("home");
}

// ================= NAVIGASI TAB =================
function showTab(tabId) {
  if (tabId === "admin" && (!currentUser || !isAdmin || isDemoMode())) {
    showToast("Akses Control Panel hanya tersedia untuk akun admin terverifikasi.");
    tabId = "home";
  }

  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(el => el.classList.remove("active"));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add("active");
  const navMap = { home: 0, booking: 1, history: 2, reviews: 3, proofs: 4, admin: 5 };
  const navBtns = document.querySelectorAll(".nav-link");
  if (navBtns[navMap[tabId]]) navBtns[navMap[tabId]].classList.add("active");

  if (tabId === "history") loadHistory();
  if (tabId === "reviews") {
    // Keep UI usable in demo mode without backend data.
    const reviewList = document.getElementById("myReviewsList");
    if (reviewList) reviewList.innerHTML = '<p class="empty-state">Belum ada ulasan yang dibuat.</p>';
  }
  if (tabId === "proofs") {
    const proofList = document.getElementById("myProofsList");
    if (proofList) proofList.innerHTML = '<p class="empty-state">Belum ada bukti transaksi.</p>';
  }
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
  const pickupName = document.getElementById("pickupPoint").value;
  const destinationName = document.getElementById("destPoint").value;
  const pickup = pickupPoints.find(point => point.name === pickupName);
  const destination = pickupPoints.find(point => point.name === destinationName);
  let fare;

  if (pickup && destination && pickup.zone.toLowerCase() !== destination.zone.toLowerCase()) {
    const routeFare = zoneFares.find(item =>
      item.origin_zone.toLowerCase() === pickup.zone.toLowerCase()
      && item.destination_zone.toLowerCase() === destination.zone.toLowerCase()
    );
    if (!routeFare) {
      document.getElementById("calculatedFare").innerText = "Tarif belum tersedia";
      return null;
    }
    fare = type === "round_trip" ? Number(routeFare.round_trip_fare) : Number(routeFare.one_way_fare);
  } else {
    fare = type === "round_trip" ? currentSettings.round_trip_fare : currentSettings.one_way_fare;
  }

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

  const pickupLoc = document.getElementById("pickupPoint").value.trim();
  const destLoc = document.getElementById("destPoint").value.trim();
  const pickupDate = document.getElementById("pickupDate").value;
  const pickupTime = document.getElementById("pickupTime").value;
  const tripType = document.getElementById("tripType").value;
  const notes = document.getElementById("tripNotes").value.trim();
  const pickupDetail = document.getElementById("pickupDetail").value.trim();

  if (!pickupLoc || !destLoc) {
    showToast("Pilih titik penjemputan dan tujuan dulu ya.");
    return;
  }

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

  const fare = calculateFarePreview();
  if (!fare) {
    showToast("Tarif untuk rute ini belum tersedia. Silakan pilih rute lain.");
    return;
  }

  if (isDemoMode()) {
    const state = loadDemoState();
    const order = {
      id: makeUuid(),
      code: `GOSH-${Math.floor(1000 + Math.random() * 9000)}`,
      user_id: currentUser.id,
      pickup_location: pickupLoc,
      destination: destLoc,
      pickup_detail: pickupDetail,
      pickup_at: pickupAt,
      trip_type: tripType,
      notes: notes || null,
      fare,
      status: "pending",
      created_at: new Date().toISOString(),
      profiles: {
        full_name: userProfile?.full_name || currentUser.user_metadata?.full_name || "Demo Mahasiswa",
        whatsapp: userProfile?.whatsapp || currentUser.user_metadata?.whatsapp || "6281234567890"
      },
      payments: [{ id: makeUuid(), status: "unpaid", proof_path: null, rejection_reason: null }],
      reviews: []
    };

    state.orders.unshift(order);
    saveDemoState(state);
    myOrders = state.orders.filter(o => o.user_id === currentUser.id);
    allAdminOrders = state.orders;
    document.getElementById("bookingForm").reset();
    document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
    openPaymentModal(order);
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
  if (isDemoMode()) {
    img.src = currentSettings.qris_path || "qris.jpg";
  } else if (currentSettings.qris_active && currentSettings.qris_path) {
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

  if (isDemoMode()) {
    const state = loadDemoState();
    const order = state.orders.find(item => item.id === currentPayingOrder.id);
    if (!order) {
      showToast("Pesanan tidak ditemukan di mode demo.");
      return;
    }
    order.payments = [{ id: makeUuid(), status: "pending_verification", proof_path: `demo-proof/${Date.now()}.jpg`, rejection_reason: null }];
    state.orders = state.orders.map(item => item.id === order.id ? order : item);
    saveDemoState(state);
    myOrders = state.orders.filter(o => o.user_id === currentUser.id);
    allAdminOrders = state.orders;
    fileInput.value = "";
    closeModal("paymentModal");
    showToast("Bukti pembayaran terkirim. Admin akan memverifikasi.");
    showTab("history");
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
  if (isDemoMode() || !sb) {
    window.open(path && path.startsWith("http") ? path : "qris.jpg", "_blank");
    return;
  }
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
  if (!listEl) return;
  listEl.innerHTML = "<p>Mengambil riwayat transaksi...</p>";

  if (isDemoMode()) {
    const state = loadDemoState();
    const userOrders = state.orders.filter(o => o.user_id === currentUser.id);
    myOrders = userOrders;
    renderOrderList(userOrders);
    return;
  }

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
  if (!listEl) return;
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
    const matchCode = (o.code || "").toLowerCase().includes(search);
    const matchStatus = status ? o.status === status : true;
    return matchCode && matchStatus;
  });

  renderOrderList(filtered);
}

async function cancelOrder(orderId) {
  if (!confirm("Batalkan pesanan ini?")) return;

  if (isDemoMode()) {
    const state = loadDemoState();
    state.orders = state.orders.map(order => order.id === orderId ? { ...order, status: "cancelled" } : order);
    saveDemoState(state);
    myOrders = state.orders.filter(o => o.user_id === currentUser.id);
    renderOrderList(myOrders);
    showToast("Pesanan dibatalkan.");
    return;
  }

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
function isVerifiedAdmin() {
  return Boolean(sb && !isDemoMode() && currentUser && isAdmin);
}

function clearAdminView() {
  const emptyValues = {
    adminSummary: "",
    adminRecentOrders: "",
    adminOrdersTable: "",
    adminPointsList: "",
    adminZoneFaresList: "",
    adminPageInfo: ""
  };
  Object.entries(emptyValues).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  allAdminOrders = [];
  adminOrdersPage = 0;
  const previous = document.getElementById("adminPrevPage");
  const next = document.getElementById("adminNextPage");
  if (previous) previous.disabled = true;
  if (next) next.disabled = true;
}

function denyAdminAccess() {
  isAdmin = false;
  clearAdminView();
  updateAuthUI(userProfile);
  showToast("Akses Control Panel hanya tersedia untuk akun admin terverifikasi.");
  if (document.getElementById("tab-admin")?.classList.contains("active")) showTab("home");
}

async function loadAdminDashboard() {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  clearAdminView();
  const { data: roles, error: roleError } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id);

  if (roleError) {
    isAdmin = false;
    updateAuthUI(userProfile);
    showToast("Gagal memverifikasi role admin: " + errMsg(roleError));
    showTab("home");
    return;
  }

  isAdmin = (roles || []).some(role => role.role === "admin");
  updateAuthUI(userProfile);
  if (!isAdmin) {
    showToast("Role admin tidak ditemukan. Akses ditolak.");
    showTab("home");
    return;
  }

  document.getElementById("settingAdminWa").value = currentSettings.admin_whatsapp || "";
  document.getElementById("settingBaseFare").value = currentSettings.one_way_fare;
  document.getElementById("settingRoundFare").value = currentSettings.round_trip_fare;

  const [summaryRes, recentRes] = await Promise.all([
    sb.rpc("admin_dashboard_summary"),
    sb.from("bookings")
      .select("id, code, pickup_location, destination, pickup_at, fare, status, payments(status)")
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  const summaryEl = document.getElementById("adminSummary");
  if (summaryRes.error) {
    summaryEl.innerHTML = `<p>Gagal memuat statistik: ${esc(errMsg(summaryRes.error))}</p>`;
  } else {
    renderAdminSummary(summaryRes.data || {});
  }

  if (recentRes.error) {
    document.getElementById("adminRecentOrders").innerHTML =
      `<p>Gagal memuat transaksi terbaru: ${esc(errMsg(recentRes.error))}</p>`;
  } else {
    renderRecentOrders(recentRes.data || []);
  }

  await Promise.all([loadAdminOrders(adminOrdersPage), loadZoneManagement()]);
  await fetchSettings();
}

function renderAdminSummary(summary) {
  const cards = [
    ["Total pesanan", Number(summary.total_orders || 0)],
    ["Perjalanan selesai", Number(summary.completed_rides || 0)],
    ["Pembayaran menunggu", Number(summary.pending_payments || 0)],
    ["Pembayaran lunas", Number(summary.verified_payments || 0)],
    ["Pendapatan terverifikasi", fmtRp(summary.total_revenue)]
  ];

  document.getElementById("adminSummary").innerHTML = cards.map(([label, value]) => `
    <article class="admin-stat-card">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </article>
  `).join("") + `
    <article class="admin-stat-card admin-stat-breakdown">
      <span>Ringkasan pembayaran</span>
      <strong>Belum bayar ${Number(summary.unpaid_payments || 0)} · Ditolak ${Number(summary.rejected_payments || 0)}</strong>
    </article>
  `;
}

function renderRecentOrders(orders) {
  const target = document.getElementById("adminRecentOrders");
  if (!orders.length) {
    target.innerHTML = "<p>Belum ada transaksi.</p>";
    return;
  }

  target.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Rute</th><th>Jadwal</th><th>Tarif</th><th>Status</th><th>Pembayaran</th></tr></thead>
      <tbody>${orders.map(order => {
        const payment = one(order.payments) || {};
        return `<tr>
          <td><strong>#${esc(order.code)}</strong></td>
          <td>${esc(order.pickup_location)} ➔ ${esc(order.destination)}</td>
          <td>${esc(fmtPickup(order.pickup_at))}</td>
          <td>${esc(fmtRp(order.fare))}</td>
          <td>${esc(STATUS_LABELS[order.status] || order.status)}</td>
          <td>${esc(PAY_LABELS[payment.status] || "-")}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  `;
}

async function loadAdminOrders(page = adminOrdersPage) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  adminOrdersPage = Math.max(0, page);
  const from = adminOrdersPage * ADMIN_ORDERS_PAGE_SIZE;
  const to = from + ADMIN_ORDERS_PAGE_SIZE - 1;
  const { data, error, count } = await sb
    .from("bookings")
    .select("*, payments(*), profiles(full_name, whatsapp)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    document.getElementById("adminOrdersTable").innerHTML =
      `<p>Gagal memuat pesanan: ${esc(errMsg(error))}</p>`;
    return;
  }

  allAdminOrders = data || [];
  renderAdminTable(allAdminOrders);
  const pages = Math.max(1, Math.ceil((count || 0) / ADMIN_ORDERS_PAGE_SIZE));
  document.getElementById("adminPageInfo").textContent =
    `Halaman ${adminOrdersPage + 1} dari ${pages} · ${count || 0} pesanan`;
  document.getElementById("adminPrevPage").disabled = adminOrdersPage === 0;
  document.getElementById("adminNextPage").disabled = adminOrdersPage + 1 >= pages;
}

function renderAdminTable(orders) {
  const tableEl = document.getElementById("adminOrdersTable");
  if (!orders.length) {
    tableEl.innerHTML = "<p>Belum ada pesanan.</p>";
    return;
  }

  tableEl.innerHTML = `
    <table>
      <thead><tr>
        <th>ID / Mahasiswa</th><th>Rute &amp; Jadwal</th><th>Tarif</th>
        <th>Pembayaran</th><th>Status Perjalanan</th><th>Aksi</th>
      </tr></thead>
      <tbody>${orders.map(order => {
        const payment = one(order.payments) || {};
        const statusOptions = Object.keys(STATUS_LABELS).map(status =>
          `<option value="${status}" ${order.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`
        ).join("");
        return `<tr>
          <td><strong>#${esc(order.code)}</strong><br>
            ${esc(order.profiles?.full_name || "-")}<br>
            <span class="text-secondary">${esc(order.profiles?.whatsapp || "-")}</span>
          </td>
          <td>${esc(order.pickup_location)} ➔ ${esc(order.destination)}<br>
            <span class="text-secondary">${esc(fmtPickup(order.pickup_at))}</span>
          </td>
          <td>${esc(fmtRp(order.fare))}</td>
          <td>
            <span class="badge ${getPayBadge(payment.status)}">${esc(PAY_LABELS[payment.status] || "-")}</span>
            ${payment.proof_path ? `<button class="btn btn-secondary btn-sm" data-admin-action="proof" data-path="${esc(payment.proof_path)}">Bukti</button>` : ""}
            ${payment.rejection_reason ? `<div class="admin-error-text">${esc(payment.rejection_reason)}</div>` : ""}
          </td>
          <td>
            <select data-admin-action="trip-status" data-order-id="${esc(order.id)}" aria-label="Status perjalanan ${esc(order.code)}">
              ${statusOptions}
            </select>
          </td>
          <td class="admin-actions">
            ${payment.status === "pending_verification" ? `
              <button class="btn btn-primary btn-sm" data-admin-action="payment" data-order-id="${esc(order.id)}" data-approve="true">Setujui</button>
              <button class="btn btn-secondary btn-sm" data-admin-action="payment" data-order-id="${esc(order.id)}" data-approve="false">Tolak</button>
            ` : ""}
            <button class="btn btn-secondary btn-sm" data-admin-action="whatsapp" data-order-id="${esc(order.id)}">Chat WA</button>
          </td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  `;
}

function bindAdminEventHandlers() {
  document.getElementById("adminOrdersTable").addEventListener("click", event => {
    const control = event.target.closest("[data-admin-action]");
    if (!control) return;
    const { adminAction, orderId, approve, path } = control.dataset;

    if (adminAction === "proof") viewProof(path);
    if (adminAction === "payment") verifyPayment(orderId, approve === "true");
    if (adminAction === "whatsapp") sendWaToStudent(findOrder(orderId));
  });

  document.getElementById("adminOrdersTable").addEventListener("change", event => {
    const control = event.target.closest('[data-admin-action="trip-status"]');
    if (control) updateTripStatus(control.dataset.orderId, control.value);
  });

  document.getElementById("adminPointsList").addEventListener("click", event => {
    const control = event.target.closest("[data-point-action]");
    if (!control) return;
    if (control.dataset.pointAction === "save") savePickupPoint(control.dataset.id);
    if (control.dataset.pointAction === "toggle") togglePickupPoint(control.dataset.id, control.dataset.active === "true");
  });

  document.getElementById("adminZoneFaresList").addEventListener("click", event => {
    const control = event.target.closest("[data-fare-action]");
    if (!control) return;
    if (control.dataset.fareAction === "save") updateZoneFare(control.dataset.id);
    if (control.dataset.fareAction === "delete") deleteZoneFare(control.dataset.id);
  });
}

async function verifyPayment(orderId, approve) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

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
    showToast("Gagal mengubah status pembayaran: " + errMsg(error));
    return;
  }
  showToast(approve ? "Pembayaran disetujui." : "Pembayaran ditolak.");
  await loadAdminDashboard();
}

async function updateTripStatus(orderId, newStatus) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const { error } = await sb.rpc("admin_update_booking_status", {
    p_booking_id: orderId,
    p_status: newStatus,
    p_note: null
  });
  if (error) {
    showToast("Gagal memperbarui status perjalanan: " + errMsg(error));
    await loadAdminOrders(adminOrdersPage);
    return;
  }
  showToast("Status perjalanan diperbarui.");
  await loadAdminDashboard();
}

async function loadZoneManagement() {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const [pointsRes, faresRes] = await Promise.all([
    sb.from("pickup_points").select("*").order("zone").order("name"),
    sb.from("zone_fares").select("*").order("origin_zone").order("destination_zone")
  ]);

  if (pointsRes.error) {
    document.getElementById("adminPointsList").innerHTML =
      `<p>Gagal memuat titik jemput: ${esc(errMsg(pointsRes.error))}</p>`;
  } else {
    renderPickupPoints(pointsRes.data || []);
  }

  if (faresRes.error) {
    document.getElementById("adminZoneFaresList").innerHTML =
      `<p>Gagal memuat tarif zona: ${esc(errMsg(faresRes.error))}</p>`;
  } else {
    zoneFares = faresRes.data || [];
    renderZoneFares(zoneFares);
  }
}

function renderPickupPoints(points) {
  const target = document.getElementById("adminPointsList");
  if (!points.length) {
    target.innerHTML = "<p>Belum ada titik. Tambahkan titik jemput dan tujuan untuk mulai menerima pesanan.</p>";
    return;
  }

  target.innerHTML = `
    <table><thead><tr><th>Nama titik</th><th>Zona</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${points.map(point => `<tr>
        <td><input id="point-name-${esc(point.id)}" maxlength="120" value="${esc(point.name)}" aria-label="Nama titik"></td>
        <td><input id="point-zone-${esc(point.id)}" maxlength="80" value="${esc(point.zone)}" aria-label="Zona titik"></td>
        <td>${point.is_active ? "Aktif" : "Nonaktif"}</td>
        <td class="admin-actions">
          <button class="btn btn-primary btn-sm" data-point-action="save" data-id="${esc(point.id)}">Simpan</button>
          <button class="btn btn-secondary btn-sm" data-point-action="toggle" data-id="${esc(point.id)}" data-active="${point.is_active}">
            ${point.is_active ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </td>
      </tr>`).join("")}</tbody>
    </table>
  `;
}

function renderZoneFares(fares) {
  const target = document.getElementById("adminZoneFaresList");
  if (!fares.length) {
    target.innerHTML = "<p>Belum ada matriks tarif zona.</p>";
    return;
  }

  target.innerHTML = `
    <table><thead><tr><th>Rute</th><th>Sekali jalan</th><th>Pulang-pergi</th><th>Aksi</th></tr></thead>
      <tbody>${fares.map(fare => `<tr>
        <td>${esc(fare.origin_zone)} ➔ ${esc(fare.destination_zone)}</td>
        <td><input type="number" min="1" step="1" id="fare-one-${esc(fare.id)}" value="${esc(fare.one_way_fare)}" aria-label="Tarif sekali jalan"></td>
        <td><input type="number" min="1" step="1" id="fare-round-${esc(fare.id)}" value="${esc(fare.round_trip_fare)}" aria-label="Tarif pulang-pergi"></td>
        <td class="admin-actions">
          <button class="btn btn-primary btn-sm" data-fare-action="save" data-id="${esc(fare.id)}">Simpan</button>
          <button class="btn btn-secondary btn-sm" data-fare-action="delete" data-id="${esc(fare.id)}">Hapus</button>
        </td>
      </tr>`).join("")}</tbody>
    </table>
  `;
}

async function addPoint(event) {
  event.preventDefault();
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const name = document.getElementById("ptNama").value.trim();
  const zone = document.getElementById("ptZona").value.trim();
  const { error } = await sb.from("pickup_points").insert({ name, zone });
  if (error) {
    showToast("Gagal menambahkan titik: " + errMsg(error));
    return;
  }

  event.target.reset();
  showToast("Titik berhasil disimpan.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function savePickupPoint(id) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const name = document.getElementById(`point-name-${id}`).value.trim();
  const zone = document.getElementById(`point-zone-${id}`).value.trim();
  const { error } = await sb.from("pickup_points")
    .update({ name, zone, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    showToast("Gagal menyimpan titik: " + errMsg(error));
    return;
  }
  showToast("Titik berhasil diperbarui.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function togglePickupPoint(id, isActive) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const { error } = await sb.from("pickup_points")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    showToast("Gagal mengubah status titik: " + errMsg(error));
    return;
  }
  showToast(isActive ? "Titik dinonaktifkan." : "Titik diaktifkan.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function addZoneFare(event) {
  event.preventDefault();
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const origin_zone = document.getElementById("zfAsal").value.trim();
  const destination_zone = document.getElementById("zfTujuan").value.trim();
  const one_way_fare = Number(document.getElementById("zfTarif").value);
  const round_trip_fare = Number(document.getElementById("zfTarifPp").value);
  if (!Number.isFinite(one_way_fare) || one_way_fare <= 0
      || !Number.isFinite(round_trip_fare) || round_trip_fare <= 0) {
    showToast("Tarif harus lebih besar dari nol.");
    return;
  }

  const { error } = await sb.from("zone_fares").insert({
    origin_zone,
    destination_zone,
    one_way_fare,
    round_trip_fare
  });
  if (error) {
    showToast("Gagal menyimpan tarif: " + errMsg(error));
    return;
  }
  event.target.reset();
  showToast("Tarif zona berhasil disimpan.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function updateZoneFare(id) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const one_way_fare = Number(document.getElementById(`fare-one-${id}`).value);
  const round_trip_fare = Number(document.getElementById(`fare-round-${id}`).value);
  if (!Number.isFinite(one_way_fare) || one_way_fare <= 0
      || !Number.isFinite(round_trip_fare) || round_trip_fare <= 0) {
    showToast("Tarif harus lebih besar dari nol.");
    return;
  }

  const { error } = await sb.from("zone_fares")
    .update({ one_way_fare, round_trip_fare, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    showToast("Gagal memperbarui tarif: " + errMsg(error));
    return;
  }
  showToast("Tarif zona diperbarui.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function deleteZoneFare(id) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }
  if (!confirm("Hapus tarif rute ini? Pesanan lama tidak berubah, tetapi rute baru tidak dapat dipesan.")) return;

  const { error } = await sb.from("zone_fares").delete().eq("id", id);
  if (error) {
    showToast("Gagal menghapus tarif: " + errMsg(error));
    return;
  }
  showToast("Tarif rute dihapus.");
  await Promise.all([loadZoneManagement(), loadPickupPoints()]);
}

async function saveAdminSettings() {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const admin_whatsapp = document.getElementById("settingAdminWa").value.trim().replace(/\D/g, "");
  const one_way_fare = Number(document.getElementById("settingBaseFare").value);
  const round_trip_fare = Number(document.getElementById("settingRoundFare").value);
  const qrisFileInput = document.getElementById("settingQrisFile");

  if (admin_whatsapp.length < 8) {
    showToast("Masukkan nomor WhatsApp admin yang valid.");
    return;
  }
  if (!Number.isFinite(one_way_fare) || one_way_fare <= 0
      || !Number.isFinite(round_trip_fare) || round_trip_fare <= 0) {
    showToast("Tarif cadangan harus lebih besar dari nol.");
    return;
  }

  let qris_path = currentSettings.qris_path;
  if (qrisFileInput.files.length) {
    const file = qrisFileInput.files[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("QRIS harus berupa JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Ukuran gambar QRIS maksimal 5 MB.");
      return;
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const fileName = `qris_dana_${Date.now()}.${extension}`;
    const { error: uploadError } = await sb.storage.from("qris").upload(fileName, file, { upsert: false });
    if (uploadError) {
      showToast("Gagal upload QRIS: " + errMsg(uploadError));
      return;
    }
    qris_path = fileName;
  }

  const { error: settingsError } = await sb.from("app_settings").update({
    admin_whatsapp,
    qris_path,
    qris_active: qris_path ? true : currentSettings.qris_active
  }).eq("id", 1);
  if (settingsError) {
    showToast("Gagal menyimpan pengaturan admin: " + errMsg(settingsError));
    return;
  }

  const { error: fareError } = await sb.from("fare_settings").update({
    one_way_fare,
    round_trip_fare
  }).eq("id", 1);
  if (fareError) {
    showToast("Nomor/QRIS tersimpan, tetapi gagal menyimpan tarif cadangan: " + errMsg(fareError));
    await fetchSettings();
    return;
  }

  showToast("Pengaturan admin berhasil disimpan.");
  qrisFileInput.value = "";
  await fetchSettings();
}

// ================= HELPER DUMMY UNTUK PREVIEW LOKAL =================
function installApp() {
  if (window.deferredPrompt) {
    window.deferredPrompt.prompt();
    return;
  }
  showToast("Fitur pasang aplikasi tidak tersedia pada preview lokal.");
}

function handleDriverRegister(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("drvName")?.value || "Driver Demo",
    phone: document.getElementById("drvPhone")?.value || "6281234567890",
    plate: document.getElementById("drvPlat")?.value || "B 1234 ABC",
    motor: document.getElementById("drvMotor")?.value || "Honda Beat",
    sim: document.getElementById("drvSim")?.value || "123456",
    email: document.getElementById("drvEmail")?.value || "driver@demo.id"
  };
  showToast(`Mode demo: pendaftaran driver ${payload.name} berhasil disimpan lokal.`);
  closeModal("authModal");
  console.log("Driver demo registered:", payload);
}

function previewReviewPhoto() {
  const input = document.getElementById("reviewPhotoInput");
  const preview = document.getElementById("reviewPhotoPreview");
  if (!input || !preview || !input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = event => {
    preview.src = event.target.result;
    preview.style.display = "block";
  };
  reader.readAsDataURL(input.files[0]);
}

function adminSub(key) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }
  if (!["dashboard", "orders", "zones", "settings"].includes(key)) return;
  document.querySelectorAll(".admin-view").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".admin-nav-btn").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`adm-${key}`);
  if (target) target.classList.remove("hidden");
  const navButton = document.querySelector(`.admin-nav-btn[data-admin-view="${key}"]`);
  if (navButton) navButton.classList.add("active");
}

function adminPageGo(delta) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }
  loadAdminOrders(adminOrdersPage + delta);
}

// ================= HELPER =================
function errMsg(err) {
  return err?.message || "terjadi kesalahan";
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerText = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3500);
}
