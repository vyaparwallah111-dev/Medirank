export function sanitizeAndValidateUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Block dangerous schemes immediately
  if (/^(javascript|data|vbscript|file|about):/i.test(trimmed)) {
    return null;
  }

  try {
    const urlWithProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlWithProto);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || parsed.hostname.includes(' ') || parsed.hostname.startsWith('.')) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(rawUrl: string | null | undefined): boolean {
  return sanitizeAndValidateUrl(rawUrl) !== null;
}
