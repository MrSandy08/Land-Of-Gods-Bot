const axios = require('axios');
const fmt = require('../../format');
const { getTargetId } = require('../utils');

const reactionCommands = {
  hug: {
    phrases: [
      "¡{autor} le dio un cálido abrazo a {objetivo}!",
      "¡{autor} está abrazando a {objetivo}!",
      "¡{autor} le da un abrazo gigante a {objetivo}!"
    ]
  },
  slap: {
    phrases: [
      "¡{autor} le dio una tremenda bofetada a {objetivo}!",
      "¡{autor} cachetea a {objetivo} con todas sus fuerzas!",
      "¡Bam! {autor} le da una cachetada a {objetivo}!"
    ]
  },
  pat: {
    phrases: [
      "¡{autor} está acariciando la cabeza de {objetivo}!",
      "¡{autor} le da unas patitas suaves a {objetivo}!",
      "¡{autor} le da palmaditas a {objetivo}!"
    ]
  },
  poke: {
    phrases: [
      "¡{autor} está poking a {objetivo}!",
      "¡{autor} le da un toque curioso a {objetivo}!",
      "¡Hey! {autor} está poking a {objetivo}!"
    ]
  },
  cuddle: {
    phrases: [
      "¡{autor} y {objetivo} están acurrucados juntos!",
      "¡{autor} le da un acurrucamiento cálido a {objetivo}!",
      "¡{autor} y {objetivo} se abrazan tiernamente!"
    ]
  },
  kiss: {
    phrases: [
      "¡{autor} le dio un beso a {objetivo}!",
      "¡{autor} besa a {objetivo} con mucho amor!",
      "¡Mwah! {autor} le da un beso a {objetivo}!"
    ]
  }
};

const getRandomPhrase = (phrases, author, target) => {
  const randomIndex = Math.floor(Math.random() * phrases.length);
  return phrases[randomIndex]
    .replace('{autor}', fmt.mention(author))
    .replace('{objetivo}', fmt.mention(target));
};

const animeReactionHandler = async (command, sock, m, args, sender, reply) => {
  const config = reactionCommands[command];
  if (!config) return;

  const targetId = getTargetId(m, sender);

  try {
    console.log(`🔍 Obteniendo animación para !${command} desde nekos.best...`);
    const response = await axios.get(`https://nekos.best/api/v2/${command}`, { timeout: 10000 });
    const gifUrl = response.data.results[0].url;

    const videoUrl = gifUrl.replace('.gif', '.mp4');

    const reactionText = getRandomPhrase(config.phrases, sender, targetId);
    const caption = fmt.header(`Reacción: ${command.toUpperCase()}`) + '\n\n' + fmt.aviso(reactionText);

    console.log(`📤 Enviando MP4 interactivo como GIF: ${videoUrl}`);
    
    await sock.sendMessage(m.key.remoteJid, {
      video: { url: videoUrl },
      mimetype: 'video/mp4',
      gifPlayback: true,
      caption,
      mentions: [sender, targetId]
    }, { quoted: m });

  } catch (error) {
    console.error('❌ Error en comando de anime:', error.message);
    reply(fmt.aviso(`Lo siento, hubo un error al procesar la animación: ${error.message}`));
  }
};

const createAnimeCommands = () => {
  const commands = {};
  Object.keys(reactionCommands).forEach(cmd => {
    commands[cmd] = async (sock, m, args, currentUser, config, reply, sender) => {
      await animeReactionHandler(cmd, sock, m, args, sender, reply);
    };
  });
  return commands;
};

module.exports = createAnimeCommands();
