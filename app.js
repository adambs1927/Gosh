// ================= KONFIGURASI SUPABASE ANDA =================
// Isi dari Supabase Dashboard > Project Settings > API:
//   Project URL  -> SUPABASE_URL
//   anon / publishable key -> SUPABASE_ANON_KEY  (JANGAN pakai service_role)
const SUPABASE_URL = "https://wkbievsvoxksztgpmmdx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JfWjwWzMlALvd-8FNSRwxw_P1Oahezf";
const DEMO_MODE_ENABLED = false;
const CONFIG_BELUM_DIISI = !SUPABASE_URL || !SUPABASE_ANON_KEY
  || SUPABASE_URL.includes("GANTI") || SUPABASE_ANON_KEY.includes("GANTI");
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
  return DEMO_MODE_ENABLED;
}

function requireBackend() {
  if (sb) return true;
  showToast(CONFIG_BELUM_DIISI
    ? "Koneksi belum dikonfigurasi. Isi Project URL dan anon/publishable key Supabase di app.js."
    : "Supabase belum siap. Periksa koneksi internet dan pemuatan Supabase JS, lalu muat ulang.");
  return false;
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
  if (isDemoMode()) return;
  if (!requireBackend()) return;
  const [pointsRes, faresRes] = await Promise.all([
    sb.from("pickup_points").select("id, name, zone, is_active").eq("is_active", true).order("name"),
    sb.from("zone_fares").select("id, origin_zone, destination_zone, one_way_fare, round_trip_fare")
  ]);
  const errors = [];

  if (pointsRes.error) {
    errors.push("Titik jemput: " + databaseErrorMessage(pointsRes.error));
  } else {
    pickupPoints = pointsRes.data || [];
  }

  if (faresRes.error) {
    errors.push("Tarif zona: " + databaseErrorMessage(faresRes.error));
  } else {
    zoneFares = faresRes.data || [];
  }

  populateRouteSelects();
  if (errors.length) showToast("Gagal memuat data rute. " + errors.join(" · "));
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
  if (p === "verified") return "badge-success";
  if (p === "pending_verification") return "badge-info";
  if (p === "rejected") return "badge-danger";
  return "badge-warning";
}

// ================= FORMAT TANGGAL =================
const DT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit"
});
function fmtPickup(iso) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? DT.format(date) + " WIB" : "Jadwal tidak valid";
}
function fmtRp(n) {
  const amount = Number(n);
  return Number.isFinite(amount) ? "Rp" + amount.toLocaleString("id-ID") : "—";
}

function setPickupDateMinimum() {
  const dateInput = document.getElementById("pickupDate");
  if (!dateInput) return;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  dateInput.min = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

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
let bookingInProgress = false;
let proofUploadInProgress = false;
let pendingBookingRequestId = null;
let pendingBookingSignature = null;
let toastTimeoutId = null;
const ADMIN_ORDERS_PAGE_SIZE = 50;

// ================= INISIALISASI =================
document.addEventListener("DOMContentLoaded", async () => {
  bindAdminEventHandlers();
  populateRouteSelects();
  setPickupDateMinimum();
  document.addEventListener("click", event => {
    if (event.target.classList?.contains("modal") && event.target.classList.contains("open")) {
      closeModal(event.target.id);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const activeModal = document.querySelector(".modal.open");
    if (activeModal) closeModal(activeModal.id);
  });

  if (!isDemoMode() && !sb) {
    updateAuthUI(null);
    showToast(CONFIG_BELUM_DIISI
      ? "Koneksi Supabase belum dikonfigurasi. Isi URL dan anon/publishable key di app.js."
      : "Supabase JS gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.");
    return;
  }

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
  if (!requireBackend()) return;

  const [setRes, fareRes] = await Promise.all([
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("fare_settings").select("*").eq("id", 1).maybeSingle()
  ]);
  const errors = [];
  if (setRes.error) errors.push("Pengaturan admin: " + databaseErrorMessage(setRes.error));
  if (fareRes.error) errors.push("Tarif cadangan: " + databaseErrorMessage(fareRes.error));
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
  if (errors.length) showToast("Gagal memuat konfigurasi Supabase. " + errors.join(" · "));
}

// ================= AUTH =================
async function initAuth() {
  if (isDemoMode()) {
    ensureDemoUser();
    updateAuthUI(userProfile);
    return;
  }

  if (!requireBackend()) return;

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    window.setTimeout(async () => {
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
    }, 0);
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await fetchProfile();
  } else {
    updateAuthUI(null);
  }
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
  if (!requireBackend()) return;

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
  const driverTab = document.getElementById("tabDriverBtn");
  if (driverTab) driverTab.hidden = !isDemoMode();

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
  if (!isDemoMode() && !requireBackend()) return;
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
  if (!isDemoMode() && !requireBackend()) return;
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
  if (!isDemoMode() && !requireBackend()) return;
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
  if (["booking", "history", "reviews", "proofs"].includes(tabId) && !currentUser) {
    openModal("authModal");
    showToast("Silakan masuk terlebih dahulu untuk melanjutkan.");
    tabId = "home";
  }
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
  if (tabId === "reviews") loadReviews();
  if (tabId === "proofs") loadProofs();
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

  if (pickup && destination && pickup.name.toLowerCase() === destination.name.toLowerCase()) {
    document.getElementById("calculatedFare").innerText = "Pilih tujuan berbeda";
    return null;
  }

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
  if (bookingInProgress) return;
  if (!isDemoMode() && !requireBackend()) return;
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
  const pickupDateTime = new Date(`${pickupDate}T${pickupTime}:00+07:00`);
  if (!Number.isFinite(pickupDateTime.getTime())) {
    showToast("Tanggal atau waktu jemput tidak valid.");
    return;
  }
  const pickupAt = pickupDateTime.toISOString();
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

  const bookingNotes = [
    pickupDetail ? `Detail lokasi jemput: ${pickupDetail}` : "",
    notes
  ].filter(Boolean).join(" | ");
  if (bookingNotes.length > 500) {
    showToast("Gabungan detail lokasi dan catatan maksimal 500 karakter.");
    return;
  }

  const form = document.getElementById("bookingForm");
  const submitButton = form.querySelector('[type="submit"]');
  bookingInProgress = true;
  setButtonBusy(submitButton, true, "Memproses pesanan...");
  try {
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
      form.reset();
      document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
      await openPaymentModal(order);
      return;
    }

    const signature = JSON.stringify([pickupLoc, destLoc, pickupAt, tripType, bookingNotes]);
    if (!pendingBookingRequestId || pendingBookingSignature !== signature) {
      pendingBookingRequestId = makeUuid();
      pendingBookingSignature = signature;
    }
    showToast("Membuat pesanan...");
    const { data, error } = await sb.rpc("create_booking", {
      p_pickup: pickupLoc,
      p_destination: destLoc,
      p_pickup_at: pickupAt,
      p_trip_type: tripType,
      p_notes: bookingNotes || null,
      p_request_id: pendingBookingRequestId
    });

    if (error) {
      showToast("Gagal membuat pesanan: " + errMsg(error));
    } else {
      pendingBookingRequestId = null;
      pendingBookingSignature = null;
      showToast("Pesanan berhasil dibuat! Lanjut ke pembayaran.");
      form.reset();
      document.getElementById("calculatedFare").innerText = fmtRp(currentSettings.one_way_fare);
      await openPaymentModal(data);
    }
  } finally {
    bookingInProgress = false;
    setButtonBusy(submitButton, false);
  }
}

// ================= PEMBAYARAN QRIS & BUKTI =================
async function openPaymentModal(order) {
  currentPayingOrder = order;
  document.getElementById("payOrderCode").innerText = `#${order.code}`;
  document.getElementById("payAmount").innerText = fmtRp(order.fare);

  const img = document.getElementById("qrisModalImage");
  const qrisError = document.getElementById("qrisError");
  const uploadButton = document.getElementById("btnUploadProof");
  qrisError.classList.add("hidden");
  uploadButton.disabled = false;
  if (isDemoMode()) {
    img.src = currentSettings.qris_path || "qris.jpg";
  } else if (currentSettings.qris_active && currentSettings.qris_path) {
    const { data, error } = await sb.storage.from("qris").createSignedUrl(currentSettings.qris_path, 3600);
    if (!error && data?.signedUrl) {
      img.src = data.signedUrl;
    } else {
      img.removeAttribute("src");
      qrisError.textContent = `QRIS gagal dimuat${error ? `: ${errMsg(error)}` : "."}`;
      qrisError.classList.remove("hidden");
      uploadButton.disabled = true;
    }
  } else {
    img.src = "qris.jpg";
  }

  const waBtn = document.getElementById("btnWaPayment");
  waBtn.onclick = () => sendOrderWhatsapp(order);

  openModal("paymentModal");
}

async function uploadProof() {
  if (proofUploadInProgress) return;
  if (!isDemoMode() && !requireBackend()) return;
  const fileInput = document.getElementById("proofFileInput");
  if (!fileInput.files.length) {
    showToast("Pilih file bukti pembayaran terlebih dahulu.");
    return;
  }
  if (!currentPayingOrder) return;

  const file = fileInput.files[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("Bukti pembayaran harus berupa JPG, PNG, atau WebP.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("Ukuran file maksimal 5 MB.");
    return;
  }

  const uploadButton = document.getElementById("btnUploadProof");
  proofUploadInProgress = true;
  setButtonBusy(uploadButton, true, "Mengirim bukti...");
  try {
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

    const waWin = window.open("", "_blank");
    const fileExt = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
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
      return;
    }

    showToast("Bukti pembayaran terkirim! Membuka WhatsApp admin...");
    const waLink = adminWaUrl(currentPayingOrder, "pending_verification", "Bukti transfer sudah saya unggah di website. Mohon diverifikasi.");
    if (waWin) waWin.location.href = waLink; else window.open(waLink, "_blank");
    fileInput.value = "";
    closeModal("paymentModal");
    showTab("history");
  } finally {
    proofUploadInProgress = false;
    setButtonBusy(uploadButton, false);
  }
}

async function viewProof(path) {
  if (isDemoMode()) {
    showToast("Bukti dari mode demo tidak menyimpan berkas asli.");
    return;
  }
  if (!requireBackend()) return;
  const { data, error } = await sb.storage.from("payment-proofs").createSignedUrl(path, 600);
  if (error) {
    showToast("Gagal membuka bukti: " + errMsg(error));
    return;
  }
  if (!data?.signedUrl) {
    showToast("Tautan bukti pembayaran tidak tersedia.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
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
    renderProofsList();
    return;
  }

  if (!requireBackend()) return;
  const [bookingsRes, reviewsRes] = await Promise.all([
    sb.from("bookings")
      .select("*, payments(*)")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false }),
    sb.from("reviews")
      .select("booking_id, rating, comment, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
  ]);

  if (bookingsRes.error) {
    listEl.innerHTML = `<p>Gagal memuat: ${errMsg(bookingsRes.error)}</p>`;
    document.getElementById("myProofsList").innerHTML = `<p class="empty-state">Gagal memuat bukti transaksi.</p>`;
    return;
  }

  if (reviewsRes.error) {
    myOrders = bookingsRes.data || [];
    renderOrderList(myOrders);
    renderProofsList();
    document.getElementById("myReviewsList").innerHTML =
      `<p class="empty-state">Gagal memuat ulasan: ${esc(errMsg(reviewsRes.error))}</p>`;
    return;
  }

  const reviewsByBooking = new Map(
    (reviewsRes.data || []).map(review => [review.booking_id, review])
  );
  myOrders = (bookingsRes.data || []).map(order => {
    const review = reviewsByBooking.get(order.id);
    return { ...order, reviews: review ? [review] : [] };
  });
  renderOrderList(myOrders);
  renderProofsList();
}

function one(arr) { return Array.isArray(arr) ? arr[0] : arr; }

async function loadReviews() {
  if (!currentUser) return;
  const target = document.getElementById("myReviewsList");
  if (!target) return;
  target.innerHTML = '<p class="empty-state">Memuat ulasan...</p>';

  if (isDemoMode()) {
    const state = loadDemoState();
    const reviews = state.orders.flatMap(order =>
      (Array.isArray(order.reviews) ? order.reviews : order.reviews ? [order.reviews] : [])
        .map(review => ({ ...review, created_at: review.created_at || order.created_at }))
    );
    renderPublicReviewsList(reviews);
    return;
  }

  if (!requireBackend()) return;
  const { data, error } = await sb.from("review_feed")
    .select("rating, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    target.innerHTML = `<p class="empty-state">Gagal memuat ulasan: ${esc(databaseErrorMessage(error))}</p>`;
    return;
  }
  renderPublicReviewsList(data || []);
}

async function loadProofs() {
  if (!currentUser) return;
  document.getElementById("myProofsList").innerHTML = '<p class="empty-state">Memuat bukti transaksi...</p>';
  await loadHistory();
}

function renderPublicReviewsList(reviews) {
  const target = document.getElementById("myReviewsList");
  if (!target) return;
  if (!reviews.length) {
    target.innerHTML = '<p class="empty-state">Belum ada ulasan pelanggan.</p>';
    return;
  }

  target.innerHTML = reviews.map(review => {
    const rating = Math.min(5, Math.max(0, Number(review.rating) || 0));
    const createdAt = review.created_at ? new Date(review.created_at) : null;
    const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "";
    return `<article class="order-card">
      <div class="order-header">
        <strong>Pelanggan GOSH</strong>
        <span aria-label="Rating ${rating} dari 5">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span>
      </div>
      <p>${esc(review.comment || "Pelanggan tidak menambahkan komentar.")}</p>
      ${dateLabel ? `<p class="text-secondary">${esc(dateLabel)}</p>` : ""}
    </article>`;
  }).join("");
}

function renderProofsList() {
  const target = document.getElementById("myProofsList");
  if (!target) return;
  const ordersWithProofs = myOrders.filter(order => one(order.payments)?.proof_path);
  if (!ordersWithProofs.length) {
    target.innerHTML = '<p class="empty-state">Belum ada bukti pembayaran yang diunggah.</p>';
    return;
  }
  target.innerHTML = ordersWithProofs.map(order => {
    const payment = one(order.payments);
    return `<article class="order-card">
      <div class="order-header"><strong>#${esc(order.code)}</strong><span class="badge ${getPayBadge(payment.status)}">${esc(PAY_LABELS[payment.status] || "Status tidak diketahui")}</span></div>
      <p><strong>${esc(order.pickup_location)} ➔ ${esc(order.destination)}</strong></p>
      <p class="text-secondary">${esc(fmtRp(payment.amount || order.fare))}</p>
      <button class="btn btn-secondary btn-sm" onclick="viewProof('${esc(payment.proof_path)}')">Lihat Bukti</button>
    </article>`;
  }).join("");
}

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
    const reviewAllowed = isDemoMode() || ord.review_allowed;
    const payLabel = PAY_LABELS[pay.status] || PAY_LABELS.unpaid;
    const canPay = pay.status === "unpaid" || pay.status === "rejected";
    const canCancel = ord.status === "pending" && (pay.status === "unpaid" || !pay.status);
    const canReview = ord.status === "completed" && reviewAllowed && !rev;
    const waitingForReviewPermission = ord.status === "completed" && !reviewAllowed && !rev;
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
          ${waitingForReviewPermission ? `<span class="text-secondary">Menunggu izin ulasan dari admin</span>` : ""}
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

  if (!requireBackend()) return;
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
  const ord = findOrder(orderId);
  const rev = ord ? one(ord.reviews) : null;
  if (!ord || ord.user_id !== currentUser?.id || ord.status !== "completed"
      || (!isDemoMode() && !ord.review_allowed)) {
    showToast("Ulasan hanya dapat diberikan untuk perjalanan selesai yang telah diizinkan admin.");
    return;
  }

  document.getElementById("reviewOrderId").value = orderId;
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
  if (!isDemoMode() && !requireBackend()) return;
  const orderId = document.getElementById("reviewOrderId").value;
  const rating = Number(document.getElementById("reviewRating").value);
  const comment = document.getElementById("reviewComment").value.trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1000) {
    showToast("Rating atau komentar tidak valid.");
    return;
  }

  const ord = findOrder(orderId);
  const rev = ord ? one(ord.reviews) : null;
  if (!ord || ord.user_id !== currentUser?.id || ord.status !== "completed"
      || (!isDemoMode() && !ord.review_allowed)) {
    showToast("Ulasan hanya dapat dikirim setelah admin mengizinkannya untuk perjalanan selesai.");
    return;
  }

  if (isDemoMode()) {
    const state = loadDemoState();
    const order = state.orders.find(item => item.id === orderId && item.user_id === currentUser?.id);
    if (!order) {
      showToast("Pesanan tidak ditemukan.");
      return;
    }
    const review = { rating, comment: comment || null, created_at: new Date().toISOString() };
    order.reviews = [review];
    saveDemoState(state);
    myOrders = state.orders.filter(item => item.user_id === currentUser.id);
    closeModal("reviewModal");
    showToast("Terima kasih atas ulasan Anda!");
    showTab("reviews");
    return;
  }

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
    showTab("reviews");
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

  await fetchSettings();
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
  const paymentStatus = document.getElementById("adminPaymentStatusFilter").value;
  const tripStatus = document.getElementById("adminOrderStatusFilter").value;
  const paymentJoin = paymentStatus ? "payments!inner(*)" : "payments(*)";
  let query = sb
    .from("bookings")
    .select(`*, ${paymentJoin}, profiles(full_name, whatsapp), reviews(*)`, { count: "exact" });
  if (tripStatus) query = query.eq("status", tripStatus);
  if (paymentStatus) query = query.eq("payments.status", paymentStatus);
  const { data, error, count } = await query
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
        <th>Pembayaran</th><th>Status Perjalanan</th><th>Izin Ulasan</th><th>Aksi</th>
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
          <td>
            ${one(order.reviews) ? '<span class="badge badge-success">Sudah diulas</span>' : order.review_allowed
              ? '<span class="badge badge-success">Diizinkan</span>'
              : order.status === "completed"
                ? `<button class="btn btn-primary btn-sm" data-admin-action="allow-review" data-order-id="${esc(order.id)}">Boleh review</button>`
                : '<span class="text-secondary">Tersedia setelah selesai</span>'}
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
    if (adminAction === "allow-review") allowReview(orderId);
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

async function allowReview(orderId) {
  if (!isVerifiedAdmin()) {
    denyAdminAccess();
    return;
  }

  const { error } = await sb.rpc("admin_allow_review", { p_booking_id: orderId });
  if (error) {
    showToast("Gagal memberikan izin ulasan: " + errMsg(error));
    return;
  }
  showToast("Izin ulasan diberikan kepada mahasiswa.");
  await loadAdminOrders(adminOrdersPage);
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
  if (!isDemoMode()) {
    showToast("Pendaftaran driver belum aktif. Silakan hubungi admin.");
    return;
  }
  showToast("Mode demo: pendaftaran driver hanya simulasi; data tidak dikirim atau disimpan.");
  closeModal("authModal");
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

function databaseErrorMessage(error) {
  const message = errMsg(error);
  if (["42P01", "42703", "42501"].includes(error?.code)) {
    return `${message}. Jalankan setup.sql, 20261027_admin_control_panel.sql, lalu 20261028_admin_review_permission.sql di Supabase SQL Editor.`;
  }
  return message;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.returnFocusElement = document.activeElement;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  const activeFormInput = modal.querySelector("form:not(.hidden) input:not([type='hidden']):not([disabled])");
  (activeFormInput || modal.querySelector("input:not([type='hidden']):not([disabled]), select:not([disabled]), button:not([disabled])"))?.focus();
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const returnFocusElement = modal.returnFocusElement;
  if (returnFocusElement?.isConnected && typeof returnFocusElement.focus === "function") {
    returnFocusElement.focus();
  }
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modal.returnFocusElement = null;
  if (!document.querySelector(".modal.open")) document.body.classList.remove("modal-open");
}

function setButtonBusy(button, busy, busyText = "Memproses...") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = busyText;
    return;
  }
  button.disabled = false;
  button.removeAttribute("aria-busy");
  if (button.dataset.idleText) {
    button.textContent = button.dataset.idleText;
    delete button.dataset.idleText;
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  t.innerText = msg;
  t.style.display = "block";
  toastTimeoutId = window.setTimeout(() => {
    t.style.display = "none";
    toastTimeoutId = null;
  }, 4500);
}
