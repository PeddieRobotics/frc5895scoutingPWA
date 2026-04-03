/**
 * Compresses an image File to fit under a target byte size using canvas re-encoding.
 * Returns the original file if already under the limit.
 * Uses HTMLCanvasElement + toBlob for broad browser support (including older iOS Safari).
 *
 * @param {File} file - The image file to compress
 * @param {number} maxBytes - Target max size in bytes (default: 3 * 1024 * 1024)
 * @returns {Promise<File>} - Compressed (or original) file
 */
export async function compressImage(file, maxBytes = 3 * 1024 * 1024) {
  if (file.size <= maxBytes) return file;

  const img = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = img;

  const toBlob = (canvas, quality) =>
    new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
    );

  const drawScaled = (scale) => {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  };

  // Try progressively smaller scales until compression fits
  const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3];
  for (const scale of scales) {
    const canvas = drawScaled(scale);

    // Quick check: if even lowest quality is too big, skip to next scale
    const minBlob = await toBlob(canvas, 0.1);
    if (!minBlob || minBlob.size > maxBytes) continue;

    // Binary search for highest quality that fits
    let lo = 0.1, hi = 0.92, bestBlob = minBlob;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const blob = await toBlob(canvas, mid);
      if (blob && blob.size <= maxBytes) {
        bestBlob = blob;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
    });
  }

  // Last resort: smallest scale, low quality
  const canvas = drawScaled(0.2);
  const blob = await toBlob(canvas, 0.5);
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
