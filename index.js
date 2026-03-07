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
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, options, member } = interaction;
    const hasRole = member.roles.cache.has(REQUIRED_ROLE_ID);
    const isAuthorized = AUTHORIZED_IDS.includes(user.id);

    if (!hasRole && !isAuthorized) {
        return interaction.reply({ content: "❌ Access Denied.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'gen') {
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
    }

    if (commandName === 'delete' || commandName === 'reset') {
        if (!isAuthorized) return interaction.editReply({ content: "❌ Admin only." });

        if (commandName === 'delete') {
            const keyToDelete = options.getString('key');
            await db.delete(`key_${keyToDelete}`);
            return interaction.editReply({ content: `Deleted \`${keyToDelete}\`` });
        }

        if (commandName === 'reset') {
            const allData = await db.all();
            const keysToDelete = allData.filter(entry => entry.id.startsWith("key_"));
            
            await Promise.all(keysToDelete.map(entry => db.delete(entry.id)));
            
            return interaction.editReply({ content: `Database cleared (${keysToDelete.length} keys removed).` });
        }
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

client.login(TOKEN);

