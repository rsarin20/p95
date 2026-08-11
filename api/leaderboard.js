import { api, route } from './_api.js';

export default route(['GET'], (req, ctx) => api.getLeaderboard(ctx));
