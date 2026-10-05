/**
 * A deliberately small Markdown renderer for the content database
 * (src/content/guides, src/content/tools). It knows exactly the constructs the
 * site's typography has a style for, and fails loudly on anything else, so a
 * guide can never publish half-formatted.
 *
 *   ## Heading / ### Heading          sections (h2 get ids for the contents list)
 *   paragraphs, - lists, 1. lists
 *   | a | b |  tables                 first row is the header
 *   > text                            a note set apart from the body
 *   **bold**  *italic*  `code`  [text](/path/ or https://…)
 *   [[invoice: <template> | caption]] a real invoice, rendered by the generator's renderer
 *   [[generator: Button text]]        a link into the generator
 *
 * A final "## Frequently asked questions" section of "### Question" + answer is
 * returned separately as `faqs`, so it can be set as the site's FAQ component
 * and described in FAQPage structured data.
 */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Inline markup. Internal links are written root-relative (/invoice-guides/…)
 * and rewritten relative to the page, like every other link on the site.
 */
export function inline(text, { root = '/', links = [] } = {}) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const raw = href.replace(/&amp;/g, '&');
    if (/^https:\/\//.test(raw)) return `<a class="link" href="${esc(raw)}" rel="noopener">${label}</a>`;
    if (!raw.startsWith('/')) throw new Error(`Links must be root-relative or https: ${raw}`);
    links.push(raw);
    return `<a class="link" href="${esc(root + raw.slice(1))}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

/** Split "a, b, c" or ["a", "b"] into a clean list. */
export const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);

/**
 * Markdown → { html, headings, faqs, steps, links, words }.
 *   options.root        relative path to the site root for this page
 *   options.directive   (name, arg) => html for [[name: arg]] blocks
 *   options.stepsUnder  heading text whose first ordered list is returned as `steps` (HowTo)
 */
export function markdown(source, { root = '/', directive = () => { throw new Error('No directives here'); }, stepsUnder = '' } = {}) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const faqs = [];
  const links = [];
  let steps = null;
  let section = '';
  let inFaq = false;
  let faq = null;
  let i = 0;
  const md = (t) => inline(t, { root, links });
  const emit = (html) => (inFaq && faq ? faq.a.push(html) : out.push(html));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m;
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) {
      const level = m[1].length;
      const text = m[2].trim();
      i++;
      if (level === 2) {
        section = text;
        inFaq = /^frequently asked questions$/i.test(text);
        faq = null;
        if (inFaq) continue;
        const id = slugify(text);
        if (headings.some((h) => h.id === id)) throw new Error(`Duplicate heading: ${text}`);
        headings.push({ id, text });
        out.push(`<h2 class="h3 article__h2" id="${id}">${md(text)}</h2>`);
      } else if (inFaq) {
        faq = { q: text, a: [] };
        faqs.push(faq);
      } else {
        out.push(`<h3 class="article__h3">${md(text)}</h3>`);
      }
      continue;
    }

    if ((m = /^\[\[(\w+):\s*(.*?)\]\]$/.exec(line.trim()))) {
      emit(directive(m[1], m[2].trim()));
      i++;
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(item);
      }
      if (ordered && stepsUnder && section === stepsUnder && !steps) steps = items.map(stepOf);
      const tag = ordered ? 'ol' : 'ul';
      emit(`<${tag} class="article__list${ordered ? ' article__list--ordered' : ''}">${items.map((t) => `<li>${md(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, sep, ...body] = rows;
      if (!sep || !/^\|[\s:|-]+\|$/.test(sep)) throw new Error(`Table needs a header separator: ${head}`);
      const n = cells(head).length;
      for (const r of body) if (cells(r).length !== n) throw new Error(`Table row has ${cells(r).length} cells, expected ${n}: ${r}`);
      emit(`<div class="article__table"><table><thead><tr>${cells(head).map((c) => `<th scope="col">${md(c)}</th>`).join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${cells(r).map((c, k) => (k === 0 ? `<th scope="row">${md(c)}</th>` : `<td>${md(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    if (line.startsWith('>')) {
      const paras = [[]];
      while (i < lines.length && lines[i].startsWith('>')) {
        const t = lines[i++].replace(/^>\s?/, '');
        if (!t.trim()) paras.push([]);
        else paras[paras.length - 1].push(t);
      }
      emit(`<aside class="article__note">${paras.filter((p) => p.length).map((p) => `<p>${md(p.join(' '))}</p>`).join('')}</aside>`);
      continue;
    }

    if (/^\s*(<|#|\[\[)/.test(line)) throw new Error(`Unsupported Markdown: ${line}`);
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\s*([-*]|\d+\.)\s|\||>|\[\[)/.test(lines[i])) para.push(lines[i++].trim());
    emit(`<p>${md(para.join(' '))}</p>`);
  }

  if (stepsUnder && !steps) throw new Error(`No ordered list under "## ${stepsUnder}" for HowTo steps`);
  const text = out.join(' ') + ' ' + faqs.map((f) => f.q + ' ' + f.a.join(' ')).join(' ');
  return { html: out.join('\n'), headings, faqs, steps, links, words: wordCount(text) };
}

/** "**Name.** The rest" → { name, text } for HowTo steps. */
function stepOf(item) {
  const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(item);
  const strip = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '');
  return m ? { name: strip(m[1]).replace(/[.:]$/, ''), text: strip(m[2] || m[1]) } : { name: strip(item).split(/(?<=\.)\s/)[0], text: strip(item) };
}

export const stripTags = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ');
export const wordCount = (html) => (stripTags(html).match(/[A-Za-z0-9][A-Za-z0-9'’.,-]*/g) || []).length;
