/**
 * Logo upload: validates the file and redraws it on a canvas at a sensible
 * size, so stored logos stay small (typically 10–60 KB) and PDF-compatible.
 */
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_W = 800;
const MAX_H = 320;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

function decode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file does not look like an image.'));
    img.src = src;
  });
}

/** @returns {Promise<string>} a PNG (or JPEG for large photos) data URL */
export async function processLogo(file) {
  if (!file) throw new Error('No file selected.');
  if (!TYPES.includes(file.type)) throw new Error('Please choose a PNG, JPG, SVG or WebP image.');
  if (file.size > MAX_BYTES) throw new Error('That image is larger than 8 MB. Please choose a smaller file.');

  const img = await decode(await readAsDataURL(file));
  const w0 = img.naturalWidth || 400;
  const h0 = img.naturalHeight || 160;
  const scale = Math.min(1, MAX_W / w0, MAX_H / h0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let out = canvas.toDataURL('image/png');
  if (out.length > 300 * 1024) {
    // Photographic logos: JPEG on white is far smaller and prints the same.
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const b = bg.getContext('2d');
    b.fillStyle = '#ffffff';
    b.fillRect(0, 0, w, h);
    b.drawImage(canvas, 0, 0);
    out = bg.toDataURL('image/jpeg', 0.9);
  }
  return out;
}
