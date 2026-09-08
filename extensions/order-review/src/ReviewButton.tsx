import { useEffect, useState } from "preact/hooks";
type Props = {
  orderId?: string;
  checkoutToken?: string;
  appUrl: string;
  sessionToken: { get(): Promise<string> };
};
type Result = { status: string; reviews: { title: string; path: string }[] };

export function ReviewButton({
  orderId,
  checkoutToken,
  appUrl,
  sessionToken,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setResult(null);
    setError("");
  }, [orderId, checkoutToken, appUrl]);
  let origin = "";
  try {
    const url = new URL(appUrl);
    if (url.protocol === "https:" && !url.username && !url.password)
      origin = url.origin;
  } catch {
    /* The merchant has not configured the app URL yet. */
  }

  async function loadReviews() {
    if (!orderId || !origin || busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await sessionToken.get();
      const body = new URLSearchParams({ orderId });
      if (checkoutToken) body.set("checkoutToken", checkoutToken);
      const response = await fetch(`${origin}/api/order-reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) throw new Error("Request failed");
      const data: Result = await response.json();
      if (!Array.isArray(data.reviews)) throw new Error("Invalid response");
      setResult(data);
    } catch {
      setError("We couldn't open your reviews. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-stack gap="base">
      <s-heading>Review your purchase</s-heading>
      <s-text>
        Share your experience and verify with your Orb-backed World ID.
      </s-text>
      {!origin ? (
        <s-text>Reviews are being set up by the store.</s-text>
      ) : (
        <>
          <s-button
            disabled={!orderId || busy}
            loading={busy}
            onClick={loadReviews}
          >
            Write a review
          </s-button>
          {result?.status === "waiting" && (
            <s-text>
              Reviews open after fulfillment and the store&apos;s review waiting
              period. If you already reviewed your items, thank you! Return to
              this order page to check again.
            </s-text>
          )}
          {result?.status === "unavailable" && (
            <s-text>
              Reviews are unavailable for this order. Try opening it from your
              customer account.
            </s-text>
          )}
          {result?.reviews
            .filter((r) => /^\/review\/[a-f0-9]{64}$/.test(r.path))
            .map((r) => (
              <s-button
                key={r.path}
                href={`${origin}${r.path}`}
                target="_blank"
              >
                Review {r.title}
              </s-button>
            ))}
          {error && <s-text>{error}</s-text>}
        </>
      )}
    </s-stack>
  );
}
