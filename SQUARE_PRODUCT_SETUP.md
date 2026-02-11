# Square Product Setup (3-8 People Selector)

Use this with the website group-size selector in `index.html`.

## 1) Create Product + Price in Square

1. In Square Dashboard, create an item named something like:
   - `Private Felting Session (Per Person)`
2. Set a fixed per-person price (example: `$95.00`).
3. This is your single per-person product.

## 2) Create One Payment Link

1. Create a Square Payment Link for that item.
2. Use your real website thank-you page as the post-payment destination:
   - `https://paulgradie.com/moms-website/thanks.html`
3. Copy the Payment Link URL.

## 3) Update Website Config

In `index.html`, update this block:

```html
<div
  class="checkout-config"
  data-price-per-person="95"
  data-square-link="https://square.link/u/REPLACE_WITH_YOUR_LINK"
>
```

Update:

1. `data-price-per-person` with your real per-person amount.
2. `data-square-link` with your Square Payment Link URL.

## 4) Important Behavior

1. The website selector shows a live estimate for 3-8 attendees.
2. On submit, customers are redirected to your Square checkout link.
3. The selected group size is passed in URL params (`party_size`, UTM tags) for tracking.
4. If you need strict server-side quantity enforcement later, we can generate dynamic checkout links via backend.
