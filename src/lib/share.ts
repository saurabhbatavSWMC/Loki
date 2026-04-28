/**
 * Try Web Share API first (mobile native sheet). If unavailable or it lacks
 * file support, fall back to copying the file URL or download fallback.
 *
 * Returns one of: "shared" | "copied" | "downloaded" | "unsupported"
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<'shared' | 'copied' | 'downloaded' | 'unsupported'> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const navAny = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (navAny.canShare && navAny.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: meta?.title, text: meta?.text });
      return 'shared';
    } catch {
      // user cancelled — treat as success-like (no fallback)
      return 'shared';
    }
  }

  // No file-sharing — fall back to browser download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return 'downloaded';
  } catch {
    return 'unsupported';
  }
}
