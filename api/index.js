// Vercel serverless entrypoint. The Express app is exported from server.js and
// used directly as the request handler. All /api/* requests are routed here by
// vercel.json; static pages are served from /public by the platform.
import app from '../server.js';

export default app;
