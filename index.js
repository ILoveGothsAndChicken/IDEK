const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const { QuickDB } = require("quick.db");
const axios = require('axios');

const db = new QuickDB();
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CONFIGURATION ---
const TOKEN = process.env.TOKEN;
const AUTHORIZED_IDS = ["911401729868857434", "1223823990632747109"];
const REQUIRED_ROLE_ID = "1340792386044956715";
const RENDER_URL = "https://discord-bot-1-puhl.onrender.com";

// --- WEB SERVER ---
app.get('/', (req, res) => {
    res.send("Bot & API are Online 24/7.");
});

// Verification Endpoint for Loader
app.post('/verify', async (req, res) => {
    const { key, hwid } = req.body;
    console.log(`[API] Verify Attempt - Key: ${key} | HWID: ${hwid}`);
    
    if (!key || !hwid || hwid === "undefined" || hwid.length < 5) {
        return res.send("INVALID_REQUEST"); 
    }

    const keyData = await db.get(`key_${key}`);
    if (!keyData) return res.send("INVALID_KEY");

    const allData = await db.all();
    const existingBinding = allData.find(item => 
        item.id.startsWith("key_") && 
        item.value.hwid === hwid && 
        item.id !== `key_${key}`
    );

    if (existingBinding) return res.send("PC_ALREADY_LINKED");

    if (!keyData.hwid) {
        await db.set(`key_${key}`, { ...keyData, hwid: hwid });
        console.log(`[DB] Key ${key} locked to HWID: ${hwid}`);
        return res.send("SUCCESS");
    }

    if (keyData.hwid === hwid) return res.send("SUCCESS");
    
    return res.send("HWID_MISMATCH");
});

// --- DISCORD BOT ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences // Added to help with status visibility
    ] 
});

// Attempt Login Immediately
console.log('[BOT] Attempting to connect to Discord...');
client.login(TOKEN).catch(err => {
    console.error(`[ERROR] Discord login failed: ${err.message}`);
    console.error(`[DEBUG] Check if your 'TOKEN' environment variable is correct in Render.`);
});

client.on('ready', async () => {
    console.log(`✅ [BOT] Logged in as ${client.user.tag}`);
    
    // Force status to Online
    client.user.setPresence({
        activities: [{ name: 'Verifying Keys', type: 0 }],
        status: 'online',
    });

    const commands = [
        new SlashCommandBuilder().setName('gen').setDescription('Generate a new license key'),
        new SlashCommandBuilder().setName('reset').setDescription('Admin only: Clear all keys'),
        new SlashCommandBuilder().setName('delete').setDescription('Admin only: Delete a specific key')
            .addStringOption(option => option.setName('key').setDescription('The full key to delete').setRequired(true)),
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('[BOT] Syncing slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ [BOT] Commands registered successfully.');
    } catch (error) {
        console.error(`[ERROR] Registration failed: ${error}`);
    }
});

// Interaction Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    console.log(`[BOT] Command /${interaction.commandName} by ${interaction.user.tag}`);

    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (err) {
        return;
    }

    const { commandName, user, member } = interaction;
    const hasRole = member?.roles?.cache.has(REQUIRED_ROLE_ID);
    const isAuthorized = AUTHORIZED_IDS.includes(user.id);

    if (!hasRole && !isAuthorized) {
        return interaction.editReply({ content: "❌ Access Denied. You do not have the required role." });
    }

    if (commandName === 'gen') {
        try {
            const allData = await db.all();
            const existingEntry = allData.find(item => item.id.startsWith("key_") && item.value.ownerId === user.id);

            if (existingEntry) {
                const keyName = existingEntry.id.replace("key_", "");
                return interaction.editReply(`You already have a key: \`${keyName}\``);
            }

            const newKey = "GT-" + Math.random().toString(36).substring(2, 10).toUpperCase();
            await db.set(`key_${newKey}`, { hwid: null, owner: user.tag, ownerId: user.id });
            return interaction.editReply(`**Key Generated!**\nKey: \`${newKey}\``);
        } catch (err) {
            return interaction.editReply("❌ Database error.");
        }
    }

    if (commandName === 'delete' || commandName === 'reset') {
        if (!isAuthorized) return interaction.editReply("❌ Admin only.");

        if (commandName === 'delete') {
            const target = interaction.options.getString('key');
            await db.delete(`key_${target}`);
            return interaction.editReply(`Deleted key: \`${target}\``);
        }

        if (commandName === 'reset') {
            const allData = await db.all();
            const keys = allData.filter(e => e.id.startsWith("key_"));
            await Promise.all(keys.map(e => db.delete(e.id)));
            return interaction.editReply(`✅ Database wiped. Removed ${keys.length} keys.`);
        }
    }
});

// --- RENDER PORT BINDING ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [SERVER] API Listening on port ${PORT}`);
});

// Self-ping to keep alive
setInterval(() => {
  axios.get(RENDER_URL) 
    .then(() => console.log('[SERVER] Ping: Success'))
    .catch(() => console.log('[SERVER] Ping: Failed (App may be sleeping)'));
}, 1000 * 60 * 5);
