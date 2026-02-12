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

const bookingRoot = document.querySelector(".booking-layout");
const bookingButton = document.querySelector("#square-booking-btn");

if (bookingRoot && bookingButton) {
  const configuredUrl = bookingRoot.getAttribute("data-square-booking-url") ?? "";
  const configuredPlaceholder = configuredUrl.includes("REPLACE_WITH_YOUR_SITE");

  if (configuredUrl && !configuredPlaceholder) {
    bookingButton.setAttribute("href", configuredUrl);
  }

  bookingButton.addEventListener("click", (event) => {
    const activeHref = bookingButton.getAttribute("href") ?? "";
    const activePlaceholder = activeHref.includes("REPLACE_WITH_YOUR_SITE");
    if (!activeHref || configuredPlaceholder || activePlaceholder) {
      event.preventDefault();
      alert("Add your Square Appointments booking URL in the booking section before going live.");
      return;
    }

    try {
      const bookingUrl = new URL(activeHref);
      bookingUrl.searchParams.set("utm_source", "wool-and-wonder-website");
      bookingUrl.searchParams.set("utm_medium", "square-appointments");
      bookingUrl.searchParams.set("utm_campaign", "live-booking");
      bookingButton.setAttribute("href", bookingUrl.toString());
    } catch {
      event.preventDefault();
      alert("Square booking URL is invalid. Update the booking section link.");
    }
  });
}
