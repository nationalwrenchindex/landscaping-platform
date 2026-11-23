// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
