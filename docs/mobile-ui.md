# Tampilan mobile

Diukur 2026-11-05 di `kantor.playdesign.my.id` dengan emulasi perangkat (CDP
`Emulation.setDeviceMetricsOverride`), lebar 414 / 390 / 360 / 320 px.

## Titik henti

| Lebar | Yang berubah |
|---|---|
| ≤ 900 px | sidebar jadi laci geser (`position: fixed`, tombol ☰ di topbar); tabel bisa digeser dengan kolom pertama menempel; target sentuh ≥ 34–38 px |
| ≤ 560 px | padding halaman 13 px; modal penuh dengan jarak 10 px; `⌘K` disembunyikan; font label naik ke 10,5 px |
| ≤ 400 px | padding 11 px; tombol pencarian jadi ikon saja; tombol di kaki modal melebar penuh |

## Aturan yang harus dijaga

1. **Tidak ada halaman yang boleh meluber horizontal.** Ukur
   `document.documentElement.scrollWidth - clientWidth`, harus 0.
2. Tabel lebar **wajib** dibungkus `<div className="table-wrap">`.
   `.table-wrap` satu-satunya yang boleh `overflow-x: auto`.
3. Di topbar, yang boleh menyusut adalah **kolom pencarian**
   (`.search-trigger`), bukan `.topbar-right`.
4. Teks yang dipotong dengan elipsis harus `display: block` **dan** berada di
   induk `min-width: 0` — `display: inline` mengabaikan `overflow`.
5. Jangan pakai `margin` negatif pada item daftar di dalam kartu (bocor ke
   kanan); pakai `padding` pada induknya.

## Cara memeriksa

```js
// di konsol halaman, untuk setiap rute
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

Cari elemen penyebab dengan menyembunyikan satu per satu:

```js
const de = document.documentElement, base = de.scrollWidth;
for (const el of document.querySelectorAll('.main-content *, .topbar *')) {
  const p = el.style.display; el.style.display = 'none';
  if (de.scrollWidth < base) console.log(el, base, '->', de.scrollWidth);
  el.style.display = p;
}
```

## Hasil terakhir

8 rute (overview, video, leads, kalender, editor, direktori AI, invoice, admin)
bersih di 414 / 390 / 360 / 320 / 768 / 1024 px. Modal pratinjau video di 390 px:
348 × 776 px, iframe 294 × 523 px, tanpa luberan.
