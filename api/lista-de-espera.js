import { waitUntil } from '@vercel/functions';
import { signup } from '../server/handlers.js';
import { methodNotAllowed } from '../server/http.js';
export default {
  fetch(request) {
    return request.method === 'POST'
      ? signup(request, { schedule: task => waitUntil(task()) })
      : methodNotAllowed('POST');
  }
};
