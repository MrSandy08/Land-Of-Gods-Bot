const AuthCreds = require('./models/AuthCreds');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const clearCreds = async (sessionId = 'default') => {
  try {
    await AuthCreds.findByIdAndDelete(sessionId);
    console.log('Credenciales borradas correctamente');
  } catch (err) {
    console.error('Error al borrar credenciales:', err);
  }
};

const useMongoAuthState = async (sessionId = 'default', clear = false) => {
  let creds;
  let keys = {};

  if (clear) {
    await clearCreds(sessionId);
  }

  const stored = await AuthCreds.findById(sessionId);

  if (stored) {
    creds = JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver);
    keys = JSON.parse(JSON.stringify(stored.keys), BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    await AuthCreds.findByIdAndUpdate(
      sessionId,
      {
        creds: JSON.parse(JSON.stringify(creds), BufferJSON.replacer),
        keys: JSON.parse(JSON.stringify(keys), BufferJSON.replacer)
      },
      { upsert: true, new: true }
    );
  };

  return {
    state: { creds, keys },
    saveCreds
  };
};

module.exports = { useMongoAuthState, clearCreds };
