import { validateSession } from './agentbridge_tools_client.mjs';
import { gatewayFetch } from './agentbridge_transport.mjs';

if (!process.versions.node.startsWith('24.')) throw new Error('Use the reviewed Node 24 runtime.');
const base = validateSession();
globalThis.fetch = gatewayFetch(globalThis.fetch, base, () => validateSession());
