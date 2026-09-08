import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>World Verified Reviews</h1>
        <p className={styles.text}>
          Post-purchase reviews from unique humans. Private by design.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Honest reviews</strong>. Verified purchase and unique-human
            badges, with no rewards for positive ratings.
          </li>
          <li>
            <strong>Private verification</strong>. Stores receive no World ID,
            biometrics, or identity from the proof.
          </li>
          <li>
            <strong>Shopify native</strong>. Configure invitations, moderate
            reviews, and place your theme widget.
          </li>
        </ul>
      </div>
    </div>
  );
}
