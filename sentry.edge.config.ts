// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // DSN comes from the environment. Unset = Sentry stays inactive.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Never report from local development.
  enabled: process.env.NODE_ENV !== "development",

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Do NOT attach user PII (IP addresses, cookies, user info) to events.
  sendDefaultPii: false,
});
