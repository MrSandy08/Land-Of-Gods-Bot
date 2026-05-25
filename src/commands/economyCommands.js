const fmt = require('../../format');
const { getTargetId } = require('../utils');
const User = require('../models/User');
const UserGroupEconomy = require('../models/UserGroupEconomy');
const moment = require('moment');

const MS_EN_DIA = 24 * 60 * 60 * 1000;
const MS_EN_HORA = 60 * 60 * 1000;
const MS_EN_MINUTO = 60 * 1000;

const formatNumber = (num) => num.toLocaleString();

const checkCooldown = (userEconomy, cooldownName) => {
  if (!userEconomy.cooldowns) userEconomy.cooldowns = {};
  const cooldownDate = userEconomy.cooldowns[cooldownName];
  if (!cooldownDate) return { active: false };
  
  const ahora = new Date();
  if (cooldownDate > ahora) {
    const restante = cooldownDate - ahora;
    const horas = Math.floor(restante / (60 * 60 * 1000));
    const min = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
    const seg = Math.floor((restante % (60 * 1000)) / 1000);
    return { 
      active: true, 
      horas, 
      min, 
      seg,
      texto: `${horas > 0 ? `${horas}h ` : ''}${min}m ${seg}s`
    };
  }
  return { active: false };
};

const checkJail = (userEconomy) => {
  if (userEconomy.isJailed && userEconomy.jailUntil && userEconomy.jailUntil > new Date()) {
    const restante = userEconomy.jailUntil - new Date();
    const horas = Math.floor(restante / (60 * 60 * 1000));
    const min = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
    return {
      active: true,
      horas,
      min,
      texto: `${horas > 0 ? `${horas}h ` : ''}${min}m`
    };
  }
  return { active: false };
};

const economyCommands = {
  dinero: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const targetId = getTargetId(m, sender);
    const targetUserId = targetId;
    const userEconomy = await UserGroupEconomy.getOrCreate(targetUserId, groupId);
    
    const jail = checkJail(userEconomy);
    const total = userEconomy.money + userEconomy.bank;
    let texto = fmt.header() + '\n\n' +
      fmt.aviso(`💰 *DINERO DE ${targetId === sender ? 'TI' : '@' + targetId.split('@')[0]}*\n\n` +
        `💵 Cartera: *${formatNumber(userEconomy.money)}* monedas\n` +
        `🏦 Banco: *${formatNumber(userEconomy.bank)}* monedas\n` +
        `📊 Total: *${formatNumber(total)}* monedas`);
    
    if (jail.active) {
      texto += `\n\n🚔 *EN PRISIÓN*\nTiempo restante: *${jail.texto}*`;
    }
    
    if (userEconomy.its) {
      texto += `\n\n⚠️ *TIENES ITS*\nEnfermedad: *${userEconomy.its}*`;
    }
    
    await sock.sendMessage(m.key.remoteJid, { text: texto, mentions: [targetId] }, { quoted: m });
  },

  daily: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes reclamar tu bono diario.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const ahora = new Date();
    const ultimaVez = userEconomy.lastDaily || new Date(0);
    const diff = ahora - ultimaVez;

    const cooldown = checkCooldown(userEconomy, 'daily');
    if (cooldown.active) {
      return reply(fmt.aviso(`Aún no puedes reclamar tu bono diario.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    if (diff < 2 * MS_EN_DIA) {
      userEconomy.dailyStreak = (userEconomy.dailyStreak || 0) + 1;
    } else {
      userEconomy.dailyStreak = 1;
    }

    let ganancia = 2000;
    let msgStreak = '';

    if (userEconomy.dailyStreak >= 7) {
      ganancia *= 2;
      userEconomy.dailyStreak = 0;
      msgStreak = '\n🔥 ¡Racha de 7 días completada! Recompensa doble.';
    } else {
      msgStreak = `\n📅 Racha actual: *${userEconomy.dailyStreak}* días.`;
    }

    userEconomy.money += ganancia;
    userEconomy.lastDaily = ahora;
    userEconomy.cooldowns.daily = new Date(ahora.getTime() + MS_EN_DIA);
    await userEconomy.save();

    reply(fmt.aviso(`🎁 *BONO DIARIO*\n\n¡Has reclamado tu bono de *${formatNumber(ganancia)}* monedas!${msgStreak}\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
  },

  work: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes trabajar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(userEconomy, 'work');
    if (cooldown.active) {
      return reply(fmt.aviso(`Estás agotado para trabajar. Descansa un poco.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();

    if (resultado < 0.70) {
      const ganancia = Math.floor(Math.random() * 401) + 100;
      userEconomy.money += ganancia;
      userEconomy.cooldowns.work = new Date(Date.now() + 2 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`💼 *TRABAJO EXITOSO*\n\nHas trabajado duro hoy y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else if (resultado < 0.85) {
      const ascenso = Math.floor(Math.random() * 201) + 300;
      userEconomy.money += ascenso;
      userEconomy.cooldowns.work = new Date(Date.now() + 1 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`📈 *¡ASCIENSO!*\n\nTu jefe te ha notado tu esfuerzo. Ganaste *${formatNumber(ascenso)}* monedas extra.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else if (resultado < 0.95) {
      const descenso = Math.floor(Math.random() * 100) + 50;
      userEconomy.money = Math.max(0, userEconomy.money - descenso);
      userEconomy.cooldowns.work = new Date(Date.now() + 5 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`📉 *DESCIENSO*\n\nTe has equivocado en el trabajo. Perdiste *${formatNumber(descenso)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else {
      userEconomy.cooldowns.work = new Date(Date.now() + 10 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`⚠️ *DESPIDO*\n\n¡Cometiste un error grave en el trabajo y te han despedido!\n       𝄄   _No puedes trabajar por los próximos 10 minutos._`));
    }
  },

  minar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes minar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(userEconomy, 'minar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Tu mina está agotada.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const ganancia = Math.floor(Math.random() * 801) + 200;
    userEconomy.money += ganancia;
    userEconomy.cooldowns.minar = new Date(Date.now() + 5 * MS_EN_MINUTO);
    await userEconomy.save();
    
    reply(fmt.aviso(`⛏️ *MINERÍA EXITOSA*\n\nHas encontrado una veta rica y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
  },

  pescar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes pescar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(userEconomy, 'pescar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Los peces están huraños hoy.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();
    if (resultado < 0.80) {
      const ganancia = Math.floor(Math.random() * 301) + 50;
      userEconomy.money += ganancia;
      userEconomy.cooldowns.pescar = new Date(Date.now() + 3 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`🎣 *PESCA EXITOSA*\n\nHas pescado un gran pez y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else {
      userEconomy.cooldowns.pescar = new Date(Date.now() + 1 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`🎣 *PESCA FALLIDA*\n\nLos peces se han escapado. Vuelve a intentar en un rato.`));
    }
  },

  prostituirse: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes prostituirte.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(userEconomy, 'prostituirse');
    if (cooldown.active) {
      return reply(fmt.aviso(`Estás cansado/a. Descansa un rato.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const ganancia = Math.floor(Math.random() * 501) + 300;
    userEconomy.money += ganancia;
    userEconomy.cooldowns.prostituirse = new Date(Date.now() + 15 * MS_EN_MINUTO);

    const itsProbability = Math.random();
    if (itsProbability < 0.15) {
      const itsList = ['VIH', 'SIDA', 'Sífilis', 'Herpes'];
      const its = itsList[Math.floor(Math.random() * itsList.length)];
      userEconomy.its = its;
      await userEconomy.save();
      
      reply(fmt.aviso(`💋 *SERVICIO COMPLETADO*\n\nHas ganado *${formatNumber(ganancia)}* monedas, pero...\n\n⚠️ *¡OH NO!*\n¡Te has contagiado de *${its}*!\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else {
      await userEconomy.save();
      
      reply(fmt.aviso(`💋 *SERVICIO COMPLETADO*\n\nHas ganado *${formatNumber(ganancia)}* monedas sin problemas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    }
  },

  robar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes robar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    if (args.length < 1) {
      return reply(fmt.aviso('Uso: !robar @usuario'));
    }

    const targetId = getTargetId(m, sender);
    if (targetId === sender) {
      return reply(fmt.aviso('No te puedes robar a ti mismo.'));
    }

    const cooldown = checkCooldown(userEconomy, 'robar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Estás caliente. Espera un rato.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const targetUserEconomy = await UserGroupEconomy.getOrCreate(targetId, groupId);
    const targetUser = await User.findById(targetId);
    const nombreObjetivo = targetUser?.personaje || '@' + targetId.split('@')[0];

    if (targetUserEconomy.money === 0) {
      return reply(fmt.aviso('El objetivo no tiene dinero en la cartera.¡Debería depositarlo en el banco!'));
    }

    const resultado = Math.random();
    if (resultado < 0.10) {
      const montoRobado = Math.floor(targetUserEconomy.money * 0.5);
      targetUserEconomy.money -= montoRobado;
      userEconomy.money += montoRobado;
      userEconomy.cooldowns.robar = new Date(Date.now() + 10 * MS_EN_MINUTO);
      await userEconomy.save();
      await targetUserEconomy.save();
      
      reply(fmt.aviso(`😈 *ROBO EXITOSO*\n\n¡Has robado *${formatNumber(montoRobado)}* monedas a *${nombreObjetivo}*!\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else {
      const multa = Math.floor(userEconomy.money * 0.3);
      userEconomy.money = Math.max(0, userEconomy.money - multa);
      userEconomy.isJailed = true;
      userEconomy.jailUntil = new Date(Date.now() + 2 * MS_EN_HORA);
      userEconomy.cooldowns.robar = new Date(Date.now() + 30 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`🚔 *¡ATRAPADO!*\n\n¡Has sido atrapado robando!\n       𝄄   _Pagaste una multa de ${formatNumber(multa)} monedas y estás en prisión por 2 horas._`));
    }
  },

  atracar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes atracar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(userEconomy, 'atracar');
    if (cooldown.active) {
      return reply(fmt.aviso(`La policía está vigilando. Espera un rato.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();
    if (resultado < 0.30) {
      const botin = Math.floor(Math.random() * 3001) + 2000;
      userEconomy.money += botin;
      userEconomy.cooldowns.atracar = new Date(Date.now() + 30 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`🏦 *ATRACO EXITOSO*\n\n¡Has robado el banco y ganaste *${formatNumber(botin)}* monedas!\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
    } else {
      userEconomy.isJailed = true;
      userEconomy.jailUntil = new Date(Date.now() + 6 * MS_EN_HORA);
      userEconomy.cooldowns.atracar = new Date(Date.now() + 60 * MS_EN_MINUTO);
      await userEconomy.save();
      
      reply(fmt.aviso(`🚔 *¡ATRACO FALLIDO!*\n\n¡Has sido atrapado atracando el banco!\n       𝄄   _Estás en prisión por 6 horas._`));
    }
  },

  fianza: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (!jail.active) {
      return reply(fmt.aviso('No estás en prisión.'));
    }

    const costoFianza = 5000;
    if (userEconomy.money + userEconomy.bank < costoFianza) {
      return reply(fmt.aviso(`No tienes suficiente dinero para pagar la fianza.\n       𝄄   _Necesitas ${formatNumber(costoFianza)} monedas._`));
    }

    if (userEconomy.money < costoFianza) {
      const faltante = costoFianza - userEconomy.money;
      userEconomy.bank -= faltante;
      userEconomy.money = 0;
    } else {
      userEconomy.money -= costoFianza;
    }

    userEconomy.isJailed = false;
    userEconomy.jailUntil = null;
    await userEconomy.save();
    
    reply(fmt.aviso(`🏦 *FIANZA PAGADA*\n\n¡Has pagado tu fianza de *${formatNumber(costoFianza)}* monedas y has salido de prisión.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`));
  },

  depositar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes depositar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const input = args[0]?.toLowerCase();
    
    if (!input) return reply(fmt.aviso('Escribe la cantidad que deseas depositar o usa *all*.\n       𝄄   _Ej: !depositar 500_ | _!depositar all_'));

    let monto = 0;
    if (input === 'all') {
      monto = userEconomy.money;
    } else {
      monto = parseInt(input);
    }

    if (isNaN(monto) || monto <= 0) {
      return reply(fmt.aviso('Escribe una cantidad válida para depositar.'));
    }

    if (userEconomy.money < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero en tu cartera para depositar *${formatNumber(monto)}* monedas.`));
    }

    userEconomy.money -= monto;
    userEconomy.bank += monto;
    await userEconomy.save();

    reply(fmt.aviso(`🏦 *DEPÓSITO BANCARIO*\n\nHas depositado *${formatNumber(monto)}* monedas en tu banco.\n       𝄄   _Cartera: $${formatNumber(userEconomy.money)}_\n       𝄄   _Banco: $${formatNumber(userEconomy.bank)}_`));
  },

  retirar: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes retirar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const input = args[0]?.toLowerCase();
    
    if (!input) return reply(fmt.aviso('Escribe la cantidad que deseas retirar o usa *all*.\n       𝄄   _Ej: !retirar 500_ | _!retirar all_'));

    let monto = 0;
    if (input === 'all') {
      monto = userEconomy.bank;
    } else {
      monto = parseInt(input);
    }

    if (isNaN(monto) || monto <= 0) {
      return reply(fmt.aviso('Escribe una cantidad válida para retirar.'));
    }

    if (userEconomy.bank < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero en tu banco para retirar *${formatNumber(monto)}* monedas.`));
    }

    userEconomy.bank -= monto;
    userEconomy.money += monto;
    await userEconomy.save();

    reply(fmt.aviso(`🏦 *RETIRO BANCARIO*\n\nHas retirado *${formatNumber(monto)}* monedas de tu banco.\n       𝄄   _Cartera: $${formatNumber(userEconomy.money)}_\n       𝄄   _Banco: $${formatNumber(userEconomy.bank)}_`));
  },

  ricos: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const top10Economy = await UserGroupEconomy.find({ groupId })
      .sort({ $expr: { $add: ['$money', '$bank'] } })
      .limit(10);

    if (!top10Economy.length) {
      return reply(fmt.aviso('No hay usuarios con dinero registrado todavía. 💸'));
    }

    let txt = fmt.header() + '\n\n';

    for (const ue of top10Economy) {
      const user = await User.findById(ue.userId);
      const i = top10Economy.indexOf(ue);
      const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
      const total = ue.money + ue.bank;
      const nombre = user?.personaje || '@' + ue.userId.split('@')[0];
      txt += ` ${medalla} *${i + 1}. ${nombre}*\n`;
      txt += `       𝄄   Total: *$${formatNumber(total)}*\n`;
      txt += `       𝄄   Banco: $${formatNumber(ue.bank)} | Cartera: $${formatNumber(ue.money)}\n`;
      if (ue.isJailed && ue.jailUntil && ue.jailUntil > new Date()) {
        txt += `       𝄄   🚔 EN PRISIÓN\n`;
      }
      txt += '\n';
    }

    txt += `                 𑂯 ( ⚡ ) ⁺ 𓈒  ׁ     
       𝄄   _¡Sigue trabajando para entrar al top!_`;

    const mentions = top10Economy.map(ue => ue.userId);
    await sock.sendMessage(m.key.remoteJid, { text: txt, mentions }, { quoted: m });
  },

  transferir: async (sock, m, args, currentUser, config, reply, sender, groupId) => {
    const userEconomy = await UserGroupEconomy.getOrCreate(sender, groupId);
    const jail = checkJail(userEconomy);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes transferir.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    if (args.length < 2) {
      return reply(fmt.aviso('Uso: !transferir @usuario cantidad'));
    }

    const targetId = getTargetId(m, sender);
    if (targetId === sender) {
      return reply(fmt.aviso('No puedes transferir dinero a ti mismo.'));
    }

    const monto = parseInt(args[1]);
    if (isNaN(monto) || monto <= 0) {
      return reply(fmt.aviso('Escribe una cantidad válida para transferir.'));
    }

    if (userEconomy.money < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero para transferir *${formatNumber(monto)}* monedas.`));
    }

    const targetUserEconomy = await UserGroupEconomy.getOrCreate(targetId, groupId);
    const targetUser = await User.findById(targetId);
    const nombreDestino = targetUser?.personaje || '@' + targetId.split('@')[0];

    userEconomy.money -= monto;
    targetUserEconomy.money += monto;
    await userEconomy.save();
    await targetUserEconomy.save();

    const texto = fmt.aviso(`💸 *TRANSFERENCIA EXITOSA*\n\nHas transferido *${formatNumber(monto)}* monedas a *${nombreDestino}*.\n       𝄄   _Tu nuevo saldo: ${formatNumber(userEconomy.money)}_`);
    
    await sock.sendMessage(m.key.remoteJid, { text: texto, mentions: [targetId] }, { quoted: m });
  }
};

economyCommands.balance = economyCommands.dinero;
economyCommands.w = economyCommands.work;
economyCommands.dep = economyCommands.depositar;
economyCommands.withdraw = economyCommands.retirar;
economyCommands.with = economyCommands.retirar;
economyCommands.topmoney = economyCommands.ricos;
economyCommands.millonarios = economyCommands.ricos;
economyCommands.pay = economyCommands.transferir;
economyCommands.mine = economyCommands.minar;
economyCommands.fish = economyCommands.pescar;
economyCommands.steal = economyCommands.robar;
economyCommands.heist = economyCommands.atracar;
economyCommands.bail = economyCommands.fianza;
economyCommands.prostituir = economyCommands.prostituirse;
economyCommands.slut = economyCommands.prostituirse;

module.exports = economyCommands;
