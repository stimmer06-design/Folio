/**
 * The invoice template library. Pure data + one helper — no DOM.
 *
 * A template is presentation only. The invoice (model.js) stores just the
 * template id in `meta.template`; switching templates never touches the
 * invoice's content.
 *
 *   composition   which arrangement render.js uses (see COMPOSITIONS)
 *   face          'serif' (EB Garamond) or 'sans' (Hanken Grotesk) — the brand's two faces
 *   density       'airy' | 'regular' | 'compact'
 *   style         composition options (name treatment, how dates are set, grid rules…)
 *   table         column labels and row treatment
 *   groups        optional line-item groups (Labor / Materials…) with subtotals
 *   labels        wording on the document (project, deposit, balance…)
 *   editor        placeholders the editor shows while this template is active
 *   page          the layout's original short description. No longer used to build
 *                 pages: the template pages come from src/content/templates/<slug>.json
 *   aliases       former slugs, still accepted by /app/?template=
 *   sample        realistic example data for previews and "Fill with an example"
 *
 * To add a template: add one entry here. If it needs a new arrangement, add a
 * composition to render.js and a matching block to components/document.css.
 */

export const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'business', label: 'Business' },
  { id: 'creative', label: 'Creative' },
  { id: 'trades', label: 'Trades' },
];

export const COMPOSITIONS = {
  split: 'Letterhead left, invoice number right',
  letterhead: 'Centered letterhead',
  title: 'Editorial title with a side column',
  sidebar: 'Details in a ruled side column',
  statement: 'Amount due as the headline',
  minimal: 'Single column, no rules',
  ledger: 'Ruled ledger with sections',
};

const TABLE = { desc: 'Description', qty: 'Qty', price: 'Unit price', amount: 'Amount', numbered: false, fixedFee: false, detail: false };
const LABELS = { kind: 'Invoice', billTo: 'Billed to', project: 'Project', paid: 'Deposit received', due: 'Balance due' };

const define = (t) => ({
  density: 'regular',
  style: {},
  groups: null,
  ...t,
  table: { ...TABLE, ...(t.table || {}) },
  labels: { ...LABELS, ...(t.labels || {}) },
  editor: { itemPlaceholder: 'Description of the work or product', ...(t.editor || {}) },
});

export const TEMPLATES = [
  // ------------------------------------------------------------------ General
  define({
    id: 'classic',
    slug: 'classic',
    name: 'Classic',
    category: 'general',
    composition: 'split',
    face: 'serif',
    summary: 'Garamond letterhead on the left, the invoice number on the right. Folio’s original.',
    page: {
      title: 'Classic Invoice Template',
      description: 'A classic invoice template set in Garamond: letterhead, billing details and a clear amount due. Free to fill in online and download as a PDF.',
      audience: 'Anyone who wants an invoice that looks like it came from an established business: consultants, studios, shops and sole traders. It reads like a letter, so it suits clients who expect correspondence rather than a receipt.',
      features: ['Your name and logo set as a letterhead, top left', 'Invoice number set opposite in a quiet serif', 'Billed to, issue and due dates, and amount due on one line', 'Totals in a narrow column on the right, payment and notes at the foot'],
      example: 'A brand studio bills a bakery for an identity, a six-page website and three months of hosting, with a 10% discount and sales tax. The amount due sits beside the due date, so the client sees what to pay and when before reading anything else.',
    },
    sample: {
      business: { name: 'Marlow Studio', email: 'accounts@marlowstudio.com', phone: '(415) 555-0132', address: '410 Market Street, Suite 200\nSan Francisco, CA 94105', website: 'marlowstudio.com' },
      client: { name: 'Harbor & Pine Bakery', email: 'accounts@harborpine.com', address: '88 Pier Avenue\nSausalito, CA 94965' },
      items: [['Brand identity — wordmark, colour and type system', '1', '2400'], ['Website design and build, six pages', '6', '450'], ['Hosting and maintenance (October – December)', '3', '79.99']],
      adjustments: { taxRate: '8.25', taxLabel: 'Sales tax', discountType: 'percent', discountValue: '10' },
      payment: 'Bank transfer to Marlow Studio LLC\nFirst Coastal Bank · Account 000123456 · Routing 121000358',
      notes: 'Thank you for your business. Please include the invoice number with your payment.',
    },
  }),
  define({
    id: 'modern',
    slug: 'modern',
    name: 'Modern',
    category: 'general',
    composition: 'split',
    face: 'sans',
    summary: 'The Classic arrangement set in Grotesk: crisper, more contemporary, equally formal.',
    page: {
      title: 'Modern Invoice Template',
      description: 'A modern invoice template set in a clean grotesque. Fill it in online, add your logo and download a professional PDF invoice for free.',
      audience: 'Digital studios, technology freelancers and young businesses whose own branding uses a sans-serif. It keeps the proven arrangement of the Classic template and changes only the voice.',
      features: ['Set entirely in Hanken Grotesk, with semibold names and totals', 'Letterhead left, invoice number right', 'Amount due given the same weight as the business name', 'Works for one line item or forty'],
      example: 'A design studio invoices a client for website design and content migration. The semibold amount due and the clean figures make the document read quickly on a phone, where most clients will first open it.',
    },
    sample: {
      business: { name: 'Northstar Design Studio', email: 'billing@northstar.studio', phone: '(312) 555-0187', address: '1520 West Fulton Street\nChicago, IL 60607', website: 'northstar.studio' },
      client: { name: 'ABC Company', email: 'ap@abccompany.com', address: '200 North LaSalle Street, Floor 12\nChicago, IL 60601' },
      items: [['Website design', '1', '2500'], ['Content migration, 40 pages', '40', '35'], ['Training session for editors', '2', '150']],
      adjustments: { taxRate: '', discountValue: '' },
      payment: 'ACH to Northstar Design Studio Inc.\nLakeshore Bank · Account 004512 2210 · Routing 071000013',
      notes: 'Payment due within 30 days. Thank you.',
    },
  }),
  define({
    id: 'minimal',
    slug: 'minimal',
    name: 'Minimal',
    category: 'general',
    composition: 'minimal',
    face: 'serif',
    density: 'airy',
    summary: 'One column, almost no rules, generous margins. Only what the client needs.',
    page: {
      title: 'Minimal Invoice Template',
      description: 'A minimal invoice template with one column, generous white space and only the essentials. Free to fill in online and download as a PDF.',
      audience: 'Writers, translators, tutors and anyone whose invoices usually have a few lines. When there is little to say, the minimal layout makes that look deliberate rather than empty.',
      features: ['A single column that reads top to bottom', 'Dates and amount due set as a quiet row of facts', 'Hairlines only between items', 'Plenty of space for a personal note'],
      example: 'A copywriter bills two pieces of work and a round of revisions. Three lines and a total, with room to thank the client by name.',
    },
    sample: {
      business: { name: 'Iris Calloway', email: 'iris@iriscalloway.com', phone: '+44 20 7946 0321', address: '14 Elder Street\nLondon E1 6BT', website: 'iriscalloway.com' },
      client: { name: 'Fenwick & Rowe Publishers', email: 'accounts@fenwickrowe.co.uk', address: '3 Bedford Row\nLondon WC1R 4BU' },
      currency: 'GBP',
      items: [['Catalogue copy, spring list — 24 titles', '24', '45'], ['Website product descriptions', '1', '380'], ['Second round of revisions', '1', '120']],
      payment: 'Bank transfer · Sort code 20-00-00 · Account 55779911',
      notes: 'Thank you, Jo — a pleasure as always.',
    },
  }),
  define({
    id: 'editorial',
    slug: 'editorial',
    name: 'Editorial',
    category: 'general',
    composition: 'title',
    face: 'serif',
    summary: 'A large serif title and a ruled side column, like the opening page of a journal.',
    page: {
      title: 'Editorial Invoice Template',
      description: 'An editorial invoice template with a large serif title and a side column for billing details. Free online invoice maker with PDF download.',
      audience: 'Writers, editors, publishers, galleries and anyone who wants their invoice to have a little presence. The side column keeps the client, dates and payment details together, away from the figures.',
      features: ['“Invoice” set as a large serif title with the number beside it', 'Client, dates, project and payment in a ruled side column', 'Line items and totals given the full width of the main column', 'Notes printed beneath the payment details'],
      example: 'A writer invoices a magazine for a feature, a shorter column and agreed expenses. The editor sees the commission in the side column and the fee in the main column without hunting.',
    },
    sample: {
      business: { name: 'Sloane Mercer', email: 'sloane@sloanemercer.com', phone: '(718) 555-0144', address: '61 Pineapple Street\nBrooklyn, NY 11201', website: 'sloanemercer.com' },
      client: { name: 'Harbour Review', email: 'contributors@harbourreview.com', address: '19 Union Square West\nNew York, NY 10003' },
      project: 'Winter issue — “The Last Ferrymen”',
      items: [['Feature, 4,500 words', '1', '3150'], ['Column, “Notes from the Shore”', '1', '600'], ['Research travel, Staten Island ferry archive', '1', '84.50']],
      payment: 'Bank transfer to Sloane Mercer\nAccount 7781 2204 · Routing 021000021',
      notes: 'Rights as agreed: first North American serial rights.',
    },
  }),

  // ------------------------------------------------------------------ Freelance
  define({
    id: 'freelancer',
    slug: 'freelancer',
    name: 'Freelancer',
    category: 'freelance',
    composition: 'title',
    face: 'sans',
    summary: 'Built around hours and an hourly rate, with the project named at the top.',
    table: { desc: 'Work', qty: 'Hours', price: 'Rate' },
    editor: { itemPlaceholder: 'The work, e.g. Front-end development' },
    page: {
      title: 'Freelancer Invoice Template',
      description: 'A freelancer invoice template for hourly work: project, hours, hourly rate and payment terms. Fill it in online and download a PDF for free.',
      audience: 'Freelance developers, designers, writers and virtual assistants who bill by the hour. The columns read Hours and Rate, and the project sits at the top so the client can match the invoice to the work at a glance.',
      features: ['Hours × rate columns, totalled automatically', 'Project name set directly under the title', 'Client, dates and payment terms in the side column', 'Clean Grotesk type that suits technical work'],
      example: 'A web developer bills 42 hours across development, an accessibility review and handover at $95 an hour. The client sees the project, the hours by task and the total, with payment terms beside them.',
    },
    sample: {
      business: { name: 'Jordan Ellis', email: 'hello@jordanellis.dev', phone: '(206) 555-0199', address: '2201 Western Avenue, Apt 7\nSeattle, WA 98121', website: 'jordanellis.dev' },
      client: { name: 'Brightwater Analytics', email: 'finance@brightwater.io', address: '400 Pine Street, Suite 900\nSeattle, WA 98101' },
      project: 'Customer portal redesign',
      terms: 'net14',
      items: [['Front-end development — dashboard and reports', '32', '95'], ['Accessibility review and fixes', '6', '95'], ['Deployment, documentation and handover', '4', '95']],
      payment: 'Bank transfer to Jordan Ellis\nAccount 2093 1180 · Routing 125000024\nor pay online: pay.jordanellis.dev/0042',
      notes: 'Payment within 14 days, please. Late payments may incur a 1.5% monthly fee.',
    },
  }),
  define({
    id: 'consultant',
    slug: 'consultant',
    name: 'Consultant',
    category: 'freelance',
    composition: 'sidebar',
    face: 'serif',
    summary: 'Professional fees and expenses billed separately, each with its own subtotal.',
    table: { desc: 'Description', qty: 'Hours', price: 'Rate' },
    groups: { label: 'Type', options: ['Professional fees', 'Expenses'], fallback: 'Professional fees', subtotals: true },
    labels: { project: 'Engagement' },
    editor: { itemPlaceholder: 'e.g. Operations review, or Travel — Boston' },
    page: {
      title: 'Consultant Invoice Template',
      description: 'A consulting invoice template that separates professional fees from expenses, with hours, rates and the engagement named. Free PDF invoice generator.',
      audience: 'Independent consultants, advisers, coaches and interim executives. Clients’ finance teams usually book fees and expenses to different accounts; this template keeps them in separate, subtotalled sections.',
      features: ['Professional fees and expenses in separate sections with subtotals', 'Hours and hourly rate for fee lines', 'The engagement named in the side column', 'Your details, the client and payment terms in a ruled side column'],
      example: 'An operations consultant bills 34 hours of review and interviews, then travel and printing as expenses. Accounts payable can approve the fees and the reimbursable costs separately without asking for a breakdown.',
    },
    sample: {
      business: { name: 'Ruth Avery Consulting', email: 'ruth@averyconsulting.com', phone: '(617) 555-0178', address: '75 State Street, Suite 1000\nBoston, MA 02109', website: 'averyconsulting.com' },
      client: { name: 'Northgate Health Partners', email: 'ap@northgatehealth.org', address: '1 Kendall Square, Building 300\nCambridge, MA 02139' },
      project: 'Q3 operations review',
      items: [['Operations review and analysis', '24', '225', 'Professional fees'], ['Stakeholder interviews, eight sessions', '10', '225', 'Professional fees'], ['Travel — Boston to Cambridge, two site days', '1', '486.40', 'Expenses'], ['Report printing and binding', '1', '62', 'Expenses']],
      payment: 'Wire to Ruth Avery Consulting LLC\nBeacon Trust · Account 5512 0098 · Routing 011000138',
      notes: 'Receipts for expenses are attached.',
    },
  }),

  // ------------------------------------------------------------------ Business
  define({
    id: 'executive',
    slug: 'executive',
    name: 'Executive',
    category: 'business',
    composition: 'statement',
    face: 'serif',
    style: { nameStyle: 'caps' },
    summary: 'The amount due set as the headline, beneath a spaced-capital letterhead.',
    page: {
      title: 'Executive Invoice Template',
      description: 'An executive invoice template for advisory firms and senior professionals: a formal letterhead with the amount due set as the headline. Free PDF download.',
      audience: 'Advisory firms, law and accounting practices, and senior consultants billing retainers. It looks like formal correspondence and states the amount and the date before anything else.',
      features: ['Business name in widely spaced capitals, like engraved stationery', 'Amount due as the headline, with the due date beneath it', 'Invoice number, dates and engagement in a ruled ledger beside it', 'Remittance details given their own place under the client'],
      example: 'An advisory firm bills a quarterly retainer, a strategy workshop and travel. The partner who receives it sees the amount and the due date first; the detail follows for the finance team.',
    },
    sample: {
      business: { name: 'Ashcombe Advisory', email: 'accounts@ashcombe.com', phone: '+1 212 555 0148', address: '17 East 64th Street\nNew York, NY 10065', website: 'ashcombe.com' },
      client: { name: 'Calder Wynn Partners', email: 'finance@calderwynn.com', address: '55 Hudson Yards, 34th Floor\nNew York, NY 10001' },
      project: 'Board advisory, Q4 2026',
      items: [['Board advisory retainer — October to December', '1', '18000'], ['Strategy workshop with the executive committee', '1', '6500'], ['Travel and accommodation, London', '1', '2140']],
      payment: 'Wire transfer to Ashcombe Advisory LLC\nHudson Bank · Account 3301 2290 7744 · ABA 026009593 · SWIFT HUDSUS33',
      notes: 'With thanks. Questions about this invoice: accounts@ashcombe.com.',
    },
  }),
  define({
    id: 'professional',
    slug: 'small-business',
    name: 'Professional',
    category: 'business',
    composition: 'letterhead',
    face: 'serif',
    style: { meta: 'strip', nameStyle: 'plain' },
    summary: 'A centered letterhead and a ruled strip of invoice facts. The small-business standard.',
    page: {
      title: 'Small Business Invoice Template',
      description: 'A professional small business invoice template with a centered letterhead and a ruled strip of invoice details. Free to fill in online and download as PDF.',
      audience: 'Shops, studios, printers, caterers and other small businesses that invoice other businesses. Every fact an accounts department looks for, the number, dates, terms and amount, sits in one ruled strip.',
      features: ['Centered letterhead with your logo, name and contact line', 'Number, issue date, due date, terms and amount due in a ruled strip', 'Billed to and project side by side', 'A conventional table that any bookkeeper will recognise'],
      example: 'A print shop bills a café for menus, business cards and delivery. The café’s bookkeeper finds the invoice number, due date and total in the same strip on every invoice from the shop.',
    },
    sample: {
      business: { name: 'Hartley & Sons Printing', email: 'orders@hartleyprinting.com', phone: '(503) 555-0123', address: '1830 SE Hawthorne Boulevard\nPortland, OR 97214', website: 'hartleyprinting.com' },
      client: { name: 'Bluebird Café', email: 'owner@bluebirdcafe.com', address: '3412 SE Division Street\nPortland, OR 97202' },
      project: 'Autumn menus and stationery',
      items: [['Menus, 11 × 17 in, heavy uncoated, double-sided', '150', '4.20'], ['Business cards, letterpress, two names', '500', '0.62'], ['Table tent cards', '60', '1.85'], ['Local delivery', '1', '25']],
      adjustments: { taxRate: '', discountType: 'amount', discountValue: '30' },
      payment: 'Pay by card at hartleyprinting.com/pay or by check to Hartley & Sons Printing',
      notes: 'Thank you for your order. Repeat orders keep the same pricing for twelve months.',
    },
  }),
  define({
    id: 'agency',
    slug: 'marketing-agency',
    name: 'Agency',
    category: 'business',
    composition: 'statement',
    face: 'sans',
    density: 'compact',
    style: { nameStyle: 'plain' },
    summary: 'Retainer, production and media spend in separate sections, the total stated up front.',
    groups: { label: 'Section', options: ['Retainer', 'Production', 'Media'], fallback: 'Retainer', subtotals: true },
    labels: { project: 'Campaign' },
    editor: { itemPlaceholder: 'e.g. Monthly retainer — October' },
    page: {
      title: 'Marketing Agency Invoice Template',
      description: 'A marketing agency invoice template that separates retainer, production and media spend, each with a subtotal. Free online invoice generator with PDF export.',
      audience: 'Marketing, PR, social media and creative agencies with monthly retainers and pass-through costs. Clients see the fee, the production costs and the media spend separately, which is how most marketing budgets are managed.',
      features: ['Retainer, production and media sections with subtotals', 'Campaign named beside the invoice details', 'Total due stated at the top in a strong semibold', 'Room for media-buying terms in the notes'],
      example: 'An agency bills October’s retainer, a photography day and paid social spend with its management fee. The client’s marketing lead can reconcile each section against a different budget line.',
    },
    sample: {
      business: { name: 'Field Notes Marketing', email: 'billing@fieldnotes.agency', phone: '(303) 555-0161', address: '1617 Wazee Street, Suite 300\nDenver, CO 80202' },
      client: { name: 'Linden Outdoor Co.', email: 'ap@lindenoutdoor.com', address: '2800 Walnut Street\nDenver, CO 80205' },
      project: 'Autumn 2026 launch',
      items: [['Monthly retainer — October', '1', '7500', 'Retainer'], ['Campaign photography and three 15-second video cuts', '1', '6150', 'Production'], ['Paid social media spend, at cost', '1', '12000', 'Media'], ['Media management fee, 12%', '1', '1440', 'Media']],
      payment: 'ACH to Field Notes Marketing LLC\nFirstBank · Account 1180 4471 · Routing 107005047',
      notes: '',
    },
  }),

  // ------------------------------------------------------------------ Creative
  define({
    id: 'studio',
    slug: 'designer',
    aliases: ['design-studio'],
    name: 'Design Studio',
    category: 'creative',
    composition: 'sidebar',
    face: 'sans',
    summary: 'Numbered project phases with deliverables beneath each, and a fixed fee per phase.',
    table: { desc: 'Phase', price: 'Fee', numbered: true, fixedFee: true, detail: true },
    labels: { paid: 'Deposit received (50%)' },
    editor: { itemPlaceholder: 'Phase name, then deliverables on the next line' },
    page: {
      title: 'Design Studio Invoice Template',
      description: 'A design studio invoice template organised by numbered project phases, with deliverables and revisions listed under each fee. Free invoice maker with PDF.',
      audience: 'Brand, graphic, interior and web design studios that price by phase rather than by the hour. Each phase is numbered, and its deliverables and included revisions are listed beneath it, so the client can see exactly what the fee covers.',
      features: ['Numbered phases, with the deliverables for each printed beneath it', 'Quantity and unit columns disappear when every phase is a fixed fee', 'Deposit received and balance due', 'Studio details and payment in a ruled side column'],
      example: 'A studio bills discovery, identity design, packaging and guidelines for a brewery, less the 50% deposit taken at the start. The client sees four phases, what each delivered, and the balance left to pay.',
    },
    sample: {
      business: { name: 'Atelier Wren', email: 'studio@atelierwren.com', phone: '(512) 555-0117', address: '1100 East 6th Street, Unit 4\nAustin, TX 78702', website: 'atelierwren.com' },
      client: { name: 'Moss & Vale Brewing', email: 'hello@mossandvale.com', address: '4500 Burleson Road\nAustin, TX 78744' },
      project: 'Brand identity and packaging',
      items: [['Discovery\nResearch, stakeholder workshop and written brief', '1', '1800'], ['Identity design\nWordmark, colour and type system; two rounds of revisions', '1', '4200'], ['Packaging\nCan labels for three core beers, print-ready files', '1', '3600'], ['Guidelines\n24-page brand standards and master artwork', '1', '1400']],
      adjustments: { paid: '5500' },
      payment: 'Bank transfer to Atelier Wren LLC\nAccount 4410 2287 · Routing 114000093',
      notes: 'Final files are released on receipt of the balance.',
    },
  }),
  define({
    id: 'photographer',
    slug: 'photographer',
    name: 'Photographer',
    category: 'creative',
    composition: 'letterhead',
    face: 'serif',
    style: { meta: 'line', nameStyle: 'italic' },
    summary: 'An italic serif letterhead and a package list: session, prints, editing and travel.',
    table: { desc: 'Package', detail: true },
    groups: { label: 'Section', options: ['Session', 'Prints & albums', 'Editing', 'Travel', 'Additional services'], fallback: 'Session', subtotals: false },
    labels: { project: 'Shoot' },
    editor: { itemPlaceholder: 'e.g. Wedding coverage — 8 hours, then details' },
    page: {
      title: 'Photography Invoice Template',
      description: 'A photography invoice template for sessions, packages, editing, prints and travel, with a deposit and balance due. Free online photographer invoice with PDF.',
      audience: 'Wedding, portrait, event and commercial photographers. Sessions, prints, editing and travel are listed in their own sections, and the deposit taken at booking is subtracted to show the balance due.',
      features: ['Session, prints and albums, editing, travel and additional services sections', 'Each package printed with its details on the line beneath', 'Shoot date or name set in the header line', 'Deposit received and balance due'],
      example: 'A wedding photographer bills a full day with two photographers, a fine-art album and travel to the venue, less the deposit taken at booking. The couple sees what they booked, what they added and what remains to pay.',
    },
    sample: {
      business: { name: 'Clara Bell Photography', email: 'studio@clarabell.photo', phone: '(707) 555-0136', address: '220 Spring Street\nSt. Helena, CA 94574', website: 'clarabell.photo' },
      client: { name: 'Emma & Daniel Hart', email: 'emma.hart@example.com', address: '1880 Jackson Street, Apt 5\nSan Francisco, CA 94109' },
      project: 'Wedding — Saturday, September 12',
      items: [['Wedding day coverage\nEight hours, two photographers, online gallery', '1', '3800', 'Session'], ['Fine-art album\n12 × 12 in, 40 pages, linen cover', '1', '680', 'Prints & albums'], ['Travel — Napa Valley', '1', '220', 'Travel']],
      adjustments: { paid: '1000' },
      payment: 'Pay online at clarabell.photo/pay, or by check to Clara Bell Photography',
      notes: 'It was a joy to photograph your day. Your album proofs follow within three weeks.',
    },
  }),

  define({
    id: 'video',
    slug: 'videographer',
    name: 'Video Production',
    category: 'creative',
    composition: 'title',
    face: 'serif',
    summary: 'Pre-production, filming and post in their own sections, each deliverable described beneath.',
    table: { desc: 'Deliverable', detail: true },
    groups: { label: 'Stage', options: ['Pre-production', 'Production', 'Post-production', 'Licensing', 'Travel'], fallback: 'Production', subtotals: false },
    labels: { project: 'Production' },
    editor: { itemPlaceholder: 'e.g. Filming day, then the crew and kit on the next line' },
    page: {
      title: 'Videographer Invoice Template',
      description: 'A videographer invoice template with pre-production, filming, editing and music licensing in separate sections, plus deposit and balance due.',
      audience: 'Videographers, video producers and small production companies billing by stage of a production.',
      features: ['Pre-production, production, post-production, licensing and travel sections', 'Each deliverable described on the line beneath it', 'The production named under the title', 'Deposit received and balance due'],
      example: 'A production company bills a brand film: scripting and a location scout, one filming day, the edit and colour grade, three social cut-downs and a licensed music track, less the booking deposit.',
    },
    sample: {
      business: { name: 'Lantern Films', email: 'hello@lanternfilms.co', phone: '(615) 555-0124', address: '1205 Division Street, Studio 3\nNashville, TN 37203', website: 'lanternfilms.co' },
      client: { name: 'Crestline Coffee Roasters', email: 'marketing@crestlinecoffee.com', address: '640 Fogg Street\nNashville, TN 37203' },
      project: 'Brand film and social cut-downs',
      items: [['Pre-production\nConcept, script, shot list and location scout', '1', '1200', 'Pre-production'], ['Filming day\nDirector, camera operator, two-camera kit and lighting', '1', '2800', 'Production'], ['Edit and color grade\nTwo-minute brand film, two rounds of revisions', '1', '2400', 'Post-production'], ['Social cut-downs\nThree 15-second vertical edits', '3', '250', 'Post-production'], ['Licensed music track\nWeb and social license, one track', '1', '180', 'Licensing']],
      adjustments: { paid: '3000' },
      payment: 'Bank transfer to Lantern Films LLC\nAccount 3308 1942 · Routing 064000017',
      notes: 'Final files are delivered by download link when the balance is paid.',
    },
  }),

  // ------------------------------------------------------------------ Trades
  define({
    id: 'contractor',
    slug: 'contractor',
    name: 'Contractor',
    category: 'trades',
    composition: 'ledger',
    face: 'sans',
    density: 'compact',
    summary: 'Labor, materials and equipment in ruled sections, with deposit and balance due.',
    groups: { label: 'Type', options: ['Labor', 'Materials', 'Equipment'], fallback: 'Labor', subtotals: true },
    labels: { project: 'Project', paid: 'Less deposit received' },
    editor: { itemPlaceholder: 'e.g. Cabinet installation, or Maple cabinet set' },
    page: {
      title: 'Contractor Invoice Template',
      description: 'A contractor invoice template with separate labor, materials and equipment sections, quantities, tax, deposit and balance due. Free to fill in online and download as PDF.',
      audience: 'Carpenters, plumbers, electricians, remodelers and general contractors. Homeowners and property managers expect to see labor and materials separately; this template subtotals each and subtracts the deposit you took up front.',
      features: ['Labor, materials and equipment sections, each subtotalled', 'Quantities for hours, square feet or units', 'Project and job site in their own box', 'Deposit received and balance due, stated plainly'],
      example: 'A carpentry company bills a kitchen renovation: demolition and installation hours, then cabinets and a quartz countertop, with sales tax and the deposit taken at signing. The homeowner sees labor and materials subtotalled separately, and the remaining balance.',
    },
    sample: {
      business: { name: 'Ridgeline Carpentry LLC', email: 'office@ridgelinecarpentry.com', phone: '(720) 555-0102', address: '6400 West 44th Avenue\nWheat Ridge, CO 80033', taxId: 'CO Contractor Lic. 2024-55120' },
      client: { name: 'Sam & Priya Desai', email: 'priya.desai@example.com', address: '14 Alder Lane\nGolden, CO 80401' },
      project: 'Kitchen renovation — 14 Alder Lane',
      terms: 'net15',
      items: [['Demolition and removal of existing cabinets', '16', '65', 'Labor'], ['Cabinet installation and trim', '24', '65', 'Labor'], ['Maple shaker cabinet set, 14 units', '1', '4850', 'Materials'], ['Quartz countertop, sq ft', '32', '78', 'Materials']],
      adjustments: { taxRate: '4.1', taxLabel: 'Sales tax', paid: '3000' },
      payment: 'Check to Ridgeline Carpentry LLC, or Zelle',
      notes: 'One-year workmanship warranty from completion.',
    },
  }),
  define({
    id: 'construction',
    slug: 'construction',
    name: 'Construction',
    category: 'trades',
    composition: 'ledger',
    face: 'sans',
    density: 'compact',
    style: { grid: true },
    summary: 'A dense ruled grid for materials, labor, equipment and subcontractors on a job.',
    table: { price: 'Unit cost' },
    groups: { label: 'Cost code', options: ['Materials', 'Labor', 'Equipment', 'Subcontractors'], fallback: 'Materials', subtotals: true },
    labels: { project: 'Job / site', paid: 'Less previous payments', due: 'Amount due this period' },
    editor: { itemPlaceholder: 'e.g. Drywall, 5/8 in sheets' },
    page: {
      title: 'Construction Invoice Template',
      description: 'A construction invoice template with a ruled grid for materials, labor, equipment and subcontractors, job details and progress payments. Free PDF invoice generator.',
      audience: 'Builders, general contractors and fit-out companies billing commercial clients. The full grid survives photocopying and scanning, every cost code has a subtotal, and previous payments are deducted to show the amount due this period.',
      features: ['Full ruled grid, legible even after scanning', 'Materials, labor, equipment and subcontractor sections, each subtotalled', 'Job and site in a dedicated box', 'Previous payments deducted for progress billing'],
      example: 'A builder bills the second of four progress payments on an apartment fit-out: lumber and drywall, a framing crew and electrical rough-in by a subcontractor, less the first payment. The property manager can check each cost code against the contract.',
    },
    sample: {
      business: { name: 'Hollis Building Co.', email: 'billing@hollisbuilding.com', phone: '(212) 555-0175', address: '45 Main Street, Suite 820\nBrooklyn, NY 11201', website: 'hollisbuilding.com', taxId: 'NYC Lic. GC-0618834' },
      client: { name: 'Oakmont Property Group', email: 'payables@oakmontpg.com', address: '220 Mercer Street, Management Office\nNew York, NY 10012' },
      project: 'Unit 4B fit-out, 220 Mercer Street — progress billing 2 of 4',
      number: 'HB-2026-118',
      items: [['Framing lumber, 2 × 4 and 2 × 6, delivered', '1', '3240', 'Materials'], ['Drywall, 5/8 in, 4 × 8 sheets', '120', '18.50', 'Materials'], ['Framing crew, hours', '96', '58', 'Labor'], ['Electrical rough-in — Volt & Wire Inc.', '1', '6800', 'Subcontractors']],
      adjustments: { paid: '9500' },
      payment: 'ACH to Hollis Building Co. · Account 6650 1123 · Routing 021000089\nPlease reference the job number.',
      notes: 'Lien waiver for this period enclosed.',
    },
  }),
  define({
    id: 'services',
    slug: 'landscaper',
    aliases: ['home-services'],
    name: 'Home Services',
    category: 'trades',
    composition: 'minimal',
    face: 'sans',
    density: 'compact',
    summary: 'A compact, one-column invoice for visits and recurring services at an address.',
    table: { desc: 'Service', qty: 'Visits', price: 'Rate' },
    labels: { project: 'Service address' },
    editor: { itemPlaceholder: 'e.g. Weekly lawn care — October' },
    page: {
      title: 'Cleaning & Landscaping Invoice Template',
      description: 'A home services invoice template for cleaning, landscaping and maintenance: visits, rates, service address and materials. Free to fill in online and download as PDF.',
      audience: 'Cleaners, gardeners, landscapers, pool and window services: any business that visits a client’s home on a schedule. The service address is printed at the top and work is counted in visits, so a month of service fits on one compact page.',
      features: ['Service address printed beside the client', 'Visits × rate columns for recurring work', 'Compact type that fits a month on one page', 'Room for access notes and the next scheduled visit'],
      example: 'A lawn and garden company bills a month of weekly mowing, hedge trimming, two leaf clear-ups and mulch. The homeowner sees each visit type, the address and the total.',
    },
    sample: {
      business: { name: 'Evergreen Lawn & Garden', email: 'hello@evergreenlawn.com', phone: '(650) 555-0129', address: '920 Industrial Avenue\nPalo Alto, CA 94303', website: 'evergreenlawn.com' },
      client: { name: 'Margaret Chen', email: 'm.chen@example.com', address: '42 Willow Court\nPalo Alto, CA 94301' },
      project: '42 Willow Court, Palo Alto',
      terms: 'receipt',
      items: [['Weekly lawn care — October', '4', '85'], ['Hedge trimming, front and side', '1', '140'], ['Leaf removal', '2', '95'], ['Bark mulch, cubic yards', '3', '48']],
      payment: 'Pay by card at evergreenlawn.com/pay, Zelle to hello@evergreenlawn.com, or check.',
      notes: 'Next visit: Tuesday, November 3. Gate code on file.',
    },
  }),
  define({
    id: 'mechanic',
    slug: 'mechanic',
    name: 'Auto Repair',
    category: 'trades',
    composition: 'ledger',
    face: 'sans',
    density: 'compact',
    summary: 'Parts, labor and shop fees in ruled sections, with the vehicle named at the top.',
    table: { qty: 'Qty / hrs' },
    groups: { label: 'Type', options: ['Parts', 'Labor', 'Shop fees'], fallback: 'Parts', subtotals: true },
    labels: { project: 'Vehicle' },
    editor: { itemPlaceholder: 'e.g. Front brake pads, or Brake service (labor hours)' },
    page: {
      title: 'Mechanic Invoice Template',
      description: 'An auto repair invoice template with parts, labor hours and shop fees in separate sections, and the vehicle, VIN and mileage at the top.',
      audience: 'Independent garages, mobile mechanics and specialist repair shops.',
      features: ['Parts, labor and shop fee sections, each subtotalled', 'Vehicle, VIN and mileage in their own box', 'Labor billed in hours at the shop rate', 'Repair-order style numbering'],
      example: 'A garage bills a front brake job: pads and rotors, 2.6 hours of labor and shop supplies, due when the car is collected.',
    },
    sample: {
      business: { name: 'Delgado Auto Repair', email: 'service@delgadoauto.com', phone: '(480) 555-0158', address: '2215 East Apache Boulevard\nTempe, AZ 85281', website: 'delgadoauto.com' },
      client: { name: 'Kevin Marsh', email: 'kmarsh@example.com', address: '918 West 5th Street\nTempe, AZ 85281' },
      project: '2019 Honda CR-V EX · VIN 5J6RW2H5XKL004417 · 68,412 miles',
      number: 'RO-10583',
      terms: 'receipt',
      items: [['Front brake pads, ceramic', '1', '89.95', 'Parts'], ['Front brake rotors', '2', '74.50', 'Parts'], ['Front brake service, pads and rotors', '1.8', '135', 'Labor'], ['Brake fluid flush', '0.8', '135', 'Labor'], ['Shop supplies and disposal', '1', '18.50', 'Shop fees']],
      payment: 'Card, cash or check at collection.',
      notes: 'Parts carry a 12-month / 12,000-mile warranty. Old parts available on request.',
    },
  }),
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
const BY_SLUG = new Map(TEMPLATES.flatMap((t) => [t.slug, ...(t.aliases || [])].map((s) => [s, t])));

/** The template for an id; unknown ids fall back to Classic so an invoice always renders. */
export const templateById = (id) => BY_ID.get(id) || BY_ID.get('classic');
/** By page slug or a former slug. */
export const templateBySlug = (slug) => BY_SLUG.get(slug) || null;
export const hasTemplate = (id) => BY_ID.has(id);
export const categoryLabel = (id) => (CATEGORIES.find((c) => c.id === id) || {}).label || '';
