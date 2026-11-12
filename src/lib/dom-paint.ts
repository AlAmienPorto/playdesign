/**
 * Pelukis DOM → canvas.
 *
 * Kenapa tidak pakai <foreignObject>: Chrome menandai gambar SVG yang berisi
 * foreignObject sebagai "tidak origin-clean", sehingga canvas.toBlob() gagal
 * dengan SecurityError. Jadi elemen pratinjau dilukis manual.
 *
 * Kuncinya: layout TIDAK dihitung ulang di sini. Semua posisi diambil dari
 * getBoundingClientRect() dan tiap kata dari Range.getClientRects(), jadi grid,
 * absolute, dan pembungkusan baris tetap persis seperti yang dilihat di layar.
 */

interface GradientStop {
  color: string;
  position: number | null;
}

export interface ParsedGradient {
  radial: boolean;
  angle: number;
  center: [number, number];
  stops: GradientStop[];
}

const COLOR_RE = /(#[0-9a-f]{3,8}|rgba?\([^)]*\)|\btransparent\b|\bwhite\b|\bblack\b)/gi;

const toColor = (value: string) => (value.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : value);

/** Memecah daftar argumen pada koma tingkat atas. */
const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

/** Mengurai satu lapis linear-/radial-gradient; null kalau bukan gradient. */
export function parseGradient(value: string): ParsedGradient | null {
  const text = (value ?? '').trim();
  if (!text || text === 'none') return null;
  const radial = /^radial-gradient\(/i.test(text);
  const linear = /^linear-gradient\(/i.test(text);
  if (!radial && !linear) return null;

  const inner = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  const args = splitTopLevel(inner);
  let angle = 180;
  let center: [number, number] = [50, 50];
  const stops: GradientStop[] = [];

  for (const arg of args) {
    const angleMatch = arg.match(/^(-?[\d.]+)deg$/i);
    if (angleMatch) {
      angle = Number(angleMatch[1]);
      continue;
    }
    if (/^to\s+/i.test(arg)) {
      const dir = arg.toLowerCase();
      if (dir.includes('top') && dir.includes('right')) angle = 45;
      else if (dir.includes('top') && dir.includes('left')) angle = 315;
      else if (dir.includes('bottom') && dir.includes('right')) angle = 135;
      else if (dir.includes('bottom') && dir.includes('left')) angle = 225;
      else if (dir.includes('top')) angle = 0;
      else if (dir.includes('right')) angle = 90;
      else if (dir.includes('left')) angle = 270;
      else angle = 180;
      continue;
    }
    const atMatch = arg.match(/at\s+([\d.]+)%\s+([\d.]+)%/i);
    if (atMatch) {
      center = [Number(atMatch[1]), Number(atMatch[2])];
      continue;
    }
    const colorMatch = arg.match(COLOR_RE);
    if (!colorMatch) continue;
    const positionMatch = arg.match(/([\d.]+)%\s*$/);
    stops.push({
      color: toColor(colorMatch[0]),
      position: positionMatch ? Number(positionMatch[1]) : null,
    });
  }

  if (stops.length === 0) return null;
  return { radial, angle, center, stops };
}

/** Latar CSS (bisa beberapa lapis gradient) → daftar gradient yang bisa dilukis. */
export function parseBackgroundLayers(value: string): ParsedGradient[] {
  const text = (value ?? '').trim();
  if (!text || text === 'none') return [];
  return splitTopLevel(text)
    .map((layer) => parseGradient(layer))
    .filter((layer): layer is ParsedGradient => Boolean(layer));
}

function buildGradient(
  ctx: CanvasRenderingContext2D,
  gradient: ParsedGradient,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasGradient {
  let canvasGradient: CanvasGradient;
  if (gradient.radial) {
    const cx = x + (w * gradient.center[0]) / 100;
    const cy = y + (h * gradient.center[1]) / 100;
    canvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
  } else {
    const radians = ((gradient.angle - 90) * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    const half = Math.max(Math.abs(w * dx), Math.abs(h * dy)) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    canvasGradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  }

  const total = gradient.stops.length;
  gradient.stops.forEach((stop, index) => {
    const position = stop.position === null ? (total === 1 ? 0 : index / (total - 1)) : stop.position / 100;
    canvasGradient.addColorStop(Math.min(1, Math.max(0, position)), stop.color);
  });
  return canvasGradient;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  if (r <= 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const isTransparent = (color: string) =>
  !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color === 'rgba(0,0,0,0)';

/** Menggambar latar + border satu kotak. */
function paintBox(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (w <= 0 || h <= 0) return;
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;

  if (!isTransparent(style.backgroundColor)) {
    ctx.fillStyle = style.backgroundColor;
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fill();
  }

  for (const layer of parseBackgroundLayers(style.backgroundImage)) {
    ctx.fillStyle = buildGradient(ctx, layer, x, y, w, h);
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fill();
  }

  const borderWidth = Number.parseFloat(style.borderTopWidth) || 0;
  if (borderWidth > 0 && style.borderTopStyle !== 'none' && !isTransparent(style.borderTopColor)) {
    ctx.strokeStyle = style.borderTopColor;
    ctx.lineWidth = borderWidth;
    roundedRect(ctx, x + borderWidth / 2, y + borderWidth / 2, w - borderWidth, h - borderWidth, radius);
    ctx.stroke();
  }
}

/** Pseudo-element hanya digambar kalau punya kotak berwarna (mis. garis aksen). */
function paintPseudo(
  ctx: CanvasRenderingContext2D,
  element: Element,
  which: '::before' | '::after',
  originX: number,
  originY: number,
  alpha: number,
) {
  const style = window.getComputedStyle(element, which);
  if (!style || style.content === 'none' || style.display === 'none') return;
  const w = Number.parseFloat(style.width) || 0;
  const h = Number.parseFloat(style.height) || 0;
  if (w <= 0 || h <= 0) return;
  const left = Number.parseFloat(style.left);
  const top = Number.parseFloat(style.top);
  const box = element.getBoundingClientRect();
  const x = box.left - originX + (Number.isFinite(left) ? left : 0);
  const y = box.top - originY + (Number.isFinite(top) ? top : 0);
  const opacity = Number.parseFloat(style.opacity);
  ctx.save();
  ctx.globalAlpha = alpha * (Number.isFinite(opacity) ? opacity : 1);
  paintBox(ctx, style, x, y, w, h);
  ctx.restore();
}

const transformText = (text: string, transform: string) => {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  return text;
};

/** Melukis tiap kata memakai posisi hasil layout browser. */
function paintText(
  ctx: CanvasRenderingContext2D,
  element: Element,
  style: CSSStyleDeclaration,
  originX: number,
  originY: number,
  alpha: number,
) {
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const spacing = Number.parseFloat(style.letterSpacing);
  if (Number.isFinite(spacing)) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  }

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const raw = node.nodeValue ?? '';
    if (!raw.trim()) continue;
    const words = raw.match(/\S+/g) ?? [];
    let cursor = 0;
    for (const word of words) {
      const start = raw.indexOf(word, cursor);
      if (start < 0) continue;
      cursor = start + word.length;
      const range = document.createRange();
      try {
        range.setStart(node, start);
        range.setEnd(node, start + word.length);
      } catch {
        continue;
      }
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const x = rect.left - originX;
      const y = rect.top - originY + rect.height / 2;
      ctx.fillText(transformText(word, style.textTransform), x, y);
    }
  }
  ctx.restore();
}

function paintImage(
  ctx: CanvasRenderingContext2D,
  element: Element,
  style: CSSStyleDeclaration,
  image: CanvasImageSource | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!image || w <= 0 || h <= 0) return;
  const source = image as HTMLImageElement;
  const naturalW = source.naturalWidth || w;
  const naturalH = source.naturalHeight || h;
  const cover = style.objectFit !== 'contain' && style.objectFit !== 'fill';
  if (!cover) {
    ctx.drawImage(image, x, y, w, h);
    return;
  }
  const scale = Math.max(w / naturalW, h / naturalH);
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
  ctx.restore();
}

function paintElement(
  ctx: CanvasRenderingContext2D,
  element: Element,
  originX: number,
  originY: number,
  inheritedAlpha: number,
  images?: Map<Element, CanvasImageSource>,
) {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return;
  const ownOpacity = Number.parseFloat(style.opacity);
  const alpha = inheritedAlpha * (Number.isFinite(ownOpacity) ? ownOpacity : 1);
  if (alpha <= 0.01) return;

  const box = element.getBoundingClientRect();
  const x = box.left - originX;
  const y = box.top - originY;

  ctx.save();
  ctx.globalAlpha = alpha;
  paintBox(ctx, style, x, y, box.width, box.height);
  if (element.tagName === 'IMG') {
    paintImage(ctx, element, style, images?.get(element), x, y, box.width, box.height);
  }
  paintPseudo(ctx, element, '::before', originX, originY, alpha);
  paintPseudo(ctx, element, '::after', originX, originY, alpha);
  paintText(ctx, element, style, originX, originY, alpha);
  ctx.restore();

  for (const child of Array.from(element.children)) {
    paintElement(ctx, child, originX, originY, alpha, images);
  }
}

/** Melukis elemen (dan turunannya) ke canvas berukuran width×height. */
export function paintElementToCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  width = 1080,
  height = 1350,
  images?: Map<Element, CanvasImageSource>,
) {
  const box = element.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.fillStyle = window.getComputedStyle(element).backgroundColor || '#000';
  ctx.fillRect(0, 0, width, height);
  const scaleX = box.width > 0 ? width / box.width : 1;
  const scaleY = box.height > 0 ? height / box.height : 1;
  ctx.scale(scaleX, scaleY);
  paintElement(ctx, element, box.left, box.top, 1, images);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
