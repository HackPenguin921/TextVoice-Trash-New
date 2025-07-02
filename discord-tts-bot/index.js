require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = createAudioPlayer();

// Bot起動
client.once('ready', () => {
  console.log(`🤖 Bot起動完了: ${client.user.tag}`);
});

// 誰かがメッセージを打ったら読み上げ
client.on('messageCreate', async message => {
  if (message.author.bot || message.channel.id !== process.env.CHANNEL_ID) return;

  await speak(message.content, message);
});

// WebからPOSTされたテキストも読み上げ
app.post('/speak', async (req, res) => {
  const text = req.body.text;
  const userId = req.body.userId || 'web';

  if (!text) return res.status(400).send('❌ textが空です');

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return res.status(404).send('❌ GUILDが見つかりません');

  const member = [...guild.members.cache.values()].find(m => !m.user.bot && m.voice.channel);
  if (!member) return res.status(404).send('❌ VCに誰もいません');

  await speak(text, { member });
  res.send(`🔊 読み上げ: ${text}`);
});

// 読み上げ処理共通関数
async function speak(text, context) {
  const url = googleTTS.getAudioUrl(text, { lang: 'ja', slow: false });
  const response = await axios.get(url, { responseType: 'stream' });
  const filePath = `tts-${Date.now()}.mp3`;
  const writer = fs.createWriteStream(filePath);

  response.data.pipe(writer);
  writer.on('finish', () => {
    const connection = getVoiceConnection(process.env.GUILD_ID) ||
      joinVoiceChannel({
        channelId: context.member.voice.channelId,
        guildId: process.env.GUILD_ID,
        adapterCreator: context.member.guild.voiceAdapterCreator,
      });

    const resource = createAudioResource(filePath);
    connection.subscribe(player);
    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
      fs.unlinkSync(filePath);
    });
  });
}

client.login(process.env.DISCORD_TOKEN);

app.get('/', (req, res) => res.send('🌐 Bot is alive'));
app.listen(PORT, () => console.log(`🌐 Webサーバー起動: http://localhost:${PORT}`));
