/** Transport types for the opt-in local Vault client. */
export function gatewayFetch(
  fetchImpl: typeof globalThis.fetch,
  base: string,
  validate: () => unknown,
): typeof globalThis.fetch;
