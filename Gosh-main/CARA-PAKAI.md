# GOSH USH — Panduan Pasang dengan Supabase Anda

## 1. Siapkan database (sekali saja, berurutan)
1. Supabase Dashboard > project Anda > **SQL Editor > New query**.
2. Tempel seluruh isi `setup.sql`, lalu klik **Run**.
3. Buat query baru, tempel seluruh isi `20261027_admin_control_panel.sql`, lalu klik **Run**.
   Migrasi kedua wajib dijalankan: migrasi ini membuat/memperbarui tabel titik jemput dan tarif zona,
   aturan akses, serta fungsi panel admin. Migrasi juga mempertahankan data skema lama (`nama`/`zona`
   dan `zona_asal`/`zona_tujuan`/`tarif`). Aman dijalankan ulang.

## 2. Sambungkan web
1. Supabase > **Project Settings > API**.
2. Salin **Project URL** dan **anon / publishable key**.
3. Pastikan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `app.js` berasal dari project yang sama.
   Gunakan hanya key publik `anon`/`publishable`; jangan pernah menaruh `service_role` di browser.
4. Mode demo tetap ada di kode, tetapi nonaktif. Jika Supabase belum siap, aplikasi menampilkan pesan
   koneksi dan tidak membuat pesanan demo seolah-olah tersimpan.

## 3. Atur email verifikasi
Supabase > **Authentication > URL Configuration**: isi **Site URL** dengan alamat web Anda
(contoh: https://gosh-ush.netlify.app). Untuk uji lokal, tambahkan alamat localhost beserta port server
lokal ke daftar **Redirect URLs**; jangan biarkan konfigurasi produksi kosong.
Untuk uji cepat tanpa email: Authentication > Providers > Email > matikan "Confirm email"
(aktifkan lagi sebelum dipakai mahasiswa).

## 4. Buat akun admin
1. Buka web, daftar dengan email admin pilihan Anda, verifikasi email, lalu login sekali.
2. Di SQL Editor jalankan (ganti emailnya dengan email yang sudah diverifikasi):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where lower(email) = lower('EMAIL_ADMIN_ANDA')
   on conflict (user_id, role) do nothing;
   ```
3. Login ulang. Menu **Admin Panel** muncul.

## 5. Isi pengaturan di Admin Panel
- Nomor WhatsApp admin: 6285876026804
- Tarif sekali jalan & pulang-pergi
- Unggah QRIS (jika tidak, `qris.jpg` dipakai sebagai cadangan)
- Jika database lama hanya menyimpan satu tarif per rute, isi tarif pulang-pergi yang masih kosong
  melalui menu **Titik & Tarif** setelah migrasi.

## 6. Online-kan
Unggah isi folder proyek ini ke Netlify / Vercel / GitHub Pages. Masukkan alamat web yang aktif ke
**Authentication > URL Configuration > Site URL** dan tambahkan alamat yang sama ke daftar
**Redirect URLs**. Untuk uji lokal, jalankan melalui server lokal (bukan membuka `index.html` sebagai
file langsung) agar autentikasi dan penyimpanan sesi bekerja konsisten.

| File | Keterangan |
|---|---|
| `index.html` | Halaman web |
| `style.css` | Tampilan |
| `app.js` | Logika + koneksi Supabase |
| `setup.sql` | Skema database, keamanan (RLS), fungsi, storage |
| `20261027_admin_control_panel.sql` | Migrasi titik jemput, tarif zona, dan panel admin |
| `qris.jpg` | QRIS cadangan |
