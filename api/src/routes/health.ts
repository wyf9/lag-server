import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../config.js';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const config = getConfig();
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/api/discover', async () => {
    return {
      apiUrl: `http://${config.externalHost}:${config.port}`,
      wsUrl: `ws://${config.externalHost}:${config.port}/api/ws`,
      voiceUrl: `ws://${config.externalHost}:${config.voicePort}`,
      version: '1.0.0',
      guestEnabled: config.guestEnabled,
      authProvider: config.auth.provider,
      providerName: config.auth.label,
    };
  });
};

export default healthRoutes;
