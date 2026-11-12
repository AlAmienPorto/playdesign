/**
 * Ekspor satu slide pratinjau menjadi PNG 1080×1350 langsung di browser.
 *
 * Pratinjau di studio adalah DOM + CSS, jadi PNG dibuat dengan melukis DOM itu
 * (lihat lib/dom-paint.ts). Foto cover disalin dulu ke data URL supaya canvas
 * tetap "origin-clean"; kalau sumbernya memblokir CORS, foto dilewati dan
 * pemanggil diberi tahu supaya bisa menyarankan jalur "PNG final".
 */

import { paintElementToCanvas } from './dom-paint';

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca gambar'));
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar gagal dimuat'));
    image.src = src;
  });

/** Menyiapkan semua <img> di dalam slide sebagai gambar yang aman dilukis. */
export async function loadSlideImages(
  root: HTMLElement,
): Promise<{ images: Map<Element, HTMLImageElement>; missingImages: number }> {
  const images = new Map<Element, HTMLImageElement>();
  let missingImages = 0;
  for (const element of Array.from(root.querySelectorAll('img'))) {
    const src = element.getAttribute('src') ?? '';
    if (!src) continue;
    try {
      const dataUrl = src.startsWith('data:')
        ? src
        : await fetch(src, { mode: 'cors', credentials: 'omit' })
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.blob();
            })
            .then(blobToDataUrl);
      images.set(element, await loadImage(dataUrl));
    } catch {
      missingImages += 1;
    }
  }
  return { images, missingImages };
}

/** Melukis slide menjadi PNG 1080×1350. */
export async function renderSlidePng(
  node: HTMLElement,
  width = 1080,
  height = 1350,
): Promise<{ blob: Blob; missingImages: number }> {
  const { images, missingImages } = await loadSlideImages(node);
  const canvas = document.createElement('canvas');
  paintElementToCanvas(node, canvas, width, height, images);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG gagal dibuat dari canvas');
  return { blob, missingImages };
}

/** Menyimpan blob sebagai berkas unduhan. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
