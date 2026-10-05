# Folio: advertising creative system

The goal of every ad here is a qualified person who **creates and exports an invoice**. Impressions, clicks and likes only count if they lead to one.

```
AD → LANDING PAGE → GENERATOR → INVOICE CREATED → PDF EXPORTED
```

This folder is marketing material only. Nothing here changes the website; the build ignores it.

---

## 0. Ground rules

### What the ads may claim

Everything below is true of the product today. Don't claim anything else.

| Claim | Where it's true |
|---|---|
| Free, with no limit on invoices | Pricing page, FAQ |
| No account, no sign-up, no password | Homepage, FAQ |
| No watermark and no Folio branding on the invoice | Features page |
| PDF download and print | Generator |
| Live preview as you type | Generator |
| Saved in your browser; reopen, duplicate, delete | Generator |
| Works on a phone (Edit and Preview tabs) | Generator |
| 20 templates for trades and styles (built on 16 layouts) | Template library |
| Tax, discount, shipping or other charge, deposit and balance due | Generator |
| "About three minutes" | The site's own phrase ("Three steps. About three minutes.") |

### Never claim
- You'll get paid faster.
- Tax or legal compliance.
- User numbers or ratings, "#1", or "best".
- Accounting features: payment collection, reminders, recurring billing, sending email from the app.
- Anything an ad can't show working.

### Brand
- **Name:** "Folio". If you rename the product, swap it everywhere.
- **Domain:** written below as `{domain}`. Replace it with your production domain.

### Where to run the ads
**Target the United States first** (also Canada and Australia if you like).
- The site's defaults are US-centric: US dollars and sales tax.
- **Analytics deliberately doesn't measure visitors in the EEA, the UK or Switzerland**, because the site asks for no consent. Paying for European clicks means paying for traffic you can't evaluate.

### Brand tokens for every ad
These are the site's own values; don't approximate them.

| Token | Value | Use |
|---|---|---|
| Bone | `#EFEAE0` | Ad background |
| Ivory | `#F7F4EE` | Paper, the invoice sheet |
| Stone | `#D8D1C4` | The "plate" the invoice sits on |
| Ink | `#161513` | Headline, CTA bar |
| Ash | `#655F55` | Secondary text |
| Headline face | EB Garamond (Regular / Italic) | Headlines |
| Label face | Hanken Grotesk, Medium, uppercase, wide tracking (~0.16em) | Labels, CTA |

- Square corners everywhere. The only shadow is the soft one under paper.
- No gradients, no icons, no illustrations.

### Show the real invoice
**Never let an image generator draw the invoice.** AI tools produce gibberish text and impossible numbers.

1. Open the matching template page and click **Customize this invoice**. The example data is fictional (Ridgeline Carpentry, Clara Bell Photography and so on).
2. Download the PDF.
3. Convert page 1 to a PNG at 300 dpi.
4. Composite that PNG into the scene.

The prompts in Part 5 generate the scene with a blank sheet in place for this.

### Ad sizes
| Placement | Size | Safe area for text |
|---|---|---|
| Feed (Meta, Pinterest) | 1080 × 1350 (4:5) | 60 px margin |
| Stories, Reels, TikTok, Shorts | 1080 × 1920 (9:16) | Keep text out of the top ~250 px and bottom ~400 px (platform UI) |

---

## 1. The five angles

### A. RIGHT NOW (speed and urgency)
- **Problem:** "The client just asked for an invoice and I don't have one." The stress comes from the deadline, not the invoice.
- **Core message:** You can have a finished, professional PDF in a few minutes, starting now. No setup.
- **Ideal audience:**
  - people who need one invoice today
  - handymen and tradespeople finishing a job
  - first-time freelancers
- **Format:** video, a real-time screen recording. Speed is believable only when it's shown.
- **CTA:** "Make the invoice"
- **Landing page:** `/app/`, straight into the generator. For a trade, use `/invoice-templates/contractor/`.

### B. LOOKS LIKE A REAL BUSINESS (professional appearance)
- **Problem:** "My invoice looks homemade next to the work I did." There's quiet embarrassment about a Word document or a spreadsheet.
- **Core message:** Good work deserves an invoice that looks like it came from an established business. Typeset properly, free.
- **Ideal audience:**
  - freelancers, designers, consultants and writers
  - small business owners
- **Format:** static. The finished document is the proof; let it fill the frame.
- **CTA:** "See the template"
- **Landing page:** the profession template page, so the preview matches the ad.

### C. FREE, NO CATCH (money)
- **Problem:** "I need one invoice. Why would I start a subscription or a trial for that?"
- **Core message:** Free, with no trial, no watermark and no limit. Make the invoice and leave.
- **Ideal audience:**
  - occasional invoicers and side gigs
  - people who need one invoice right now
- **Format:** static, or a short "what you don't need" video.
- **CTA:** "Make one free"
- **Landing page:** `/` (the homepage leads with "Free · No account · No watermark") or `/app/`.

### D. NO SIGN-UP (friction)
- **Problem:** "Every invoice site wants my email before I can see anything."
- **Core message:** Open the page and start typing. The preview updates as you go. Download the PDF. No account.
- **Ideal audience:**
  - privacy-minded freelancers
  - anyone who has bounced off a sign-up wall
- **Format:** video showing the first screen is the form itself, or a static.
- **CTA:** "Start typing"
- **Landing page:** `/app/`

### E. BUILT FOR YOUR WORK (profession-specific)
- **Problem:** "Generic templates don't fit how I bill: labor and materials, sessions and prints, fees and expenses."
- **Core message:** A template that already has the sections your invoices need, with a worked example you can edit.
- **Ideal audience:** contractors, photographers, designers, consultants, writers, cleaning and landscaping businesses.
- **Format:** static (the invoice section close-up), plus a template-page walkthrough video.
- **CTA:** "Use the template" or "Customize this invoice" (matches the page button)
- **Landing page:** the matching template page.

**Why these five:** they map to the five distinct reasons someone hesitates. Each reason has a different fix:

| Hesitation | Angle |
|---|---|
| No time | Right now |
| Pride | Looks professional |
| Price | Free |
| Friction | No sign-up |
| Fit | Built for your work |

---

## 2. Static ad concepts (10)

All are 4:5 at 1080 × 1350, with a 9:16 variant: same elements, invoice larger, headline above it.

The shared layout, unless a concept says otherwise:
- bone background
- label at the top left in grotesque capitals
- Garamond headline at the top left, 2 lines maximum
- the real invoice on a stone plate below or to the right, slightly rotated (≤ 2°) with a soft paper shadow
- the Folio wordmark at the bottom left
- a black CTA bar at the bottom right in grotesque capitals with a thin arrow
- at least 40% empty space

### 2.1 `INV_CONTRACTOR_TRADE_01`
- **Headline:** Labor and materials, kept separate.
- **Supporting copy:** A free contractor invoice with deposit and balance due. Fill it in, download the PDF.
- **CTA:** Use the template
- **Visual:**
  - The real Contractor invoice (Ridgeline Carpentry → Sam & Priya Desai, kitchen renovation), cropped to the middle third. The LABOR and MATERIALS headings, their subtotals, "Less deposit received" and "Balance due" are all legible.
  - The crop runs off the right edge of the frame.
- **Layout:**
  - Label "CONTRACTOR INVOICE TEMPLATE" at the top left.
  - Headline below it in Garamond, about 88 px, on 2 lines.
  - The invoice crop fills the lower 60%, bleeding right.
  - Wordmark at the bottom left; CTA bar at the bottom right, over the plate's lower edge.
  - Generous space above the invoice.
- **Landing page:** `/invoice-templates/contractor/`
- **Tracking:** `utm_campaign=inv_trade` · `utm_content=contractor_trade_01_static`

### 2.2 `INV_HANDYMAN_SPEED_01`
- **Headline:** Job done. Invoice sent before you leave.
- **Supporting copy:** A free invoice generator that works on your phone. Add labor and parts, download the PDF.
- **CTA:** Make the invoice
- **Visual:**
  - A phone lying flat on a worn plywood workbench next to a pencil and a tape measure. Natural light, top-down.
  - The phone shows a **real screenshot** of the generator's Preview tab with a contractor invoice.
  - No hands, no faces.
- **Layout:**
  - Headline across the top in ink on a bone band (the top 30% is solid bone; the photo sits below).
  - The phone sits at the center-right of the photo.
  - Wordmark at the bottom left; CTA bar at the bottom right.
  - The photo stays desaturated toward the brand palette (warm greys, no saturated colour).
- **Landing page:** `/invoice-templates/contractor/` (there's no handyman page; the contractor template fits labor and parts)
- **Tracking:** `utm_campaign=inv_speed` · `utm_content=handyman_speed_01_static`

### 2.3 `INV_FREELANCER_PRO_01`
- **Headline:** Your work is good. Your invoice should look it.
- **Supporting copy:** Free freelancer invoice template: project, hours, rate and due date, set out properly.
- **CTA:** See the template
- **Visual:**
  - The full Freelancer invoice (Maya Okafor → Tidewater Outdoor Co.), upright on an ivory sheet on a stone plate.
  - The large "Invoice" title and the side column are clearly visible.
- **Layout:**
  - Two columns: the headline in the left 45% (Garamond, 3 lines, with "should look it" in italic), the invoice in the right 55%.
  - Label "FREELANCER INVOICE TEMPLATE" above the headline; supporting copy under it in small Garamond.
  - CTA bar under the copy, left-aligned.
  - Wordmark at the bottom left.
- **Landing page:** `/invoice-templates/freelancer/`
- **Tracking:** `utm_campaign=inv_pro` · `utm_content=freelancer_pro_01_static`

### 2.4 `INV_ANYONE_FREE_01`
- **Headline:** One invoice shouldn't need a subscription.
- **Supporting copy:** Free invoice generator. No account, no watermark, no limit. Download the PDF.
- **CTA:** Make one free
- **Visual:**
  - The Classic invoice (Marlow Studio → Harbor & Pine Bakery) on its stone plate, centered and small, about 45% of the frame width.
  - Pure typographic poster feel. The emptiness is the point.
- **Layout:**
  - Headline centered at the top, Garamond, about 96 px, on 2 lines.
  - Invoice centered below.
  - A grotesque label row under the invoice: "FREE · NO ACCOUNT · NO WATERMARK".
  - CTA bar centered at the bottom; wordmark at the top center, small.
- **Landing page:** `/` (its hero repeats the "free, no account" promise)
- **Tracking:** `utm_campaign=inv_free` · `utm_content=anyone_free_01_static`

### 2.5 `INV_ANYONE_NOACCOUNT_01`
- **Headline:** No sign-up. Just the invoice.
- **Supporting copy:** Type your details, watch the invoice take shape, download the PDF. Saved in your browser.
- **CTA:** Start typing
- **Visual:**
  - A real desktop screenshot of the generator: the form on the left, the live preview on the right, with a half-filled invoice (business filled, client being typed, cursor visible in the client name field).
  - Shown inside a plain browser frame with no colourful chrome: light grey bar, no tabs.
- **Layout:**
  - Headline at the top left.
  - The screenshot fills 70% of the width, bottom right, bleeding off the bottom and right edges.
  - Supporting copy under the headline; CTA bar at the bottom left; wordmark at the top right.
- **Landing page:** `/app/`
- **Tracking:** `utm_campaign=inv_noaccount` · `utm_content=anyone_noaccount_01_static`

### 2.6 `INV_PHOTOGRAPHER_TRADE_01`
- **Headline:** Session, album, travel. Deposit already deducted.
- **Supporting copy:** Free photography invoice template, from booking deposit to balance due. Download as PDF.
- **CTA:** Customize this invoice
- **Visual:**
  - The real Photographer invoice (Clara Bell Photography → Emma & Daniel Hart, wedding) on an ivory sheet.
  - Beside it, an uncaptioned black-and-white print (a still life of a linen-covered album) lying at an angle on the stone plate. It's a prop for context, not a stock wedding photo.
- **Layout:**
  - Headline at the top left on 2 lines, with "Deposit already deducted." in italic.
  - Invoice at the center-right; the print overlaps its lower-left corner slightly.
  - CTA bar at the bottom right; wordmark at the bottom left.
- **Landing page:** `/invoice-templates/photographer/`
- **Tracking:** `utm_campaign=inv_trade` · `utm_content=photographer_trade_01_static`

### 2.7 `INV_DESIGNER_PRO_01`
- **Headline:** Show the client what each fee covers.
- **Supporting copy:** Free design invoice template: numbered phases, deliverables under each, deposit deducted.
- **CTA:** See the template
- **Visual:**
  - A close crop of the Designer invoice (Atelier Wren → Moss & Vale Brewing).
  - Phases 01–04 with their deliverables beneath, e.g. "Wordmark, color and type system; two rounds of revisions". The numbering column is clearly visible.
- **Layout:**
  - Headline at the top left.
  - The crop fills the lower 65%, as a straight-on scan (no rotation), with a fine ink rule above the first phase.
  - CTA bar at the bottom right; wordmark at the bottom left.
- **Landing page:** `/invoice-templates/designer/`
- **Tracking:** `utm_campaign=inv_pro` · `utm_content=designer_pro_01_static`

### 2.8 `INV_WRITER_TRADE_01`
- **Headline:** Name the piece. State the fee.
- **Supporting copy:** A free invoice for writers: commission, word count, fee and rights, set like a journal page.
- **CTA:** Use the template
- **Visual:**
  - The real Writer (Editorial) invoice (Sloane Mercer → Harbour Review), with its large serif "Invoice" title.
  - Placed on a stone plate next to a folded magazine page (blank text blocks, no readable copy) and a fountain pen.
  - Muted, top-down.
- **Layout:**
  - Headline set large, Garamond italic, at the top left.
  - Invoice centered.
  - Supporting copy at the bottom left; CTA bar at the bottom right; wordmark above the CTA, small.
- **Landing page:** `/invoice-templates/editorial/` (page title "Free Writer Invoice Template")
- **Tracking:** `utm_campaign=inv_trade` · `utm_content=writer_trade_01_static`

### 2.9 `INV_CONSULTANT_PRO_01`
- **Headline:** Fees here. Expenses there. Each subtotalled.
- **Supporting copy:** Free consulting invoice template with professional fees and expenses subtotalled separately.
- **CTA:** See the template
- **Visual:**
  - The real Consultant invoice (Ruth Avery Consulting → Northgate Health Partners), cropped to the two sections, "Professional fees" and "Expenses", each with its subtotal.
  - The ruled side column is visible at the left of the crop.
- **Layout:**
  - Headline in three short lines at the top left.
  - Invoice crop at the right two-thirds, bleeding off the right edge.
  - CTA bar at the bottom left; wordmark at the bottom right.
- **Landing page:** `/invoice-templates/consultant/`
- **Tracking:** `utm_campaign=inv_pro` · `utm_content=consultant_pro_01_static`

### 2.10 `INV_SMALLBIZ_PRO_01`
- **Headline:** Every number accounts looks for, in one line.
- **Supporting copy:** Free small business invoice template: number, dates, terms and amount due in one ruled strip.
- **CTA:** See the template
- **Visual:**
  - The real Small Business invoice (Hartley & Sons Printing → Bluebird Café), full page.
  - A single thin ink bracket in the margin points to the ruled strip (Invoice no., Issued, Due, Terms, Amount due). The bracket is the only annotation.
- **Layout:**
  - Headline at the top left.
  - Invoice at the center-right.
  - The bracket and a 3-word grotesque label ("THE RULED STRIP") in the left margin, level with the strip.
  - CTA bar at the bottom right; wordmark at the bottom left.
- **Landing page:** `/invoice-templates/small-business/`
- **Tracking:** `utm_campaign=inv_pro` · `utm_content=smallbiz_pro_01_static`

---

## 3. Short-form video concepts (10)

All videos share these rules:
- 9:16 at 1080 × 1920.
- Captions burned in (most people watch muted), set in Hanken Grotesk on an ink or bone bar.
- The product is shown by **real screen recording**, desktop or phone. Record at normal speed. If you speed it up, say so on screen ("2× speed").
- End card on bone: the Folio wordmark, the CTA in a black bar, and `{domain}`. Hold for 1.5 s.

### 3.1 `INV_ANYONE_SPEED_V01`: "Due today" (15 s)
- **Hook (0–2 s):** Text overlay "Client wants the invoice today." over a phone notification mock-up: plain white bubble, "Can you send the invoice?". Use a neutral mock-up, not a real app's UI.
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | Desktop recording: `/app/` opens straight to the form. Type the business name; the preview letterhead fills in live. | "No sign-up. It opens on the form." | "Open it and start typing." |
| 5–9 s | Type the client and one line item (e.g. "Bathroom tile repair", 6 h × $65); the total appears in the preview. | "Totals calculate as you type." | "Add the work. The totals do themselves." |
| 9–12 s | Click Download PDF; the PDF opens in the viewer. | "Real PDF. No watermark." | "Download the PDF." |
| 12–15 s | End card | "Make the invoice →" | "Free, at {domain}." |

- **Ending CTA:** Make the invoice → `/app/`

### 3.2 `INV_CONTRACTOR_TRADE_V01`: "Labor and materials" (18 s)
- **Hook (0–2 s):** Close-up of a messy handwritten estimate on a clipboard. Text: "Still writing invoices like this?"
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | Recording: `/invoice-templates/contractor/` loads; scroll past the preview. | "A contractor template, free." | "There's a free contractor template." |
| 5–9 s | Click **Customize this invoice**; the generator opens with the kitchen-renovation example. | "Opens with a worked example." | "It opens with an example you can edit." |
| 9–13 s | Change the client name; set one line's section to Materials; the subtotals update. | "Labor and materials, subtotalled." | "Labor and materials stay separate." |
| 13–16 s | Type a deposit; "Less deposit received" and "Balance due" update. Click Download PDF. | "Deposit in. Balance out." | "Take off the deposit, download the PDF." |
| 16–18 s | End card | "Use the contractor template →" | — |

- **Ending CTA:** Use the contractor template → `/invoice-templates/contractor/`

### 3.3 `INV_FREELANCER_PRO_V01`: "Before / after" (15 s)
- **Hook (0–2 s):** Split screen. Left: a plain spreadsheet-style invoice you make yourself (grey gridlines, default font). Never show a competitor's product. Text: "Same job. Same price."
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | The right half fades in: the Freelancer invoice PDF (Maya Okafor) at the same scale. | "Which one gets taken seriously?" | — |
| 5–10 s | Recording: the Freelancer template in the generator; type the project name and hours × rate. | "Hours × rate, project at the top." | "Same details, typeset properly." |
| 10–13 s | Download the PDF; it opens. | "Free. No account." | "Free, and no account." |
| 13–15 s | End card | "See the freelancer template →" | — |

- **Ending CTA:** See the freelancer template → `/invoice-templates/freelancer/`

### 3.4 `INV_ANYONE_FREE_V01`: "What you don't need" (12 s)
- **Hook (0–2 s):** Bone background, Garamond list that strikes through line by line: "An account. A free trial. A credit card." Text: "To make one invoice, you don't need:"
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | The list finishes striking through. | "~~An account~~ ~~A trial~~ ~~A card~~" | "You don't need an account, a trial or a card." |
| 5–9 s | Recording: the generator with a filled invoice; click Download PDF. | "Just the invoice." | "Just fill it in and download it." |
| 9–12 s | End card | "Make one free →" | "Free at {domain}." |

- **Ending CTA:** Make one free → `/`

### 3.5 `INV_HANDYMAN_MOBILE_V01`: "From the truck" (18 s)
- **Hook (0–2 s):** Real footage of a phone in a hand, inside a van or truck cab, with a tool bag visible. Hands only, no faces. Text: "Invoice before you drive off."
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–6 s | Phone screen recording: the generator's Edit tab; type the client and "Replace kitchen faucet", 1.5 h. | "Works on your phone." | "It works right on your phone." |
| 6–10 s | Add a parts line (faucet); tap the Preview tab; the full page fits the screen. | "Check it on the Preview tab." | "Check the preview." |
| 10–14 s | Tap Download PDF; open the downloaded PDF from the browser's downloads. | "PDF, ready to send." | "Download the PDF and send it." |
| 14–18 s | End card | "Make the invoice →" | — |

- **Ending CTA:** Make the invoice → `/invoice-templates/contractor/` (phone users can tap "Customize this invoice")

### 3.6 `INV_PHOTOGRAPHER_TRADE_V01`: "The deposit" (15 s)
- **Hook (0–2 s):** Text: "Took a deposit at booking?" over the Photographer invoice PDF, slowly zooming in.
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | Recording: `/invoice-templates/photographer/` → Customize this invoice. | "Free photography template." | — |
| 5–10 s | Change the couple's names; edit the album line; the deposit shows as a deduction and the balance due updates. | "Deposit deducted. Balance shown." | "The deposit's taken off; the balance is clear." |
| 10–13 s | Download the PDF. | "Session · prints · travel" | — |
| 13–15 s | End card | "Customize this invoice →" | — |

- **Ending CTA:** Customize this invoice → `/invoice-templates/photographer/`

### 3.7 `INV_DESIGNER_TEMPLATES_V01`: "Same invoice, different look" (14 s)
- **Hook (0–2 s):** A filled invoice in the preview. Text: "Same details. Watch."
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–9 s | Recording: open the template picker and click through Classic → Modern → Design Studio → Editorial. The preview changes each time; the details stay. | "Switch templates. Nothing to retype." | "Switch the design. Your details stay put." |
| 9–12 s | Settle on Design Studio; Download PDF. | "Free · No account" | — |
| 12–14 s | End card | "See the designer template →" | — |

- **Ending CTA:** See the designer template → `/invoice-templates/designer/`

### 3.8 `INV_SERVICE_RECURRING_V01`: "Next month's invoice" (16 s)
- **Hook (0–2 s):** Text: "Same client every month?" over a cleaning invoice PDF.
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–6 s | Recording: the generator's Invoices list; click Duplicate on last month's invoice. | "Duplicate last month's." | "Duplicate last month's invoice." |
| 6–10 s | The copy opens with the client and items kept, today's date and the next number; change the visits from 2 to 3. | "Client and items copied. New date and number." | "Change the visits." |
| 10–13 s | Download the PDF. | "Saved in your browser." | — |
| 13–16 s | End card | "Use the cleaning template →" | — |

- **Ending CTA:** Use the cleaning template → `/invoice-templates/cleaning-service/` (or `/invoice-templates/landscaper/` for a landscaping cut)

### 3.9 `INV_SMALLBIZ_TAX_V01`: "Tax, done right" (16 s)
- **Hook (0–2 s):** Text: "Discount before tax or after?"
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–7 s | Recording: `/tools/invoice-tax-calculator/`; type price 2,400, discount 10%, tax rate 8.25%. Totals appear. | "Discount first, then tax." | "Discount first, then tax on what's left." |
| 7–11 s | Click **Create an invoice with these numbers**; the generator opens with the same totals. | "Same numbers, now an invoice." | "Then turn it into an invoice." |
| 11–14 s | Add the client; Download PDF. | "Enter your own rate." | — |
| 14–16 s | End card | "Try the calculator →" | — |

- **Ending CTA:** Try the calculator → `/tools/invoice-tax-calculator/`
- **Rule:** the 8.25% rate is an example. Say "your rate" in the captions and never imply the tool knows rates.

### 3.10 `INV_CONSULTANT_PRO_V01`: "Fees and expenses" (15 s)
- **Hook (0–2 s):** Text: "Accounts payable sent your invoice back?"
- **Storyboard:**

| Time | Visual / screen recording | Text overlay | Voiceover |
|---|---|---|---|
| 2–5 s | Recording: `/invoice-templates/consultant/` → Customize this invoice. | "Free consulting template." | — |
| 5–10 s | Point to the "Professional fees" and "Expenses" sections and their subtotals; edit an expense line. | "Fees and expenses, subtotalled separately." | "Fees and expenses in their own sections, the way finance teams book them." |
| 10–13 s | Download the PDF. | "No account." | — |
| 13–15 s | End card | "See the consulting template →" | — |

- **Ending CTA:** See the consulting template → `/invoice-templates/consultant/`

---

## 4. Hook library (30)

**Urgency**
1. "Your client wants the invoice today."
2. "Job's done. Where's the invoice?"
3. "Need an invoice in the next ten minutes?"
4. "They said 'just send me an invoice.'"

**Money / free**
5. "Don't start a subscription for one invoice."
6. "A free invoice that doesn't look free."
7. "No trial. No card. Just the invoice."
8. "Free means free: no watermark on the PDF."

**Professionalism**
9. "Your invoice is part of your work."
10. "Same job, better invoice."
11. "Does your invoice look like a real business sent it?"
12. "Stop sending invoices from a spreadsheet."

**Frustration**
13. "Why does every invoice site want my email?"
14. "Formatting an invoice in Word again?"
15. "Tired of fixing totals by hand?"
16. "Every template site wants you to sign up first."

**Speed**
17. "Type it. See it. Download it."
18. "Invoice done while your coffee's still hot."
19. "Three steps. That's the whole thing."
20. "Real time, no cuts: one invoice." (only if the recording really is uncut)

**Freelancer**
21. "Freelancers: hours times rate, done for you."
22. "First freelance client? Here's your invoice."
23. "Name the project. Bill the hours. Send the PDF."
24. "Your first invoice sets the tone."

**Contractor**
25. "Contractors: labor and materials, kept separate."
26. "Took a deposit? Show it on the invoice."
27. "Invoice from the truck, not the kitchen table."

**Small business**
28. "An invoice layout any bookkeeper recognises."
29. "Every number accounts looks for, in one place."
30. "Same client every month? Duplicate last month's invoice."

---

## 5. Headline library

### 20 short headlines
1. Make the invoice. Get the PDF.
2. Professional invoices, free.
3. No sign-up. Just the invoice.
4. Invoice done. Back to work.
5. One invoice. No subscription.
6. Labor and materials, kept separate.
7. Your invoice, typeset properly.
8. Free invoice templates for your trade.
9. Type it. See it. Send it.
10. A real PDF. No watermark.
11. The invoice your work deserves.
12. Show what each fee covers.
13. Deposit in. Balance out.
14. Fees here. Expenses there.
15. Make an invoice on your phone.
16. Start typing. That's the setup.
17. Invoice before you drive off.
18. Your details stay in your browser.
19. Same client? Duplicate and send.
20. Free. Private. Done in minutes.

### 20 longer headlines
1. Make a professional invoice and download the PDF. No account needed.
2. The free invoice generator that opens straight onto the invoice.
3. Fill in the details and watch the invoice set itself beside them.
4. A contractor invoice with labor, materials, deposit and balance due, free.
5. Freelancer invoice template: project, hours, rate and due date, laid out properly.
6. Photography invoice with the booking deposit already deducted.
7. Design invoice template with numbered phases and deliverables under each fee.
8. Consulting invoice with fees and expenses subtotalled separately.
9. A writer's invoice that names the piece, the fee and the rights.
10. Small business invoice with the number, dates and amount due in one place.
11. Cleaning invoice for regular clients: count the visits, add the extras, send.
12. Need one invoice? Don't pay for software you'll use once.
13. Twenty free invoice templates for trades, studios and small businesses.
14. Make it on your phone, check the preview, download the PDF.
15. Tax, discount and shipping worked out as you type.
16. Your invoices are saved in your browser, not on our servers.
17. Duplicate last month's invoice and change only what's new.
18. Switch templates any time. Nothing you've typed changes.
19. A typeset PDF your client can open anywhere.
20. Free, no watermark, no limit on how many invoices you make.

### 10 CTA variations (4 words or fewer)
1. Make the invoice
2. Make one free
3. Start typing
4. Use the template
5. See the template
6. Customize this invoice (matches the template-page button)
7. Create an invoice (matches the site header)
8. Get the PDF
9. Try the calculator
10. Open the generator

---

## 6. Image-generation prompts (for the 10 static concepts)

### How to use them
1. Generate the **scene only**. Every prompt asks for a *blank* ivory sheet where the invoice goes.
2. Composite the **real** invoice PNG (exported from the product; see section 0) onto that sheet.
3. Set the headline, copy, CTA and wordmark yourself in EB Garamond and Hanken Grotesk.

**Never ask the model for text, logos or invoice content.** It will invent them badly.

**Negative prompt for all of them:**
> text, letters, numbers, logo, watermark, gradient, neon, glow, 3D render, floating objects, cartoon, illustration, icons, UI, app interface, rounded cards, people's faces, stock-photo office, laptop on desk with coffee, bokeh, lens flare, saturated colors, blue tones

**1. `INV_CONTRACTOR_TRADE_01`**
> Editorial still life photograph for a print advertisement. A single blank sheet of heavy ivory paper (#F7F4EE) lying on a matte warm-grey stone surface (#D8D1C4), photographed from directly above, sheet slightly rotated 1.5 degrees, positioned in the lower right and running off the right edge of the frame. Soft north-window daylight from the upper left, a faint soft shadow under the paper's edges. A carpenter's pencil lying parallel to the sheet's left edge. The upper half of the frame is plain warm off-white background (#EFEAE0), empty. Fine paper texture, restrained, minimal, high-end stationery catalogue aesthetic. 4:5 composition.

**2. `INV_HANDYMAN_SPEED_01`**
> Top-down editorial photograph of a worn birch plywood workbench, muted and slightly desaturated toward warm greys. A modern smartphone lies flat in the center-right, screen facing up and screen completely blank matte white. Beside it a steel tape measure and a carpenter's pencil, neatly aligned. Soft overcast daylight, gentle shadows, no harsh contrast. The top 30% of the frame is empty for type. Quiet, professional, print-magazine look, no people. 4:5.

**3. `INV_FREELANCER_PRO_01`**
> Minimal editorial photograph: one blank ivory paper sheet (#F7F4EE), upright, resting on a matte stone-grey plate (#D8D1C4) that occupies the right 55% of the frame, against a warm off-white background (#EFEAE0). Even, soft studio daylight from the left, a subtle realistic paper shadow, crisp edges. Left 45% of the frame completely empty. Sophisticated, restrained stationery advertising, lots of negative space. 4:5.

**4. `INV_ANYONE_FREE_01`**
> Centered still life for a typographic poster: a small blank ivory sheet of paper (#F7F4EE) lying on a square matte stone-grey plate (#D8D1C4), plate centered in the frame and occupying about 45% of its width, on a vast warm off-white background (#EFEAE0). Soft top light, faint shadow beneath the sheet. Extreme negative space above and below. Calm, premium, print-advertising minimalism. 4:5.

**5. `INV_ANYONE_NOACCOUNT_01`**
> Clean flat-lay of a pale warm off-white surface (#EFEAE0) with a thin, light-grey browser-window frame (empty content area, no buttons, no icons, no text) placed in the lower right, extending past the bottom and right edges of the image. Very soft drop shadow under the frame. Upper left third empty. Minimal, editorial, monochrome warm palette. 4:5.

**6. `INV_PHOTOGRAPHER_TRADE_01`**
> Top-down editorial still life on a matte stone-grey surface (#D8D1C4): a blank ivory sheet of paper (#F7F4EE) center-right, and partly overlapping its lower-left corner a black-and-white photographic print of a closed linen-covered photo album, the print slightly angled. Soft diffused daylight, delicate shadows, warm neutral tones only. Upper left area empty for type. Refined wedding-stationery aesthetic, no people. 4:5.

**7. `INV_DESIGNER_PRO_01`**
> Straight-on, perfectly square-to-camera photograph of the lower two-thirds of a blank ivory paper sheet (#F7F4EE) filling the bottom 65% of the frame edge to edge, as if scanned, with very fine paper grain. Above it, plain warm off-white background (#EFEAE0). No shadow except a hairline at the paper's top edge. Precise, Swiss-editorial, design-studio sensibility. 4:5.

**8. `INV_WRITER_TRADE_01`**
> Top-down editorial still life: a blank ivory sheet of paper (#F7F4EE) centered on a matte stone-grey surface (#D8D1C4); beside it a folded magazine page whose columns are rendered as soft grey blocks with no legible text, and a black fountain pen laid diagonally. Soft morning light from the upper left, subtle shadows. Literary, quiet, journal-like. Space at the top for a large headline. 4:5.

**9. `INV_CONSULTANT_PRO_01`**
> Minimal photograph of a blank ivory paper sheet (#F7F4EE) occupying the right two-thirds of the frame and running off the right edge, lying on a matte stone-grey plate (#D8D1C4). A thin black rule-like shadow from the sheet's edge, soft even daylight. Left third plain warm off-white (#EFEAE0). Formal, advisory-firm stationery aesthetic. 4:5.

**10. `INV_SMALLBIZ_PRO_01`**
> Editorial still life: a blank full-page ivory paper sheet (#F7F4EE) center-right on a matte stone-grey plate (#D8D1C4), warm off-white background (#EFEAE0), wide empty left margin of background. Soft daylight, faint realistic paper shadow, crisp sheet edges. Conservative, trustworthy, print-shop stationery feel. 4:5.

**For every 9:16 variant**, add to the prompt: "vertical 9:16 composition, the sheet in the middle third, the top 15% and bottom 25% left empty".

---

## 7. Audience → landing page map

Every URL below exists. The `/app/` deep links use the generator's existing parameters; the template pages' own buttons use them too.

| Audience | Ad angle | Landing page | CTA (matches the page) |
|---|---|---|---|
| Freelancers | Looks professional | `/invoice-templates/freelancer/` | See the template → "Customize this invoice" |
| Contractors | Built for your work | `/invoice-templates/contractor/` | Use the template |
| Handymen | Right now | `/invoice-templates/contractor/` (no handyman page; labor and parts fit) | Make the invoice |
| Designers | Looks professional | `/invoice-templates/designer/` | See the template |
| Photographers | Built for your work | `/invoice-templates/photographer/` | Customize this invoice |
| Writers | Built for your work | `/invoice-templates/editorial/` ("Free Writer Invoice Template") | Use the template |
| Consultants | Looks professional | `/invoice-templates/consultant/` | See the template |
| Small business owners | Looks professional | `/invoice-templates/small-business/` | See the template |
| Service businesses (cleaning) | Built for your work | `/invoice-templates/cleaning-service/` | Use the template |
| Service businesses (landscaping) | Built for your work | `/invoice-templates/landscaper/` | Use the template |
| Service businesses (plumbing, electrical, auto) | Built for your work | `/invoice-templates/plumber/`, `/invoice-templates/electrician/`, `/invoice-templates/mechanic/` | Use the template |
| Need one invoice right now | Right now / No sign-up | `/app/` | Make the invoice |
| Price-sensitive, occasional | Free | `/` | Make one free |
| Tax or discount questions | Free / Right now | `/tools/invoice-tax-calculator/` | Try the calculator |

**Optional shortcut for a later test.** Skip the template page and open the example directly:

```
/app/?template=contractor&example
```

Use `photographer`, `designer` and so on in place of `contractor`. Test this against the template page only after the first round (see section 9). The template page gives context; the shortcut removes a click.

---

## 8. UTM naming system

### Structure
```
https://{domain}{landing_page}?utm_source={platform}&utm_medium={medium}&utm_campaign={campaign}&utm_content={content}
```

| Parameter | Values | Rule |
|---|---|---|
| `utm_source` | `meta`, `tiktok`, `youtube`, `pinterest`, `reddit`, `google`, `newsletter` | The platform. Use `meta` for both Facebook and Instagram; the placement shows in the platform's own report. |
| `utm_medium` | `paid_social`, `paid_video` (YouTube), `cpc` (Google Search), `organic_social` (your own unpaid posts) | GA4 puts `paid_social` from a social source in its **Paid Social** channel, and `cpc` in **Paid Search**. |
| `utm_campaign` | `inv_speed`, `inv_pro`, `inv_free`, `inv_noaccount`, `inv_trade` | One per **angle**, so angles can be compared. Add a round suffix if you rerun: `inv_trade_r2`. |
| `utm_content` | `{audience}_{angle}_{nn}_{static or video}`, e.g. `contractor_trade_01_static`, `anyone_speed_01_video` | One per **ad**: the ad name in lowercase. |

### Rules
- **Lowercase, underscores, no spaces.** The site lowercases source, medium and campaign and turns other characters into hyphens. Keeping to this format means the values arrive exactly as written.
- Never put personal data, emails or client names in UTMs.
- **The site keeps `utm_*` tags when it reports a page view, and drops every other parameter.** So `/app/?template=contractor&example&utm_source=meta&…` works: the template opens, and the campaign is recorded.

### Examples
```
/invoice-templates/contractor/?utm_source=meta&utm_medium=paid_social&utm_campaign=inv_trade&utm_content=contractor_trade_01_static
/app/?utm_source=tiktok&utm_medium=paid_social&utm_campaign=inv_speed&utm_content=anyone_speed_01_video
/invoice-templates/freelancer/?utm_source=meta&utm_medium=paid_social&utm_campaign=inv_pro&utm_content=freelancer_pro_01_static
/?utm_source=meta&utm_medium=paid_social&utm_campaign=inv_free&utm_content=anyone_free_01_static
```

### Where it shows up
- **GA4 standard reports:**
  - **Traffic acquisition**, with the primary dimension set to **Session manual ad content**: per-ad results.
  - **Session campaign**: per-angle results.
- **The `/_seo/` dashboard** shows these by source/medium and by landing page.
- **One-time GA4 setting** (Admin → Events), no website change: mark `invoice_created` and `pdf_downloaded` as **key events**. GA4 then counts them per campaign and per ad in its standard reports.

---

## 9. Testing plan

### Round 1: four ads, one platform, two weeks

| # | Ad | Why it's in round 1 |
|---|---|---|
| 1 | `INV_ANYONE_SPEED_V01` (video → `/app/`) | The broadest need; demonstrates the product |
| 2 | `INV_CONTRACTOR_TRADE_01` (static → contractor template) | The most specific trade pitch, with the strongest message match |
| 3 | `INV_FREELANCER_PRO_01` (static → freelancer template) | The largest audience, and the "looks professional" angle |
| 4 | `INV_ANYONE_FREE_01` (static → homepage) | Tests whether "free" alone pulls qualified people |

Optional 5th, only if the budget allows: `INV_CONTRACTOR_TRADE_V01`. Same angle and landing page as #2, video against static.

### Keep constant during a round
- **Platform:** start with one (Meta: Instagram and Facebook feeds and Reels).
- **Geography:** United States.
- **Objective:** Landing page views, which keeps the platform optimizing for people who load the page.
- **Budget:** equal daily budget per ad, the same schedule and the same start date.
- **Audience:** broad targeting for #1 and #4. For #2 and #3, use one interest or job-title layer, the same one throughout the round.
- **Landing page:** don't change the landing page mid-test. Pages are ready; don't edit them during the round.

### Change between variants, one thing at a time, after round 1
- **Round 2:** the winning ad's **hook or headline** (same visual).
- **Round 3:** its **landing page**: template page against the `/app/?template=…&example` shortcut.
- **Round 4:** **format**: static against video, same angle.

### Metrics, in order of importance
1. **Cost per invoice created.** Spend ÷ `invoice_created` for that `utm_content`, from GA4. This is the decision metric.
2. **Invoice creation rate.** `invoice_created` users ÷ users from that ad.
3. **PDF export rate.** `pdf_downloaded` ÷ `invoice_created`. This shows whether people finish.
4. **Diagnostics only:**
   - CTR, which tells you whether the creative stops people;
   - landing-page-view rate, which tells you whether people bounce before the page loads;
   - generator open rate (`invoice_generator_opened` ÷ users).

Ignore likes, comments, shares and impressions when deciding. A cheap click that never creates an invoice is a loss.

**One limit to know.** The ad platforms can't see invoice creation, because the site has no ad pixel by design. They'll optimize for page views; **you** judge on GA4. Add a pixel later only if the ads prove worth scaling, and treat that as a separate, deliberate privacy decision.

### When an ad has enough data
These are working rules for a small budget, not industry benchmarks:
- **Stop early:** no decision before an ad has about **100 landing-page visitors**. Before that, one person changes the rate a lot.
- **Cut:** at **150 or more visitors and zero invoices created**, pause it.
- **Compare:** rank the survivors by cost per invoice created once each has **about 15–20 invoices created**. If two ads are within about 20% of each other, treat them as equal and keep both.
- **Video hooks:** if fewer than about 1 in 4 viewers watch past 3 seconds, change the hook before judging the rest of the ad.
- **Time:** let every ad run at least **7 days**, so weekdays and weekends both count.

### After each round
1. Keep the best one or two ads running.
2. In the `/_seo/` dashboard, look at the **funnel** for that traffic. If people reach the generator but don't create invoices, the next fix is not another ad.
3. Talk to five people who created an invoice: what were they invoicing, and what nearly stopped them? Use their words in the next round's headlines.
