---
name: Invoice tax calculator
title: Invoice Tax Calculator
description: Free invoice tax calculator: enter a price, discount, tax rate, shipping and deposit to get the subtotal, tax, total and balance due, then create the invoice.
summary: Price, discount, tax, shipping and deposit in; subtotal, tax, total and balance due out, exactly as the invoice will show them.
lead: Enter the price, any discount, your tax rate, shipping and deposit. You get the totals exactly as the invoice will show them, then open a new invoice with the same numbers.
updated: 2026-10-01
relatedTemplates: contractor, consultant, small-business
relatedGuides: how-to-make-an-invoice, what-to-put-on-an-invoice, invoice-vs-receipt
relatedTools: sales-tax-calculator
---
## How it is calculated

This calculator uses the same code as Folio’s invoice generator, so the totals here are exactly the totals your invoice will show. The order of the steps matters:

| Step | Calculation |
| --- | --- |
| Line total | Quantity × price before tax |
| Subtotal | The sum of the lines |
| Discount | A percentage of the subtotal, or a fixed amount, never more than the subtotal |
| Tax | Tax rate × (subtotal − discount) |
| Shipping or other charge | Added after tax, and not taxed |
| Total | Subtotal − discount + tax + shipping |
| Balance due | Total − deposit already paid |

Each amount is rounded to the currency’s smallest unit (cents for dollars, none for yen) at each step, the way an accountant would.

## A worked example

A designer bills a project at $2,400 with a 10% discount, in a place where the sales tax rate is 8.25%, plus $40 for printed proofs sent by courier, and has already taken a $500 deposit:

| Line | Amount |
| --- | --- |
| Subtotal | $2,400.00 |
| Discount (10%) | −$240.00 |
| Sales tax (8.25% of $2,160.00) | $178.20 |
| Shipping | $40.00 |
| Total | $2,378.20 |
| Deposit received | −$500.00 |
| Balance due | $1,878.20 |

The tax rate in this example is only an illustration. Use the rate that applies to your sale.

## Why tax comes after the discount

A discount lowers the price of the sale, and sales taxes and VAT are normally charged on the price actually charged. Taking 10% off a $2,400 invoice makes the taxable amount $2,160, not $2,400. If you offer a discount for early payment that the client may or may not take, the rules can differ; ask an accountant.

## Why shipping is not taxed here

Folio adds the separate charge after tax, which suits pass-through costs such as permit fees and many shipping charges. Some states and countries do tax shipping, or tax it in some circumstances. If yours does, add the shipping as a line item instead, so it is included in the taxable subtotal.

## Your rate, not a guess

The calculator doesn’t suggest a tax rate. Sales tax in the US varies by state, county and city, and by what you sell; VAT and GST rates vary by country and by product. Enter the rate that applies to your sale, which your tax authority or accountant can confirm. To add tax to a single price, or take it out of a tax-inclusive one, use the [sales tax calculator](/tools/sales-tax-calculator/).

## Frequently asked questions

### Is a deposit taxed?

The tax is calculated on the whole sale; the deposit is a part payment towards the total, including tax. That is why the deposit is subtracted after the total here. Tax timing rules for deposits differ between countries, so ask an accountant if you are registered for VAT or GST.

### Can I use this for VAT or GST?

Yes. Change the tax name to VAT or GST and enter the rate. The arithmetic is the same.

### What happens when I create the invoice?

A new invoice opens in the generator with one line at your price and quantity, your discount, tax, shipping and deposit. Add your client and a description, and the totals will match this page. Your other invoices are not changed.

### Is anything I enter sent anywhere?

No. The calculator runs in your browser and nothing is sent or stored.
