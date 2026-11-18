import { staticFile } from "remotion";

/**
 * Where a media file lives. On the render server it's in public/ (staticFile). In the browser editor the
 * same relative paths are mapped to online links (setAssetMap), so the SAME composition code plays live
 * in a phone browser. Full URLs pass through unchanged.
 */
let MAP: Record<string, string> = {};
export const setAssetMap = (m: Record<string, string>) => {
  MAP = m || {};
};
export const asset = (p: string): string => {
  if (!p) return p;
  if (/^(https?:|blob:|data:)/.test(p)) return p;
  const k = p.replace(/^\/+/, "");
  return MAP[k] ?? staticFile(k);
};
