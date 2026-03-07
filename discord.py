import discord
from discord import app_commands
from flask import Flask, request, jsonify
import threading
import random
import string
import json
import os
import datetime
import secrets

def get_token():
    with open("C:\\Users\\zackm\\Downloads\\Token.txt") as f:
        return f.read().strip()

TOKEN = get_token()
#AUTHORIZED_IDS = [911401729868857434, 1223823990632747109]
AUTHORIZED_IDS = [1223823990632747109]
LOG_CHANNEL_ID = 1456110794776252528
REQUIRED_ROLE_ID = 1340792386044956715
DB_FILE = "database.json"
SCAM_KEYWORDS = [
    "steam-community", 
]

def load_db():
    if not os.path.exists(DB_FILE): return {}
    with open(DB_FILE, "r") as f: return json.load(f)

def save_db(data):
    with open(DB_FILE, "w") as f: json.dump(data, f, indent=4)

app = Flask(__name__)

@app.route('/')
def home():
    return "Running 24/7."

@app.route('/verify', methods=['POST'])
def verify():
    data = request.json
    key, hwid = data.get("key"), data.get("hwid")
    
    if not key or not hwid or len(hwid) < 5:
        return "INVALID_REQUEST"

    db = load_db()
    key_path = f"key_{key}"
    
    if key_path not in db:
        return "INVALID_KEY"

    key_data = db[key_path]

    if not key_data.get("hwid"):
        key_data["hwid"] = hwid
        save_db(db)
        return "SUCCESS"
    elif key_data["hwid"] == hwid:
        return "SUCCESS"
    else:
        return "HWID_MISMATCH"

class MyBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True 
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        await self.tree.sync()

    async def on_ready(self):
        print(f"✅ Logged in as {self.user}!")

    async def on_message(self, message):
        if message.author.bot or message.author.id in AUTHORIZED_IDS:
            return

        content = message.content.lower()
        is_scam = any(keyword in content for keyword in SCAM_KEYWORDS)
        has_suspicious_link = "http" in content and ("nitro" in content or "gift" in content)

        if is_scam or has_suspicious_link:
            try:
                original_content = message.content
                await message.delete()
                duration = datetime.timedelta(hours=1)
                await message.author.timeout(duration, reason="Compromised account or Scam link")
                await message.channel.send(f"Heads up {message.author.mention}, has been hacked dont click on anything!", delete_after=5)
                
                log_channel = self.get_channel(LOG_CHANNEL_ID)
                if log_channel:
                    embed = discord.Embed(
                        title="Scam Link",
                        description=f"**User:** {message.author}\n**Channel:** {message.channel.mention}",
                        color=discord.Color.orange()
                    )
                    embed.add_field(name="Removed Message", value=f"```{original_content}```")
                    await log_channel.send(embed=embed)
            except discord.Forbidden:
                print("❌ ERROR: Bot needs 'Manage Messages' permission!")

bot = MyBot()

@bot.tree.command(name="gen", description="Generate your key")
async def gen(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    
    user = interaction.user
    is_auth = user.id in AUTHORIZED_IDS
    has_role = any(role.id == REQUIRED_ROLE_ID for role in user.roles) if interaction.guild else False

    if not is_auth and not has_role:
        return await interaction.followup.send("❌ Access Denied.")

    db = load_db()
    for k, v in db.items():
        if v.get("ownerId") == user.id:
            return await interaction.followup.send(f"You already have a key: `{k.replace('key_', '')}`")

    alphabet = string.ascii_uppercase + string.digits
    new_key = "GT-" + ''.join(secrets.choice(alphabet) for _ in range(8))
    #new_key = "GT-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    db[f"key_{new_key}"] = {"hwid": None, "owner": str(user), "ownerId": user.id}
    save_db(db)
    
    await interaction.followup.send(f"**Key Generated!**\nKey: `{new_key}`")

@bot.tree.command(name="delete", description="Delete a specific key")
@app_commands.describe(key="The key to delete")
async def delete(interaction: discord.Interaction, key: str):
    await interaction.response.defer(ephemeral=True)

    if interaction.user.id not in AUTHORIZED_IDS:
        return await interaction.followup.send("❌ Admin only")

    db = load_db()
    key_path = f"key_{key}"

    if key_path in db:
        del db[key_path]
        save_db(db)
        await interaction.followup.send(f"Successfully deleted key: `{key}`")
    else:
        await interaction.followup.send(f"❌ Key `{key}` not found in the database.")

@bot.tree.command(name="reset", description="Clear all keys")
async def reset(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    if interaction.user.id not in AUTHORIZED_IDS:
        return await interaction.followup.send("❌ Admin only")

    try:
        db = load_db()
        keys_to_delete = [k for k in db.keys() if k.startswith("key_")]
        
        count = len(keys_to_delete)
        for k in keys_to_delete:
            del db[k]
        
        save_db(db)
        await interaction.followup.send(f"✅ Database cleared. Removed {count} keys.")
        
    except Exception as e:
        print(f"Database Error (Reset): {e}")
        await interaction.followup.send("❌ Failed to clear the database.")

def run_flask():
    app.run(host="0.0.0.0", port=10000, debug=False, use_reloader=False)

if __name__ == "__main__":
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()
    
    print("Starting Discord Bot...")
    bot.run(TOKEN)
