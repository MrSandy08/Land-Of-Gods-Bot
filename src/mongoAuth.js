const AuthCreds = require('./models/AuthCreds');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const useMongoAuthState = async (sessionId = 'default') => {
  let creds;
  let keys = {};

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

module.exports = useMongoAuthState;
