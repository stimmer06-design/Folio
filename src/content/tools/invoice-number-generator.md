---
name: Invoice number generator
title: Invoice Number Generator
description: Free invoice number generator: choose a prefix, the year, a separator and zero padding, see your next numbers, and start an invoice with the first one.
summary: Choose a prefix, the year and the number of digits, see your next invoice numbers, and start an invoice with the first.
lead: Choose a format, see your next invoice numbers, and open the generator with the first one filled in. Every invoice after it continues the sequence.
updated: 2026-10-01
relatedTemplates: small-business, construction, mechanic
relatedGuides: how-to-number-invoices, what-to-put-on-an-invoice, how-to-make-an-invoice
relatedTools: invoice-tax-calculator
---
## How the number is built

An invoice number in this tool has up to three parts, joined by the separator you choose:

| Part | Example | What it is for |
| --- | --- | --- |
| Prefix | INV | Makes invoices easy to recognize in email and file names |
| Date | 2026 | Shows the year (or year and month) an invoice belongs to |
| Sequence | 0042 | The running number that makes each invoice unique |

So a prefix of INV, the year, a hyphen and four digits gives **INV-2026-0042**. Leave the prefix empty and choose no date for a plain **0042**.

The sequence is padded with zeros to the number of digits you choose, so that invoices sort in the right order in folders and spreadsheets: INV-0009 comes before INV-0010, where INV-9 would sort after INV-10.

## Choosing a format

- **Just starting?** INV-0001 is enough. You can add the year later, at the start of a new year.
- **Many invoices a year?** INV-2026-0001 keeps each year’s invoices together and easy to find.
- **A trade with its own convention?** Use it: RO-10583 for repair orders, or your initials.

Whatever you choose, keep the two rules: every number unique, and each one following the last. [How to number invoices](/invoice-guides/how-to-number-invoices/) explains why, and what to do with cancelled invoices.

## What happens next

Use this number in your invoice opens the invoice generator with a new invoice carrying that number. From then on the generator suggests each next number for you: it finds the highest number among your saved invoices and adds one, keeping your prefix, date and zero padding. Your saved invoices are not changed.

If you include a year and want to restart the sequence each January, change the first invoice of the new year by hand (INV-2027-0001); the generator continues from there.

## Frequently asked questions

### What should my first invoice number be?

Any number, as long as the ones after it continue in sequence. Many businesses start at 0001; some start at 1001 so a new client doesn’t see invoice number 1. Both are fine.

### Should I include the date in invoice numbers?

It is optional. A year makes invoices easy to find and lets you restart the sequence each year without repeating a number. Year and month is only worth it at high volume.

### Can I use letters and numbers together?

Yes. A prefix of letters and a number padded with zeros is the most common format. Avoid characters that cause trouble in file names, such as slashes, if you name PDFs after the invoice number.

### Is anything I type here saved or sent?

No. The tool runs in your browser and sends nothing. The number reaches the generator only when you choose to use it.
