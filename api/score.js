import { api, route } from './_api.js';

export default route(['POST'], (req, ctx) => api.postScore(ctx));
