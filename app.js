const revealItems = [...document.querySelectorAll(".reveal")];

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index * 90, 320)}ms`;
  observer.observe(item);
});

const checkoutRoot = document.querySelector(".checkout-config");
const checkoutForm = document.querySelector("#group-checkout-form");
const partySizeSelect = document.querySelector("#party-size");
const perPersonPriceEl = document.querySelector("#per-person-price");
const estimatedTotalEl = document.querySelector("#estimated-total");

if (checkoutRoot && checkoutForm && partySizeSelect && perPersonPriceEl && estimatedTotalEl) {
  const rawPrice = Number(checkoutRoot.getAttribute("data-price-per-person"));
  const perPersonPrice = Number.isFinite(rawPrice) ? rawPrice : 95;
  const stripeLink = checkoutRoot.getAttribute("data-stripe-link") ?? "";
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

  const updateEstimate = () => {
    const partySize = Number(partySizeSelect.value);
    const total = perPersonPrice * partySize;
    perPersonPriceEl.textContent = currencyFormatter.format(perPersonPrice);
    estimatedTotalEl.textContent = currencyFormatter.format(total);
  };

  updateEstimate();
  partySizeSelect.addEventListener("change", updateEstimate);

  checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!stripeLink || stripeLink.includes("REPLACE_WITH_YOUR_LINK")) {
      alert("Add your Stripe payment link in the package section before checkout.");
      return;
    }

    const partySize = Number(partySizeSelect.value);
    const checkoutUrl = new URL(stripeLink);
    checkoutUrl.searchParams.set("utm_source", "wool-and-wonder-website");
    checkoutUrl.searchParams.set("utm_medium", "group-checkout");
    checkoutUrl.searchParams.set("utm_campaign", `group_size_${partySize}`);

    window.location.href = checkoutUrl.toString();
  });
}
