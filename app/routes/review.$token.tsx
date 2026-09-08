import { useRef, useState, useSyncExternalStore } from "react";
import {
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
  IDKitRequestWidget,
  proofOfHuman,
  selfieCheckLegacy,
} from "@worldcoin/idkit";
import { invitation } from "../services/reviews.server";
import {
  challenge,
  verificationMode,
  verificationCredential,
} from "../services/world.server";
import { privateHeaders } from "../services/http.server";
import "../styles/reviewer.css";
export const headers = () => privateHeaders;
export async function loader({ params }: LoaderFunctionArgs) {
  try {
    const i = await invitation(params.token || "");
    return {
      product: i.product.title,
      shop: i.merchant.shop,
      requireWorld: i.merchant.requireWorld,
      mode: verificationMode(),
      credential: verificationCredential(),
    };
  } catch {
    throw new Response(
      "This invitation is invalid, expired, not yet ready, or already used.",
      { status: 404, headers: privateHeaders },
    );
  }
}
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

type Challenge = ReturnType<typeof challenge> & { action: string };
export default function Reviewer() {
  const d = useLoaderData<typeof loader>(),
    form = useRef<HTMLFormElement>(null),
    started = useRef(false),
    [c, setC] = useState<Challenge | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState<{ status: string; mock: boolean } | null>(null),
    [human, setHuman] = useState("demo-human-one"),
    hydrated = useSyncExternalStore(
      subscribeToHydration,
      clientReady,
      serverReady,
    );
  async function post(body: FormData) {
    const r = await fetch(
      window.location.pathname.replace("/review/", "/api/review/"),
      { method: "POST", body },
    );
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Request failed");
    return result;
  }
  async function save(proof?: unknown) {
    const body = new FormData(form.current!);
    body.set("intent", "submit");
    if (proof) body.set("proof", JSON.stringify(proof));
    const result = await post(body);
    setDone(result);
  }
  async function begin() {
    if (!form.current?.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set("intent", "challenge");
      const next = await post(f);
      setC(next);
      if (next.mode === "mock")
        await save({ mockHuman: human, nonce: next.nonce });
      else setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="wvr-page">
      <header className="wvr-brand">
        <span className="wvr-mark" aria-hidden="true">
          ◎
        </span>{" "}
        World Verified Reviews{" "}
        <span className="wvr-label">REAL PEOPLE. HONEST REVIEWS.</span>
      </header>
      <div className="wvr-layout">
        <section className="wvr-intro">
          <span className="wvr-eyebrow">YOUR EXPERIENCE MATTERS</span>
          <h1>
            A real review.
            <br />
            From a real human.
          </h1>
          <p>You tried it. Tell the next person what you think.</p>
          <div className="wvr-product">
            <span>YOUR PURCHASE FROM {d.shop}</span>
            <h2>{d.product}</h2>
            <p>✓ Linked to a fulfilled order</p>
          </div>
          <div className="wvr-privacy">
            <h3>Your identity stays yours.</h3>
            <p>
              The store does not receive your World ID, biometrics, or
              real-world identity through verification. We retain only the
              outcome and a store-and-product-scoped duplicate-prevention value.
            </p>
            <p>
              {d.credential === "selfie"
                ? "World Selfie Check checks liveness and facial similarity in World App. It does not guarantee one person per account or that a review is true."
                : "The badge confirms a unique human, not that the review is factually true."}
            </p>
          </div>
        </section>
        <section className="wvr-card">
          {done ? (
            <div role="status">
              <span className="wvr-eyebrow">THANK YOU FOR SHARING</span>
              <h2>
                {done.mock
                  ? "Test review saved."
                  : done.status === "published"
                    ? "Your review is live."
                    : "Your review is submitted."}
              </h2>
              <p>
                {done.mock
                  ? "This used a development mock. It is not real verification and cannot appear on the storefront."
                  : done.status === "published"
                    ? "Your experience can now help the next customer."
                    : "The store will review it before publication."}
              </p>
            </div>
          ) : (
            <>
              <div className="wvr-card-heading">
                <h2>How was your purchase?</h2>
                <span>About 2 minutes</span>
              </div>
              {d.mode === "mock" && (
                <div className="wvr-warning" role="note">
                  <strong>DEVELOPMENT MOCK · NOT WORLD VERIFICATION</strong>
                  <p>
                    This test review stays private and cannot receive a verified
                    badge.
                    {d.credential === "selfie" &&
                      " The real Selfie Check camera flow is not active: World app credentials and Selfie Check access are required."}
                  </p>
                </div>
              )}
              <form
                method="post"
                ref={form}
                onFocus={() => {
                  if (!started.current) {
                    started.current = true;
                    const body = new FormData();
                    body.set("intent", "start");
                    void post(body).catch(() => {
                      started.current = false;
                    });
                  }
                }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void begin();
                }}
              >
                <noscript>
                  Enable JavaScript to submit this secure review form.
                </noscript>
                <fieldset>
                  <legend>Your rating</legend>
                  <div className="wvr-stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n}>
                        <input type="radio" name="rating" value={n} required />
                        <span>{n} ★</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="wvr-field">
                  Review title
                  <input
                    name="title"
                    placeholder="The short version"
                    required
                    minLength={3}
                    maxLength={120}
                  />
                </label>
                <label className="wvr-field">
                  Your honest experience
                  <textarea
                    name="body"
                    placeholder="What worked well? What could be better?"
                    rows={5}
                    required
                    minLength={10}
                    maxLength={5000}
                  />
                </label>
                <p className="wvr-note">
                  Your title and review will be public if published. Please
                  leave out names, emails, and other personal details. Every
                  rating is welcome.
                </p>
                {d.mode === "mock" && (
                  <label className="wvr-field">
                    Test human label
                    <input
                      value={human}
                      onChange={(e) => setHuman(e.target.value)}
                      minLength={3}
                      maxLength={80}
                    />
                    <small>
                      Reuse this label to test duplicate prevention.
                    </small>
                  </label>
                )}
                {error && (
                  <p className="wvr-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="wvr-primary"
                  disabled={!hydrated || busy || open}
                  type="submit"
                >
                  {!hydrated
                    ? "Loading secure form…"
                    : busy
                      ? "Working…"
                      : d.mode === "mock"
                        ? "Submit development test"
                        : d.credential === "selfie"
                          ? "Continue to World Selfie Check"
                          : "Verify with World ID & submit"}
                  <span aria-hidden="true">↗</span>
                </button>
                {!d.requireWorld && (
                  <button
                    type="button"
                    className="wvr-secondary"
                    disabled={!hydrated || busy || open}
                    onClick={async () => {
                      if (!form.current?.reportValidity()) return;
                      setBusy(true);
                      setError("");
                      try {
                        await save();
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Please try again",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Submit without human verification
                  </button>
                )}
                <p className="wvr-note wvr-center">
                  {d.credential === "selfie"
                    ? "Selfie Check opens World App on your phone. We never receive your selfie."
                    : "One unique-human review per product, per store."}
                </p>
              </form>
            </>
          )}
        </section>
      </div>
      <footer className="wvr-footer">
        Independent experiences. No rewards for positive reviews.
      </footer>
      {c?.mode === "world" && c.rp_context && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={c.app_id as `app_${string}`}
          action={c.action}
          rp_context={c.rp_context}
          preset={
            c.credential === "selfie"
              ? selfieCheckLegacy({ signal: c.nonce })
              : proofOfHuman()
          }
          allow_legacy_proofs={c.credential === "selfie"}
          environment="production"
          handleVerify={async (proof) => {
            try {
              await save(proof);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Verification failed");
              throw e;
            }
          }}
          onSuccess={() => setOpen(false)}
          onError={(code) =>
            setError(
              `Verification was not completed (${code}). You can try again; no verified review was published.`,
            )
          }
        />
      )}
    </main>
  );
}
export function ErrorBoundary() {
  const e = useRouteError();
  return (
    <main className="wvr-page">
      <section className="wvr-card">
        <h1>Invitation unavailable</h1>
        <p>
          {isRouteErrorResponse(e) ? String(e.data) : "Please try again later."}
        </p>
      </section>
    </main>
  );
}
