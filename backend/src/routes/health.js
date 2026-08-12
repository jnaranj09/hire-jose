import { Router } from 'express';

export function healthRoute({ ollama, model }) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const reachable = await ollama.isReachable();
    res.status(reachable ? 200 : 503).json({
      status: reachable ? 'ok' : 'degraded',
      model
    });
  });

  return router;
}
