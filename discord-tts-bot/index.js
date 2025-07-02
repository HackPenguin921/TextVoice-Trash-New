require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  getVoiceConnection
} = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const fs = require('fs');

const app = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
const player = createAudioPlayer();

app.use(express.json());

const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// 🔄 ユーザー入退室でBotも自動入退出
client.on('voiceStateUpdate', async (oldState, newState) => {
  const user = newState.member?.user || oldState.member?.user;
  if (!user || user.bot) return;
  const guildId = newState.guild.id;
  const joinedChannel = newState.channel;
  const leftChannel = oldState.channel;

  if (!leftChannel && joinedChannel) {
    if (!getVoiceConnection(guildId)) {
      joinVoiceChannel({
        channelId: joinedChannel.id,
        guildId,
        adapterCreator: joinedChannel.guild.voiceAdapterCreator,
      });
      console.log("[VC] Botが参加しました");
    }
  }

  if (leftChannel) {
    const remaining = leftChannel.members.filter(m => !m.user.bot);
    if (remaining.size === 0) {
      const conn = getVoiceConnection(guildId);
      if (conn) conn.destroy();
      console.log("[VC] 無人のためBotが退出しました");
    }
  }
});

// 🗣️ Webhook受信 → テキストチャンネルに送信
app.post('/send-text', async (req, res) => {
  const text = req.body.text;
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (channel.isTextBased()) await channel.send(`🗣️ ${text}`);
  res.sendStatus(200);
});

// 💬 テキスト投稿 → VCで読み上げ
client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== CHANNEL_ID) return;
  const text = message.content;
  const url = googleTTS.getAudioUrl(text, { lang: 'ja', slow: false });

  const response = await axios.get(url, { responseType: 'stream' });
  const filePath = `tts-${Date.now()}.mp3`;
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);
  writer.on('finish', () => {
    const resource = createAudioResource(filePath);
    const conn = getVoiceConnection(GUILD_ID);
    if (conn) {
      conn.subscribe(player);
      player.play(resource);
      player.on('idle', () => fs.unlinkSync(filePath));
    }
  });
});

client.once('ready', () => {
  console.log(`🤖 Bot Ready: ${client.user.tag}`);
  app.listen(3000, () => console.log('🌐 Webhook待機中 http://localhost:3000'));
});

client.login(DISCORD_TOKEN);