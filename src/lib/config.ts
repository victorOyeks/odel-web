/** Server-only settings read from the environment. */
export const API_URL = (process.env.ODEL_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** Mock mode: typed fixtures instead of the real API. Never on in production deploys. */
export const MOCK_API = process.env.ODEL_MOCK_API === "1";

/** Dev-only pages (/dev/*) are reachable in development and in mock mode, never in a real production build. */
export const DEV_TOOLS = process.env.NODE_ENV !== "production" || MOCK_API;
