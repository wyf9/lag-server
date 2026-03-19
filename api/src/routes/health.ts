import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/api/discover', async () => {
    const host = process.env.EXTERNAL_HOST ?? 'localhost';
    const webPort = process.env.WEB_PORT ?? '3000';
    const apiPort = process.env.API_PORT ?? '3001';
    const voicePort = process.env.VOICE_PORT ?? '7880';

    return {
      apiUrl: `http://${host}:${apiPort}`,
      wsUrl: `ws://${host}:${apiPort}/api/ws`,
      voiceUrl: `ws://${host}:${voicePort}`,
      version: '1.0.0',
    };
  });
};

export default healthRoutes;
