# Panduan menjalankan KulitYea Photobooth

Panduan ini untuk menjalankan photobooth di laptop sendiri (Windows), lengkap dengan kamera Canon dan QR ke Google Drive.

## 1. Yang perlu dipasang (sekali saja)

1. **Node.js** versi LTS terbaru: https://nodejs.org
2. **Git**: https://git-scm.com
3. **Google Chrome**
4. **EOS Webcam Utility** dari situs Canon, kalau memakai kamera Canon (lihat bagian 4)

Cek Node.js sudah terpasang, buka PowerShell lalu ketik:

```
node -v
```

## 2. Ambil project dan pasang paket

```
git clone https://github.com/akbarimron/kulityea.git
cd kulityea
npm install
```

Tidak mau pakai Git? Buka https://github.com/akbarimron/kulityea, tekan **Code > Download ZIP**, ekstrak, lalu buka PowerShell di folder itu dan jalankan `npm install`.

## 3. Isi kunci Google Drive (supaya QR membuka folder Drive)

1. Minta file `.env.local` ke pemilik photobooth (lewat chat pribadi, isinya rahasia).
2. Taruh file itu di dalam folder `kulityea` (sejajar dengan `package.json`). Nama file harus persis `.env.local`.

Tanpa file ini photobooth tetap jalan, tapi QR memakai WiFi laptop, bukan Google Drive.

## 4. Sambungkan kamera Canon

1. Pasang **EOS Webcam Utility** untuk model kameramu dari halaman Drivers & Downloads Canon, lalu **restart laptop**.
2. Isi baterai penuh atau pakai adaptor AC (dummy battery). Matikan **Auto power off** di menu kamera.
3. Putar kamera ke **mode video/movie**.
4. Sambungkan kabel USB dari kamera ke laptop, lalu nyalakan kamera.
5. Tutup aplikasi Canon lain yang terbuka otomatis (misalnya EOS Utility), karena bisa memakai kamera duluan.
6. Cek di aplikasi **Camera** bawaan Windows: tekan ikon ganti kamera sampai muncul gambar dari Canon. Kalau di sini muncul, photobooth juga bisa. Tutup lagi aplikasi Camera sebelum lanjut.

## 5. Jalankan photobooth

Setiap kali kode baru diambil (`git pull`), jalankan build dulu:

```
npm run build
```

Lalu jalankan:

```
npm run start -- -p 3005
```

Buka **http://localhost:3005** di Chrome, tekan **F11** untuk layar penuh.

1. Tekan lensa **Mulai**. Kalau Chrome meminta izin kamera, pilih **Izinkan**.
2. Tekan **Pengaturan**, lalu di **Sumber kamera** pilih **EOS Webcam Utility**.
3. Atur timer dan jumlah foto, tekan **Mulai jepret**.

Untuk menghentikan photobooth, tekan **Ctrl + C** di PowerShell.

## 6. Hari acara

- Lakukan satu sesi uji, lalu pindai QR di halaman hasil dengan HP.
- Kalau Windows meminta izin firewall untuk Node.js, pilih jaringan **Private** lalu **Izinkan**.
- Mode QR WiFi (tanpa Google Drive): laptop dan HP pengunjung harus di WiFi yang sama. Pakai router atau hotspot sendiri, karena WiFi publik sering memblokir koneksi antar perangkat.
- Mode Google Drive: laptop butuh internet.
- Admin (tombol gerigi di layar awal) memakai PIN 1234.

## Kalau ada masalah

| Masalah | Coba ini |
|---|---|
| Sumber kamera tidak ada EOS Webcam Utility | Restart laptop setelah instal; pastikan kamera di mode video dan menyala; tutup aplikasi lain yang memakai kamera (Zoom, Camera, EOS Utility) lalu muat ulang halaman |
| Kamera tampil hitam | Lepas tutup lensa, cabut lalu sambungkan lagi kabel USB, muat ulang halaman |
| Kamera mati sendiri | Matikan Auto power off, pakai adaptor AC |
| QR tidak bisa dibuka di HP | Pastikan HP satu WiFi dengan laptop, izinkan Node.js di firewall |
| QR bukan ke Google Drive | Cek file `.env.local` ada di folder `kulityea`, lalu matikan dan jalankan lagi photobooth |
| `npm` tidak dikenali | Pasang Node.js, lalu tutup dan buka lagi PowerShell |
