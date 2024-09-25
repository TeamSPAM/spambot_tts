const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Partials,
    SlashCommandBuilder,
    Routes,
    REST,
} = require("discord.js");
const path = require("path");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
} = require("@discordjs/voice");
const fs = require("fs");
const gtts = require("gtts");
const { token, clientId, accentColor, errorColor } = require("./config.json");
const rest = new REST({ version: "10" }).setToken(token);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel],
});
const guildVoiceData = {};

const commands = [
    new SlashCommandBuilder()
        .setName("tts")
        .setDescription("tts")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("join")
                .setNameLocalizations({ ko: "입장" })
                .setDescription("tts bot join")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("leave")
                .setNameLocalizations({ ko: "퇴장" })
                .setDescription("tts bot leave")
        ),
];
try {
    rest.put(Routes.applicationCommands(clientId), {
        body: commands,
    });
    console.log(`Complete uploaded ${commands.length} general commands`);
} catch (error) {
    console.error(error);
}

client.on("ready", () => {
    console.log("bot is ready");
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand() && commandName === "tts") {
        if (commandOptions === "join") {
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("먼저 음성 채널에 들어가야 합니다.")
                    .setColor(errorColor);
                return interaction.reply({ embeds: [embed] });
            }

            // 길드에 대한 음성 연결과 플레이어 저장
            const guildId = interaction.guild.id;
            if (!guildVoiceData[guildId]) {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                const player = createAudioPlayer();

                guildVoiceData[guildId] = {
                    connection,
                    player,
                    isPlaying: false, // 음성 재생 상태
                    queue: [], // 읽어야 할 메시지 큐
                };

                connection.subscribe(player);

                // 메시지 재생이 끝났을 때, 큐가 있으면 다음 메시지를 재생
                player.on(AudioPlayerStatus.Idle, () => {
                    if (guildVoiceData[guildId].queue.length > 0) {
                        playNextMessage(guildId);
                    } else {
                        guildVoiceData[guildId].isPlaying = false;
                    }
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("음성 채널에 연결되었습니다.")
                .setColor(accentColor);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandOptions === "leave") {
            const guildId = interaction.guild.id;
            if (guildVoiceData[guildId]) {
                guildVoiceData[guildId].connection.disconnect();
                delete guildVoiceData[guildId];

                const embed = new EmbedBuilder()
                    .setTitle("재생을 중지하고 음성채널에서 나갔습니다.")
                    .setColor(accentColor);
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle("현재 음성 채널에 연결되어 있지 않습니다.")
                    .setColor(errorColor);
                await interaction.reply({ embeds: [embed] });
            }
        }
    }
});
client.on("messageCreate", (message) => {
    const guildId = message.guild.id;
    if (message.author.bot) return;

    if (guildVoiceData[guildId]) {
        let text;

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (urlRegex.test(message.content)) {
            text = "링크가 포함된 메세지입니다.";
        } else {
            text = message.content;
        }

        if (text.length <= 200) {
            guildVoiceData[guildId].queue.push(text);
        }

        if (!guildVoiceData[guildId].isPlaying) {
            playNextMessage(guildId);
        }
    }
});
async function playNextMessage(guildId) {
    const voiceData = guildVoiceData[guildId];
    if (voiceData.queue.length === 0) return;

    voiceData.isPlaying = true;
    const text = voiceData.queue.shift();
    const filePath = path.join(__dirname, `temp/${Date.now()}_tts.mp3`);
    const tts = new gtts(text, "ko");

    tts.save(filePath, (err) => {
        if (err) {
            console.error("TTS 변환 중 오류:", err);
            voiceData.isPlaying = false;
            return;
        }

        const resource = createAudioResource(filePath);
        voiceData.player.play(resource);

        voiceData.player.on(AudioPlayerStatus.Idle, () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
    });
}
client.login(token);
