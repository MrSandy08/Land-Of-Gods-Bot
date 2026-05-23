const AuthCreds = require('./models/AuthCreds');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const clearCreds = async (sessionId = 'default') => {
  try {
    await AuthCreds.findByIdAndDelete(sessionId);
    console.log('Credenciales borradas correctamente de MongoDB');
  } catch (err) {
    console.error('Error al borrar credenciales:', err);
  }
};

const useMongoAuthState = async (sessionId = 'default', clear = false) => {
  let creds;
  const keysData = {};
  let saveTimeout;

  if (clear) {
    await clearCreds(sessionId);
  }

  const stored = await AuthCreds.findById(sessionId);

  if (stored) {
    creds = JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver);
    const loadedKeys = JSON.parse(JSON.stringify(stored.keys), BufferJSON.reviver);
    Object.assign(keysData, loadedKeys);
    console.log('Credenciales cargadas desde MongoDB');
  } else {
    creds = initAuthCreds();
    console.log('No hay credenciales guardadas, inicializando nuevas');
  }

  const keys = {
    get: (type, ids) => {
      const key = {};
      ids.forEach(id => {
        const k = keysData[`${type}-${id}`];
        if (k) key[id] = k;
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

  const saveToDB = async () => {
    try {
      await AuthCreds.findByIdAndUpdate(
        sessionId,
        {
          creds: JSON.parse(JSON.stringify(creds), BufferJSON.replacer),
          keys: JSON.parse(JSON.stringify(keysData), BufferJSON.replacer)
        },
        { upsert: true, new: true }
      );
      console.log('Credenciales guardadas en MongoDB');
    } catch (err) {
      console.error('Error al guardar credenciales en MongoDB:', err);
    }
  };

  const saveCreds = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveToDB, 500);
  };

  return {
    state: { creds, keys },
    saveCreds
  };
};

module.exports = { useMongoAuthState, clearCreds };
