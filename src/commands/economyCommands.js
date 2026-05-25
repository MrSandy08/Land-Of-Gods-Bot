const fmt = require('../../format');
const { getTargetId } = require('../utils');
const User = require('../models/User');
const moment = require('moment');

const MS_EN_DIA = 24 * 60 * 60 * 1000;
const MS_EN_HORA = 60 * 60 * 1000;
const MS_EN_MINUTO = 60 * 1000;

const formatNumber = (num) => num.toLocaleString();

const checkCooldown = (user, cooldownName) => {
  if (!user.cooldowns) user.cooldowns = {};
  const cooldownDate = user.cooldowns[cooldownName];
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

const checkJail = (user) => {
  if (user.isJailed && user.jailUntil && user.jailUntil > new Date()) {
    const restante = user.jailUntil - new Date();
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
  dinero: async (sock, m, args, currentUser, config, reply, sender) => {
    const targetId = getTargetId(m, sender);
    const user = targetId === sender ? currentUser : await User.findById(targetId);
    
    if (!user) return reply(fmt.aviso('Usuario no encontrado.'));
    
    const jail = checkJail(user);
    const total = user.money + user.bank;
    let texto = fmt.header() + '\n\n' +
      fmt.aviso(`💰 *DINERO DE ${targetId === sender ? 'TI' : '@' + targetId.split('@')[0]}*\n\n` +
        `💵 Cartera: *${formatNumber(user.money)}* monedas\n` +
        `🏦 Banco: *${formatNumber(user.bank)}* monedas\n` +
        `📊 Total: *${formatNumber(total)}* monedas`;
    
    if (jail.active) {
      texto += `\n\n🚔 *EN PRISIÓN*\nTiempo restante: *${jail.texto}`;
    }
    
    await sock.sendMessage(m.key.remoteJid, { text: texto, mentions: [targetId] }, { quoted: m });
  },

  daily: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes reclamar tu bono diario.\n       𝄄   _Tiempo restante: ${jail.texto}_`);
    }

    const ahora = new Date();
    const ultimaVez = user.lastDaily || new Date(0);
    const diff = ahora - ultimaVez;

    const cooldown = checkCooldown(user, 'daily');
    if (cooldown.active) {
      return reply(fmt.aviso(`Aún no puedes reclamar tu bono diario.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    if (diff < 2 * MS_EN_DIA) {
      user.dailyStreak = (user.dailyStreak || 0) + 1;
    } else {
      user.dailyStreak = 1;
    }

    let ganancia = 2000;
    let msgStreak = '';

    if (user.dailyStreak >= 7) {
      ganancia *= 2;
      user.dailyStreak = 0;
      msgStreak = '\n🔥 ¡Racha de 7 días completada! Recompensa doble.';
    } else {
      msgStreak = `\n📅 Racha actual: *${user.dailyStreak}* días.`;
    }

    user.money += ganancia;
    user.lastDaily = ahora;
    user.cooldowns.daily = new Date(ahora.getTime() + MS_EN_DIA);
    await user.save();

    reply(fmt.aviso(`🎁 *BONO DIARIO*\n\n¡Has reclamado tu bono de *${formatNumber(ganancia)}* monedas!${msgStreak}\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
  },

  work: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes trabajar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(user, 'work');
    if (cooldown.active) {
      return reply(fmt.aviso(`Estás agotado para trabajar. Descansa un poco.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();

    if (resultado < 0.70) {
      const ganancia = Math.floor(Math.random() * 401) + 100;
      user.money += ganancia;
      user.cooldowns.work = new Date(Date.now() + 2 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`💼 *TRABAJO EXITOSO*\n\nHas trabajado duro hoy y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else if (resultado < 0.85) {
      const ascenso = Math.floor(Math.random() * 201) + 300;
      user.money += ascenso;
      user.cooldowns.work = new Date(Date.now() + 1 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`📈 *¡ASCIENSO!*\n\nTu jefe te ha notado tu esfuerzo. Ganaste *${formatNumber(ascenso)}* monedas extra.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else if (resultado < 0.95) {
      const descenso = Math.floor(Math.random() * 100) + 50;
      user.money = Math.max(0, user.money - descenso);
      user.cooldowns.work = new Date(Date.now() + 5 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`📉 *DESCIENSO*\n\nTe has equivocado en el trabajo. Perdiste *${formatNumber(descenso)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else {
      user.cooldowns.work = new Date(Date.now() + 10 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`⚠️ *DESPIDO*\n\n¡Cometiste un error grave en el trabajo y te han despedido!\n       𝄄   _No puedes trabajar por los próximos 10 minutos._`));
    }
  },

  minar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes minar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(user, 'minar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Tu mina está agotada.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const ganancia = Math.floor(Math.random() * 801) + 200;
    user.money += ganancia;
    user.cooldowns.minar = new Date(Date.now() + 5 * MS_EN_MINUTO);
    await user.save();
    
    reply(fmt.aviso(`⛏️ *MINERÍA EXITOSA*\n\nHas encontrado una veta rica y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
  },

  pescar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes pescar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(user, 'pescar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Los peces están huraños hoy.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();
    if (resultado < 0.80) {
      const ganancia = Math.floor(Math.random() * 301) + 50;
      user.money += ganancia;
      user.cooldowns.pescar = new Date(Date.now() + 3 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`🎣 *PESCA EXITOSA*\n\nHas pescado un gran pez y ganaste *${formatNumber(ganancia)}* monedas.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else {
      user.cooldowns.pescar = new Date(Date.now() + 1 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`🎣 *PESCA FALLIDA*\n\nLos peces se han escapado. Vuelve a intentar en un rato.`));
    }
  },

  robar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
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

    const cooldown = checkCooldown(user, 'robar');
    if (cooldown.active) {
      return reply(fmt.aviso(`Estás caliente. Espera un rato.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return reply(fmt.aviso('El objetivo no tiene un perfil registrado.'));
    }

    if (targetUser.money === 0) {
      return reply(fmt.aviso('El objetivo no tiene dinero en la cartera.¡Debería depositarlo en el banco!'));
    }

    const resultado = Math.random();
    if (resultado < 0.10) {
      const montoRobado = Math.floor(targetUser.money * 0.5);
      targetUser.money -= montoRobado;
      user.money += montoRobado;
      user.cooldowns.robar = new Date(Date.now() + 10 * MS_EN_MINUTO);
      await user.save();
      await targetUser.save();
      
      reply(fmt.aviso(`😈 *ROBO EXITOSO*\n\n¡Has robado *${formatNumber(montoRobado)}* monedas a ${fmt.mention(targetId)}!\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else {
      const multa = Math.floor(user.money * 0.3);
      user.money = Math.max(0, user.money - multa);
      user.isJailed = true;
      user.jailUntil = new Date(Date.now() + 2 * MS_EN_HORA);
      user.cooldowns.robar = new Date(Date.now() + 30 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`🚔 *¡ATRAPADO!*\n\n¡Has sido atrapado robando!\n       𝄄   _Pagaste una multa de ${formatNumber(multa)} monedas y estás en prisión por 2 horas._`));
    }
  },

  atracar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes atracar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const cooldown = checkCooldown(user, 'atracar');
    if (cooldown.active) {
      return reply(fmt.aviso(`La policía está vigilando. Espera un rato.\n       𝄄   _Tiempo restante: ${cooldown.texto}_`));
    }

    const resultado = Math.random();
    if (resultado < 0.30) {
      const botin = Math.floor(Math.random() * 3001) + 2000;
      user.money += botin;
      user.cooldowns.atracar = new Date(Date.now() + 30 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`🏦 *ATRACO EXITOSO*\n\n¡Has robado el banco y ganaste *${formatNumber(botin)}* monedas!\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
    } else {
      user.isJailed = true;
      user.jailUntil = new Date(Date.now() + 6 * MS_EN_HORA);
      user.cooldowns.atracar = new Date(Date.now() + 60 * MS_EN_MINUTO);
      await user.save();
      
      reply(fmt.aviso(`🚔 *¡ATRACO FALLIDO!*\n\n¡Has sido atrapado atracando el banco!\n       𝄄   _Estás en prisión por 6 horas._`));
    }
  },

  fianza: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (!jail.active) {
      return reply(fmt.aviso('No estás en prisión.'));
    }

    const costoFianza = 5000;
    if (user.money + user.bank < costoFianza) {
      return reply(fmt.aviso(`No tienes suficiente dinero para pagar la fianza.\n       𝄄   _Necesitas ${formatNumber(costoFianza)} monedas._`));
    }

    if (user.money < costoFianza) {
      const faltante = costoFianza - user.money;
      user.bank -= faltante;
      user.money = 0;
    } else {
      user.money -= costoFianza;
    }

    user.isJailed = false;
    user.jailUntil = null;
    await user.save();
    
    reply(fmt.aviso(`🏦 *FIANZA PAGADA*\n\n¡Has pagado tu fianza de *${formatNumber(costoFianza)}* monedas y has salido de prisión.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`));
  },

  depositar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes depositar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const input = args[0]?.toLowerCase();
    
    if (!input) return reply(fmt.aviso('Escribe la cantidad que deseas depositar o usa *all*.\n       𝄄   _Ej: !depositar 500_ | _!depositar all_'));

    let monto = 0;
    if (input === 'all') {
      monto = user.money;
    } else {
      monto = parseInt(input);
    }

    if (isNaN(monto) || monto <= 0) {
      return reply(fmt.aviso('Escribe una cantidad válida para depositar.'));
    }

    if (user.money < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero en tu cartera para depositar *${formatNumber(monto)}* monedas.`));
    }

    user.money -= monto;
    user.bank += monto;
    await user.save();

    reply(fmt.aviso(`🏦 *DEPÓSITO BANCARIO*\n\nHas depositado *${formatNumber(monto)}* monedas en tu banco.\n       𝄄   _Cartera: $${formatNumber(user.money)}_\n       𝄄   _Banco: $${formatNumber(user.bank)}_`));
  },

  retirar: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
    if (jail.active) {
      return reply(fmt.aviso(`Estás en prisión. No puedes retirar.\n       𝄄   _Tiempo restante: ${jail.texto}_`));
    }

    const input = args[0]?.toLowerCase();
    
    if (!input) return reply(fmt.aviso('Escribe la cantidad que deseas retirar o usa *all*.\n       𝄄   _Ej: !retirar 500_ | _!retirar all_')));

    let monto = 0;
    if (input === 'all') {
      monto = user.bank;
    } else {
      monto = parseInt(input);
    }

    if (isNaN(monto) || monto <= 0) {
      return reply(fmt.aviso('Escribe una cantidad válida para retirar.'));
    }

    if (user.bank < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero en tu banco para retirar *${formatNumber(monto)}* monedas.`));
    }

    user.bank -= monto;
    user.money += monto;
    await user.save();

    reply(fmt.aviso(`🏦 *RETIRO BANCARIO*\n\nHas retirado *${formatNumber(monto)}* monedas de tu banco.\n       𝄄   _Cartera: $${formatNumber(user.money)}_\n       𝄄   _Banco: $${formatNumber(user.bank)}_`));
  },

  ricos: async (sock, m, args, currentUser, config, reply, sender) => {
    const top10 = await User.find()
      .sort({ $expr: { $add: ['$money', '$bank'] } })
      .limit(10);

    if (!top10.length) {
      return reply(fmt.aviso('No hay usuarios con dinero registrado todavía. 💸'));
    }

    let txt = fmt.header() + '\n\n';

    top10.forEach((u, i) => {
      const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
      const total = u.money + u.bank;
      const nombre = u.personaje || '@' + u._id.split('@')[0];
      txt += ` ${medalla} *${i + 1}. ${nombre}*\n`;
      txt += `       𝄄   Total: *$${formatNumber(total)}*\n`;
      txt += `       𝄄   Banco: $${formatNumber(u.bank)} | Cartera: $${formatNumber(u.money)}\n`;
      if (u.isJailed && u.jailUntil && u.jailUntil > new Date()) {
        txt += `       𝄄   🚔 EN PRISIÓN\n`;
      }
      txt += '\n';
    });

    txt += `                 𑂯 ( ⚡ ) ⁺ 𓈒  ׁ     
       𝄄   _¡Sigue trabajando para entrar al top!_`;

    await sock.sendMessage(m.key.remoteJid, { text: txt, mentions: top10.map(u => u._id) }, { quoted: m });
  },

  transferir: async (sock, m, args, currentUser, config, reply, sender) => {
    const user = currentUser;
    const jail = checkJail(user);
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

    if (user.money < monto) {
      return reply(fmt.aviso(`No tienes suficiente dinero para transferir *${formatNumber(monto)}* monedas.`));
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return reply(fmt.aviso('El destinatario no tiene un perfil registrado todavía.'));
    }

    user.money -= monto;
    targetUser.money += monto;
    await user.save();
    await targetUser.save();

    const texto = fmt.aviso(`💸 *TRANSFERENCIA EXITOSA*\n\nHas transferido *${formatNumber(monto)}* monedas a ${fmt.mention(targetId)}.\n       𝄄   _Tu nuevo saldo: ${formatNumber(user.money)}_`);
    
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

module.exports = economyCommands;
