# Balap Mobil Anak (TK, 5 tahun)

Game balap mobil 3D super sederhana dengan Three.js. Mode bebas tanpa
kalah/menang: mobil jalan sendiri pelan-pelan, anak cukup mengatur setir
dan mengumpulkan 8 bintang di trek oval.

## Cara main lokal

Butuh Python saja (tanpa install tambahan):

```bash
cd "game-balap"
python -m http.server 8000
```

Lalu buka di browser: http://localhost:8000
(Klik tombol **Mulai Main** — browser mewajibkan klik sebelum suara aktif.)

> Catatan: game memuat Three.js dari CDN (`cdn.jsdelivr.net`),
> jadi komputer perlu internet saat pertama dibuka.

## Kontrol

| Aksi  | Keyboard         | USB stick (gamepad)       |
|-------|------------------|---------------------------|
| Belok | ← → atau A D     | Analog kiri               |
| Gas   | ↑ atau W         | Tombol A / RT             |
| Rem   | ↓ atau S         | Tombol B / LT             |
| Klakson | Spasi          | —                         |
| Mulai | Enter            | Tombol Start              |
| Jeda / lanjut | P atau Esc, tombol Jeda | Tombol Start |

Colok USB stick sebelum/sesudah game dibuka — status di kanan atas
akan berubah menjadi "Stick tersambung". Jika stick tidak terbaca,
keyboard selalu bisa dipakai penuh. Dukungan terbaik di Chrome/Edge
desktop (Gamepad API tidak tersedia di sebagian besar browser HP).

## Deploy ke Cloudflare Pages

Tidak ada build step — yang di-deploy adalah folder ini apa adanya.

**Cara A — via dashboard (termudah):**

1. Push folder ini ke repo GitHub/GitLab.
2. Buka dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git.
3. Pilih repo, set:
   - Framework preset: `None`
   - Build command: (kosongkan)
   - Build output directory: `/` (root)
4. Save and Deploy → dapat URL `https://<nama>.pages.dev`.

**Cara B — via Wrangler CLI:**

```bash
npx wrangler pages deploy . --project-name game-balap-tk
```

## Struktur file

- `index.html` — halaman + HUD + overlay start (Three.js via importmap CDN)
- `main.js` — scene, mobil, trek, input keyboard + Gamepad API, bintang, konfeti, suara
- `style.css` — tampilan cerah kontras tinggi, tombol besar
- Tidak ada dependency, tidak ada build, tidak ada backend.
