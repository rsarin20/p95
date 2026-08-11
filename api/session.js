import { api, route } from './_api.js';

// POST creates an identity, PATCH renames one or backfills a missing city.
export default route(['POST', 'PATCH'], (req, ctx) =>
  req.method === 'POST' ? api.createSession(ctx) : api.updateSession(ctx)
);
