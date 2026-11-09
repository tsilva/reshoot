/** Guard only the opt-in local app; hosted and default launches never import this. */
export function gatewayFetch(fetchImpl, base, validate) {
  const endpoint = new URL(base);
  let failed = false;
  return async (input, init) => {
    validate();
    if (failed) throw new Error('AgentBridge session stopped after a failed request.');
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init?.method ?? input.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? input.headers);
    if (target.origin !== endpoint.origin || target.search || target.hash
        || target.username || target.password
        || !((method === 'GET' && target.pathname === `${endpoint.pathname}/models`)
                    || (method === 'GET' && target.pathname === `${endpoint.pathname}/openrouter/key`)
        || (method === 'POST' && [`${endpoint.pathname}/chat/completions`, `${endpoint.pathname}/images`].includes(target.pathname)))
        || headers.get('Authorization') !== 'Bearer agentbridge_public_placeholder'
        || ['cookie', 'x-api-key', 'api-key'].some(key => headers.has(key))) {
      throw new Error('Request is outside the reviewed AgentBridge route.');
    }
    let response;
    try {
      const destination = new URL(target);
      if (method === 'GET' && destination.pathname.endsWith('/openrouter/key')) destination.hostname = 'localhost';
      response = await fetchImpl(destination, { ...init, redirect: 'error' });
    } catch {
      failed = true;
      throw new Error('AgentBridge connection failed; diagnostic details withheld.');
    }
    if (!response.ok) {
      failed = true;
      await response.body?.cancel();
      return new Response(JSON.stringify({ error: { message: 'AgentBridge request failed; provider details withheld.' } }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }
    return response;
  };
}
