// src/redisClient.js
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ Falta la variable REDIS_URL en las variables de entorno de Render.');
}

const redisClient = new Redis(redisUrl, {
  // 1. Evita que los comandos fallen inmediatamente si el socket se rompe (EPIPE/ECONNRESET)
  // ioredis guardará el comando en cola y lo ejecutará en cuanto la reconexión sea exitosa
  maxRetriesPerRequest: null,

  // 2. Estrategia de reconexión rápida ante caídas de red
  retryStrategy(times) {
    // Reintenta de forma progresiva: 50ms, 100ms... hasta un tope de 2 segundos
    return Math.min(times * 50, 2000);
  },

  // 3. Configuración de sockets TCP nativos para mantener la línea ocupada
  connectTimeout: 10000, // 10 segundos de tiempo de espera máximo para conectar
  disconnectTimeout: 2000,
  
  // Opciones de conexión TLS/Net
  tls: redisUrl.startsWith('rediss://') ? {} : undefined, // Manejo correcto si usas SSL
});

// 🛠️ CONFIGURACIÓN CRÍTICA PARA EVITAR EPIPE Y ECONNRESET
// Habilitamos Keep-Alive directamente en el socket TCP interno de ioredis
redisClient.on('select', () => {
  const stream = redisClient.stream;
  if (stream && typeof stream.setKeepAlive === 'function') {
    // Envía un paquete sutil cada 5 segundos para decirle a Upstash "sigo vivo, no me cierres"
    stream.setKeepAlive(true, 5000);
  }
});

// Manejador de errores silencioso para flujos de red comunes
redisClient.on('error', (err) => {
  // Ignoramos los errores comunes de desconexión por inactividad en la consola
  // para que no saturen tus logs de Render, ya que ioredis los reconecta solos.
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return;
  }
  console.error('❌ Error crítico en el cliente de Redis:', err.message);
});

module.exports = redisClient;
