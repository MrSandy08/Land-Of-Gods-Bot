const mongoose = require('mongoose');

const connectDB = async () => {
  // 1. Prioriza la variable de entorno de Render. Si no existe, usa Localhost.
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/land-of-gods';
  
  try {
    // 2. Intentar la conexión con la URI correcta
    await mongoose.connect(uri);
    console.log('✅ Conectado exitosamente a MongoDB en la nube');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    throw error; // Lanza el error para que startBot() lo maneje
  }
};

module.exports = connectDB;
