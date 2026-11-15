import { unsubscribe } from '../server/handlers.js';
import { methodNotAllowed } from '../server/http.js';
export default { fetch: request => request.method === 'POST' ? unsubscribe(request) : methodNotAllowed('POST') };
