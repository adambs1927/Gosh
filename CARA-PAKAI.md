# GOSH USH — Panduan

1. Ekstrak semua file ke satu folder, buka `index.html`.
2. `qris.jpg` = QRIS cadangan (tampil jika admin belum mengunggah QRIS lewat Admin Panel).
3. Setelah bukti transfer terkirim, WhatsApp admin (6285876026804, atau nomor di Pengaturan Admin) terbuka otomatis dengan pesan terisi.

## Membuat akun admin
1. Daftar lewat tombol "Masuk / Daftar" memakai email yang Anda pilih, verifikasi email, lalu login sekali.
2. Di backend (SQL Editor), jalankan:
   insert into user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'EMAIL_ADMIN_ANDA';
3. Login ulang: menu "Admin Panel" muncul.
