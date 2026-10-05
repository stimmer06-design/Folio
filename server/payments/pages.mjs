/**
 * The pages a client sees at /pay/<id>: a short hand-off to Stripe or PayPal,
 * and the outcomes (paid, processing, cancelled, expired, replaced).
 * Plain HTML in Folio's materials — bone paper, ink, Garamond and small caps.
 */
import { escapeHtml as e } from './util.mjs';

const ARROW = '<svg class="arrow" viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5h24.5M20.5 1l4 4-4 4"/></svg>';

const CSS = `
@font-face{font-family:"EB Garamond";src:url("/assets/fonts/eb-garamond-roman.woff2") format("woff2");font-weight:400 800;font-display:swap}
@font-face{font-family:"Hanken Grotesk";src:url("/assets/fonts/hanken-grotesk.woff2") format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#efeae0;color:#161513;font-family:"EB Garamond",Garamond,"Times New Roman",serif;font-size:1.125rem;line-height:1.5;-webkit-font-smoothing:antialiased}
main{flex:1;width:100%;max-width:34rem;margin:0 auto;padding:clamp(3rem,12vh,7rem) 1.25rem 3rem}
.label{margin:0 0 1.25rem;font-family:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;font-size:.75rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#655f55}
h1{margin:0;font-weight:400;font-size:clamp(2.25rem,1.6rem + 2.6vw,3.25rem);line-height:1.05;letter-spacing:-.015em}
.amount{margin:1.5rem 0 0;padding-top:1.25rem;border-top:1px solid #161513;display:flex;justify-content:space-between;align-items:baseline;gap:1rem}
.amount span{font-family:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;font-size:.75rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#655f55}
.amount strong{font-weight:400;font-size:1.75rem;font-variant-numeric:lining-nums tabular-nums}
p.text{margin:1.5rem 0 0;color:#2a2825}
form,.after{margin:2rem 0 0}
.btn{display:inline-flex;align-items:center;justify-content:space-between;gap:1.5rem;width:100%;min-height:3.25rem;padding:0 1.5rem 0 1.75rem;border:1px solid #161513;border-radius:0;background:#161513;color:#efeae0;font-family:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;font-size:.75rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;cursor:pointer}
.btn:hover{background:#2a2825}
.btn:focus-visible{outline:2px solid #161513;outline-offset:3px}
.arrow{width:26px;height:10px;fill:none;stroke:currentColor;stroke-width:1}
.via{margin:.85rem 0 0;font-size:.95rem;font-style:italic;color:#655f55}
.mark{display:inline-block;margin:0 0 1.25rem;padding:.3rem .6rem .25rem;border:1px solid #161513;font-family:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;font-size:.75rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase}
footer{padding:1.25rem;border-top:1px solid #cdc5b6;text-align:center;font-family:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:#655f55}
footer a{color:inherit}
`;

/**
 * @param {object} o
 * @param {string} o.title       document title
 * @param {string} [o.label]     small caps line above the heading (the business)
 * @param {string} [o.mark]      a stamp above the heading ("Paid")
 * @param {string} o.heading
 * @param {string} [o.amount]    formatted amount
 * @param {string} [o.amountLabel]
 * @param {string} [o.text]
 * @param {object} [o.form]      { action, text, via, auto, preview }
 * @param {object} [o.link]      { href, text }
 * @param {string} o.nonce       CSP nonce for the inline style and script
 */
export function page(o) {
  const form = o.form
    ? `<form method="post" action="${e(o.form.action)}" id="pay">
      ${o.form.preview ? '<input type="hidden" name="preview" value="1">' : ''}
      <button class="btn" type="submit">${e(o.form.text)} ${ARROW}</button>
    </form>
    ${o.form.via ? `<p class="via">${e(o.form.via)}</p>` : ''}`
    : '';
  const link = o.link ? `<p class="after"><a class="btn" href="${e(o.link.href)}">${e(o.link.text)} ${ARROW}</a></p>` : '';
  // Real browsers go straight on to the payment page; link scanners in mail
  // clients don't submit forms, so they never open a checkout.
  const auto = o.form && o.form.auto ? `<script nonce="${o.nonce}">document.getElementById('pay').submit();</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${e(o.title)}</title>
<style nonce="${o.nonce}">${CSS}</style>
</head>
<body>
<main>
  ${o.label ? `<p class="label">${e(o.label)}</p>` : ''}
  ${o.mark ? `<p class="mark">${e(o.mark)}</p>` : ''}
  <h1>${e(o.heading)}</h1>
  ${o.amount ? `<p class="amount"><span>${e(o.amountLabel || 'Amount due')}</span><strong>${e(o.amount)}</strong></p>` : ''}
  ${o.text ? `<p class="text">${e(o.text)}</p>` : ''}
  ${form}
  ${link}
</main>
<footer>Payment link made with <a href="/">Folio</a></footer>
${auto}
</body>
</html>`;
}

export function pageHeaders(nonce) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}
