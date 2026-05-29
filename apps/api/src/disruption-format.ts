const SBAHN_BASE = 'https://sbahn.berlin';
const SOURCE_FALLBACK_URLS: Record<string, string> = {
  bvg: 'https://www.bvg.de/en/connections/traffic-news',
  sbahn: SBAHN_BASE,
};

export interface Disruption {
  source: string;
  line: string;
  tag: string;
  headline: string;
  description: string;
  stops: string;
  from?: string;
  until: string;
  url: string;
}

export function formatDisruption(d: Disruption): string {
  const lines: string[] = [`⚠️ ${d.line} — ${d.tag}`, ''];
  lines.push(d.headline);
  if (d.description) lines.push(d.description);
  lines.push('');
  if (d.stops) lines.push(`📍 ${d.stops}`);
  if (d.from && d.until) {
    lines.push(`🕐 ${d.from} – ${d.until}`);
  } else if (d.from) {
    lines.push(`🕐 ${d.from.charAt(0).toUpperCase()}${d.from.slice(1)}`);
  } else if (d.until) {
    lines.push(`🕐 Until ${d.until}`);
  }
  const url =
    d.source === 'sbahn' && d.url
      ? `${SBAHN_BASE}${d.url}`
      : SOURCE_FALLBACK_URLS[d.source];
  if (url) lines.push(`🔗 ${url}`);
  return lines.join('\n').trimEnd();
}
