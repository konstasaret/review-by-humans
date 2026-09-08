import type { Config } from "@react-router/dev/config";

// Shopify's development tunnel forwards requests to a localhost server. Keep
// React Router's CSRF protection and allow only this app's configured origin.
export default {
  allowedActionOrigins: process.env.SHOPIFY_APP_URL
    ? [new URL(process.env.SHOPIFY_APP_URL).host]
    : [],
} satisfies Config;
