const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

if (!redisUrl) {
  console.error('❌ Falta la variable REDIS_URL en el entorno.');
}

const redisClient = new Redis(redisUrl, {
  // 1. Evita que ioredis tire la app cuando se agotan los reintentos de un comando pesado
  maxRetriesPerRequest: null,
  
  // 2. Controla la estrategia de reconexión del servidor completo
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000); // Reintenta rápido pero con un tope de 2 segundos
    return delay;
  },
  
  // 3. Mantiene la conexión TCP viva con Upstash enviando paquetes sutiles de fondo
  keepAlive: 10000, // 10 segundos
});

redisClient.on('connect', () => {
  // Quitamos el log repetitivo para que no te sature la consola cada vez que reconecte de fondo
  // console.log('🚀 Conectado exitosamente a la memoria RAM de Redis (vía ioredis)');
});

redisClient.on('error', (err) => {
  // Solo loguear errores graves que no sean cierres de sockets comunes (ECONNRESET)
  if (err.code !== 'ECONNRESET') {
    console.error('❌ Error en el cliente de Redis:', err.message);
  }
});

module.exports = redisClient;
