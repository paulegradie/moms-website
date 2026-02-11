# Stripe Product Setup (3-8 People Selector)

Use this flow with the website's new group-size selector in `index.html`.

## 1) Create Product + Price in Stripe

1. In Stripe Dashboard, create a product named something like:
   - `Private Felting Session (Per Person)`
2. Add a one-time price in USD (example: `$95.00`).
3. Keep this as the single per-person price.

## 2) Create One Payment Link

1. Create a Payment Link using the per-person price above.
2. Enable quantity so checkout total becomes:
   - `quantity x per-person-price`
3. Set quantity constraints:
   - Minimum: `3`
   - Maximum: `8`
4. Set success URL to your deployed thank-you page:
   - `https://paulgradie.com/moms-website/thanks.html`

## 3) Update Website Config

In `index.html`, find the package section wrapper:

```html
<div
  class="checkout-config"
  data-price-per-person="95"
  data-stripe-link="https://buy.stripe.com/REPLACE_WITH_YOUR_LINK"
>
```

Update:

1. `data-price-per-person` to your real per-person amount.
2. `data-stripe-link` to your Stripe Payment Link URL.

## 4) Notes on Quantity

1. The website selector gives customers an instant estimate for 3-8 people.
2. Stripe checkout handles final quantity pricing and payment.
3. The selected size is passed via UTM campaign tag for analytics/reconciliation.
