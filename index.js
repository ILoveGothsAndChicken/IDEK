const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const { QuickDB } = require("quick.db");

const db = new QuickDB();
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const TOKEN = process.env.TOKEN;
const AUTHORIZED_IDS = ["911401729868857434", "1223823990632747109"];
const REQUIRED_ROLE_ID = "1340792386044956715";

app.get('/', (req, res) => {
    res.send("Running 24/7.");
});

app.post('/verify', async (req, res) => {
    const { key, hwid } = req.body;
    
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

    if (existingBinding) {
        return res.send("PC_ALREADY_LINKED");
    }

    if (!keyData.hwid) {
        await db.set(`key_${key}`, { ...keyData, hwid: hwid });
        console.log(`Key ${key} locked to HWID: ${hwid}`);
        return res.send("SUCCESS");
    }

    if (keyData.hwid === hwid) {
        return res.send("SUCCESS");
    }
    
    return res.send("HWID_MISMATCH");
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('gen')
            .setDescription('Generate your key'),
        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('Clear all keys from database'),
        new SlashCommandBuilder()
            .setName('delete')
            .setDescription('Admin only: Delete a specific key')
            .addStringOption(option => 
                option.setName('key')
                .setDescription('The full key to delete')
                .setRequired(true)),
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commands registered.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // 1. Ignore anything that isn't a slash command
    if (!interaction.isChatInputCommand()) return;

    // 2. ACKNOWLEDGE IMMEDIATELY
    // This stops the "Application did not respond" error by telling Discord you're working on it.
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (err) {
        console.error("Error deferring interaction:", err);
        return;
    }

    const { commandName, user, options, member } = interaction;

    // 3. Setup Permission Constants
    // member.roles.cache can be undefined in DMs, so we use optional chaining (?.)
    const hasRole = member?.roles?.cache.has(REQUIRED_ROLE_ID);
    const isAuthorized = AUTHORIZED_IDS.includes(user.id);

    // 4. Handle Access Denied (Use editReply now that we've deferred)
    if (!hasRole && !isAuthorized) {
        return interaction.editReply({ content: "❌ Access Denied. You do not have the required role." });
    }

    // --- COMMAND: GEN ---
    if (commandName === 'gen') {
        try {
            const allData = await db.all();
            const existingEntry = allData.find(item => 
                item.id.startsWith("key_") && item.value.ownerId === user.id
            );

            if (existingEntry) {
                const keyName = existingEntry.id.replace("key_", "");
                return interaction.editReply(`You already have a key: \`${keyName}\``);
            }

            const newKey = "GT-" + Math.random().toString(36).substring(2, 10).toUpperCase();
            await db.set(`key_${newKey}`, { 
                hwid: null, 
                owner: user.tag,
                ownerId: user.id 
            });

            return interaction.editReply(`**Key Generated!**\nKey: \`${newKey}\``);
        } catch (dbError) {
            console.error("Database Error (Gen):", dbError);
            return interaction.editReply("❌ An error occurred while accessing the database.");
        }
    }

    // --- COMMAND: DELETE & RESET (Admin Only) ---
    if (commandName === 'delete' || commandName === 'reset') {
        if (!isAuthorized) {
            return interaction.editReply({ content: "❌ Admin only. You are not in the authorized IDs list." });
        }

        if (commandName === 'delete') {
            const keyToDelete = options.getString('key');
            await db.delete(`key_${keyToDelete}`);
            return interaction.editReply({ content: `Successfully deleted key: \`${keyToDelete}\`` });
        }

        if (commandName === 'reset') {
            try {
                const allData = await db.all();
                const keysToDelete = allData.filter(entry => entry.id.startsWith("key_"));
                
                // Use Promise.all to delete everything at once instead of a slow loop
                await Promise.all(keysToDelete.map(entry => db.delete(entry.id)));
                
                return interaction.editReply({ content: `✅ Database cleared. Removed ${keysToDelete.length} keys.` });
            } catch (dbError) {
                console.error("Database Error (Reset):", dbError);
                return interaction.editReply("❌ Failed to clear the database.");
            }
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

client.login(TOKEN);

const axios = require('axios');

setInterval(() => {
  axios.get('https://gt-verification-api.onrender.com')
    .then(() => console.log('Self-ping successful: Bot is awake.'))
    .catch(err => console.error('Self-ping failed:', err.message));
}, 1000 * 60 * 5); // Pings every 5 minutes
