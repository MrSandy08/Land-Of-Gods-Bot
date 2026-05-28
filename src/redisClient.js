const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisClient = new Redis(redisUrl);

redisClient.on('connect', () => {
  console.log('🚀 Conectado exitosamente a la memoria RAM de Redis (vía ioredis)');
});

redisClient.on('error', (err) => {
  console.error('❌ Error en el cliente de Redis:', err);
});

module.exports = redisClient;
