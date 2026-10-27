# GOSH USH — Panduan Pasang dengan Supabase Anda

## 1. Siapkan database (sekali saja)
1. Supabase Dashboard > project Anda > **SQL Editor > New query**.
2. Tempel seluruh isi `setup.sql`, klik **Run**. Harus sukses tanpa error.

## 2. Sambungkan web
1. Supabase > **Project Settings > API**.
2. Salin **Project URL** dan **anon / publishable key**.
3. Buka `app.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian paling atas. (Jangan pakai `service_role` key.)

## 3. Atur email verifikasi
Supabase > **Authentication > URL Configuration**: isi **Site URL** dengan alamat web Anda
(contoh: https://gosh-ush.netlify.app). Saat uji lokal boleh dikosongkan dulu.
Untuk uji cepat tanpa email: Authentication > Providers > Email > matikan "Confirm email" (aktifkan lagi sebelum dipakai mahasiswa).

## 4. Buat akun admin
1. Buka `index.html`, daftar dengan email admin pilihan Anda, verifikasi email, lalu login sekali.
2. Di SQL Editor jalankan (ganti emailnya):
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'EMAIL_ADMIN_ANDA';
3. Login ulang. Menu **Admin Panel** muncul.

## 5. Isi pengaturan di Admin Panel
- Nomor WhatsApp admin: 6285876026804
- Tarif sekali jalan & pulang-pergi
- Unggah QRIS (jika tidak, `qris.jpg` dipakai sebagai cadangan)

## 6. Online-kan
Seret folder ini ke Netlify / Vercel / GitHub Pages. Masukkan alamatnya ke Site URL (langkah 3).

| File | Keterangan |
|---|---|
| `index.html` | Halaman web |
| `style.css` | Tampilan |
| `app.js` | Logika + koneksi Supabase |
| `setup.sql` | Skema database, keamanan (RLS), fungsi, storage |
| `qris.jpg` | QRIS cadangan |
