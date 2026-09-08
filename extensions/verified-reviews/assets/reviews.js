(() => {
  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function mount(root) {
    if (root.dataset.loaded) return;
    root.dataset.loaded = "true";
    const status = root.querySelector(".world-reviews__status"),
      list = root.querySelector(".world-reviews__list");
    try {
      const base = window.Shopify?.routes?.root || "/";
      const response = await fetch(
        `${base}apps/world-reviews?product=${encodeURIComponent(root.dataset.product)}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error("Unavailable");
      const { reviews } = await response.json();
      status.textContent = reviews.length
        ? `${reviews.length} recent review${reviews.length === 1 ? "" : "s"}`
        : "No reviews yet. Purchased this product? Look out for your review invitation.";
      for (const r of reviews) {
        const card = element("article", "", "world-reviews__card");
        const stars = element(
          "p",
          `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`,
          "world-reviews__stars",
        );
        stars.setAttribute("aria-label", `${r.rating} out of 5 stars`);
        card.append(stars);
        card.append(element("h3", r.title), element("p", r.body));
        const badges = element("div", "", "world-reviews__badges");
        if (r.purchaser) badges.append(element("span", "✓ Verified purchaser"));
        if (r.worldVerified)
          badges.append(element("span", "◎ Verified unique human"));
        card.append(badges);
        if (r.reply)
          card.append(
            element("p", `Store reply: ${r.reply}`, "world-reviews__reply"),
          );
        list.append(card);
      }
    } catch {
      status.textContent =
        "Reviews are temporarily unavailable. Please try again later.";
    }
  }
  function init() {
    document.querySelectorAll("[data-world-reviews]").forEach(mount);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
  document.addEventListener("shopify:section:load", init);
})();
