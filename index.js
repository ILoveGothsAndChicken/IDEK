const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 10000;
const DATA_FILE = './keys.json';

let db = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : { keys: {}, users: {} };
const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send("Auth Server is Online!"));

app.post('/verify', (req, res) => {
    const { key, hwid } = req.body;
    if (!db.keys[key]) return res.status(404).json({ message: "Invalid Key" });

    const entry = db.keys[key];
    if (entry.hwid === "NONE") {
        entry.hwid = hwid;
        saveDB();
        return res.json({ status: "success", message: "HWID Bound" });
    } else if (entry.hwid === hwid) {
        return res.json({ status: "success", message: "Success" });
    }
    res.status(403).json({ message: "HWID Mismatch" });
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder().setName('gen').setDescription('Generate your license key'),
    new SlashCommandBuilder().setName('deletekey').setDescription('Admin: Delete a key').addStringOption(o => o.setName('key').setRequired(true)),
    new SlashCommandBuilder().setName('resetkeys').setDescription('Admin: Wipe all keys')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("Commands Registered!");
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'gen') {
        if (db.users[interaction.user.id]) {
            return interaction.reply({ content: `You already have a key: \`${db.users[interaction.user.id]}\``, ephemeral: true });
        }
        const newKey = `MAFIA-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        db.keys[newKey] = { owner: interaction.user.id, hwid: "NONE" };
        db.users[interaction.user.id] = newKey;
        saveDB();
        await interaction.reply({ content: `Key: \`${newKey}\` (Locked to your PC on first use)`, ephemeral: true });
    }

    if (interaction.user.id !== ADMIN_ID) return;

    if (interaction.commandName === 'deletekey') {
        const key = interaction.options.getString('key');
        if (db.keys[key]) {
            delete db.users[db.keys[key].owner];
            delete db.keys[key];
            saveDB();
            interaction.reply(`Deleted ${key}`);
        } else interaction.reply("Not found.");
    }

    if (interaction.commandName === 'resetkeys') {
        db = { keys: {}, users: {} };
        saveDB();
        interaction.reply("Database wiped.");
    }
});

client.login(TOKEN);
app.listen(PORT, '0.0.0.0', () => console.log(`API on port ${PORT}`));
