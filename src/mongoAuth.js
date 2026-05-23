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
  const keysData = {};

  if (clear) {
    await clearCreds(sessionId);
  }

  const stored = await AuthCreds.findById(sessionId);

  if (stored) {
    creds = JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver);
    const loadedKeys = JSON.parse(JSON.stringify(stored.keys), BufferJSON.reviver);
    Object.assign(keysData, loadedKeys);
  } else {
    creds = initAuthCreds();
  }

  const keys = {
    get: (type, ids) => {
      const key = {};
      ids.forEach(id => {
        const k = keysData[`${type}-${id}`];
        if (k) {
          key[id] = k;
        }
      });
      return key;
    },
    set: (type, id, value) => {
      if (value) {
        keysData[`${type}-${id}`] = value;
      } else {
        delete keysData[`${type}-${id}`];
      }
    }
  };

  const saveCreds = async () => {
    await AuthCreds.findByIdAndUpdate(
      sessionId,
      {
        creds: JSON.parse(JSON.stringify(creds), BufferJSON.replacer),
        keys: JSON.parse(JSON.stringify(keysData), BufferJSON.replacer)
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
