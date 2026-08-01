// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1c9e7c4cf99e6c377d95b633b8b2ab0b@o4511061698478080.ingest.de.sentry.io/4511836479488080",

  tracesSampleRate: 0.1,
  enableLogs: true,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] }),
  ],

  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
  },
});
