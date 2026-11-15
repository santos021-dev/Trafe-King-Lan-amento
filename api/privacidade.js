import { privacyContact } from '../server/handlers.js';
import { methodNotAllowed } from '../server/http.js';
export default { fetch: request => request.method === 'GET' ? privacyContact() : methodNotAllowed('GET') };
