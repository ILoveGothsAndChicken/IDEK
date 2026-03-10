import discord
from discord import app_commands
from flask import Flask, request, jsonify
import json
import os
import random
import string
import threading

ADMIN_ID = 1223823990632747109
PORT = int(os.environ.get("PORT", 10000))
TOKEN = os.environ.get("DISCORD_TOKEN")

DATA_FILE = "keys.json"
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w") as f:
        json.dump({"keys": {}, "users": {}}, f)

def load_db():
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_db(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)

class MafiaBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        await self.tree.sync()

bot = MafiaBot()

app = Flask(__name__)

@app.route('/')
def home():
    return "Mafia Auth Server (Python) is Online!"

@app.route('/verify', methods=['POST'])
def verify():
    data = request.json
    key = data.get("key")
    hwid = data.get("hwid")
    
    db = load_db()
    
    if key not in db["keys"]:
        return jsonify({"message": "Invalid Key"}), 404

    entry = db["keys"][key]
    
    if entry["hwid"] == "NONE":
        entry["hwid"] = hwid
        save_db(db)
        return jsonify({"status": "success", "message": "HWID Bound"})
    
    if entry["hwid"] == hwid:
        return jsonify({"status": "success", "message": "Success"})
    
    return jsonify({"message": "HWID Mismatch"}), 403

def run_flask():
    app.run(host='0.0.0.0', port=PORT)

@bot.event
async def on_ready():
    print("-----------------------------------------")
    print(f"[!] BOT IS ONLINE: {bot.user}")
    print(f"[+] Web API started on Port {PORT}")
    print("-----------------------------------------")

@bot.tree.command(name="gen", description="Generate your license key")
async def gen(interaction: discord.Interaction):
    db = load_db()
    user_id = str(interaction.user.id)
    
    if user_id in db["users"]:
        return await interaction.response.send_message(
            f"You already have a key: `{db['users'][user_id]}`", ephemeral=True
        )
    
    new_key = "OBLIVION-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    db["keys"][new_key] = {"owner": user_id, "hwid": "NONE"}
    db["users"][user_id] = new_key
    save_db(db)
    
    await interaction.response.send_message(
        f"Key Generated: `{new_key}`", ephemeral=True
    )

@bot.tree.command(name="deletekey", description="Admin: Delete a key")
async def delete_key(interaction: discord.Interaction, key: str):
    if interaction.user.id != ADMIN_ID:
        return await interaction.response.send_message("No permission.", ephemeral=True)
    
    db = load_db()
    if key in db["keys"]:
        owner_id = db["keys"][key]["owner"]
        del db["users"][owner_id]
        del db["keys"][key]
        save_db(db)
        await interaction.response.send_message(f"Deleted `{key}`")
    else:
        await interaction.response.send_message("Key not found.")

if __name__ == "__main__":
    if TOKEN:
        bot.run(TOKEN)
    else:
        print("CRITICAL ERROR: 'DISCORD_TOKEN' environment variable is missing!")
