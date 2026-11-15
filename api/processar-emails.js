import { processEmails } from '../server/handlers.js';
import { methodNotAllowed } from '../server/http.js';
export default { fetch: request => ['GET','POST'].includes(request.method) ? processEmails(request) : methodNotAllowed('GET, POST') };
