/**
 * CSV in and out for the dashboard.
 *
 * In: Search Console's own export (Performance → Export → CSV gives a zip;
 * its Pages.csv and Queries.csv are read here). This is the way in when the
 * API isn't connected. Nothing leaves the browser.
 *
 * Out: the tables on the dashboard, as plain CSV.
 */

/** RFC 4180 parsing: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const number = (v) => {
  const n = parseFloat(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * One Search Console export file → { kind: 'pages' | 'queries', rows }.
 * Recognised by its header ("Top pages" / "Top queries", or "Page" / "Query"),
 * so it doesn't matter what the file is called.
 */
export function parseSearchConsoleCsv(text) {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new Error('The file is empty.');
  const h = head.map((x) => x.trim().toLowerCase());
  const keyCol = h.findIndex((x) => /^(top )?(pages|page|queries|query)$/.test(x));
  const col = (name) => h.findIndex((x) => x === name);
  const [clicks, impressions, ctr, position] = ['clicks', 'impressions', 'ctr', 'position'].map(col);
  if (keyCol < 0 || clicks < 0 || impressions < 0) throw new Error('This isn’t a Search Console Pages or Queries export. Export from Performance → Export → Download CSV, then choose Pages.csv or Queries.csv from the zip.');
  const kind = /page/.test(h[keyCol]) ? 'pages' : 'queries';
  const key = kind === 'pages' ? 'path' : 'query';
  const rows = body.filter((r) => r[keyCol]).map((r) => {
    const c = number(r[clicks]);
    const imp = number(r[impressions]);
    return {
      [key]: r[keyCol],
      clicks: c,
      impressions: imp,
      ctr: ctr >= 0 ? number(r[ctr]) / 100 : imp ? c / imp : 0,
      position: position >= 0 ? number(r[position]) : 0,
    };
  });
  return { kind, rows };
}

/** Several imported files → the `gsc` structure growth/metrics.js reads. */
export function searchConsoleFromFiles(parsed, importedAt = new Date().toISOString()) {
  const pick = (kind) => parsed.filter((p) => p.kind === kind).flatMap((p) => p.rows);
  return { origin: 'csv', importedAt, range: null, pages: pick('pages'), queries: pick('queries') };
}

/** Rows → CSV. Cells that a spreadsheet would run as a formula are neutralised. */
export function toCsv(rows, columns) {
  const cell = (v) => {
    if (v == null) return '';
    let s = typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))].join('\r\n') + '\r\n';
}
