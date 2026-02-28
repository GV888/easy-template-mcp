# Easy-Template MCP – Setup Anleitung

## 1. Installation

```bash
git clone https://github.com/dein-repo/easy-template-mcp
cd easy-template-mcp
npm install
```

---

## 2. Umgebungsvariablen konfigurieren

Kopiere `.env.example` nach `.env` und fülle die Werte aus:

```bash
cp .env.example .env
```

```env
# Telegram Bot Token (von @BotFather)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Easy-Template Zugangsdaten
ET_CLIENT_ID=deine_client_id
ET_CLIENT_SECRET=dein_client_secret

# Cloudinary (für Bild-Upload via Telegram Bot)
# Account erstellen: https://cloudinary.com/users/register_free
CLOUDINARY_CLOUD_NAME=dein_cloud_name
CLOUDINARY_API_KEY=dein_api_key
CLOUDINARY_API_SECRET=dein_api_secret
```

---

## 3. MCP Server starten

```bash
npm start
# oder
npm run mcp
```

---

## 4. MCP in Claude Desktop einrichten

Datei öffnen: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "easy-template": {
      "command": "node",
      "args": ["C:/Users/DEIN_USER/git/easy-template-mcp/src/mcp.js"],
      "env": {
        "ET_CLIENT_ID": "deine_client_id",
        "ET_CLIENT_SECRET": "dein_client_secret"
      }
    }
  }
}
```

> Claude Desktop herunterladen: https://claude.ai/download

---

## 5. Telegram Bot einrichten

### 5.1 Bot erstellen

1. Öffne Telegram und schreibe [@BotFather](https://t.me/BotFather)
2. Sende `/newbot` und folge den Anweisungen
3. Kopiere den Bot-Token in die `.env` unter `TELEGRAM_BOT_TOKEN`

### 5.2 Cloudinary Account erstellen

1. Registrieren: https://cloudinary.com/users/register_free (kostenlos)
2. Im Dashboard: `Cloud Name`, `API Key` und `API Secret` kopieren
3. Werte in die `.env` eintragen

### 5.3 Bot starten

```bash
npm run bot
```

---

## 6. Telegram Bot – Verfügbare Befehle

| Befehl | Beschreibung |
|---|---|
| 📸 Foto senden | Bild wird zu Cloudinary hochgeladen → öffentliche URL wird zurückgegeben |
| 📎 Datei senden | Bild in Originalauflösung hochladen (als Datei senden, nicht als Foto) |
| `/start` | Bot starten und Hilfe anzeigen |
| `/help` | Alle Befehle anzeigen |
| `/items [limit]` | Artikel-Liste anzeigen (Standard: 10) |
| `/item <id>` | Artikel-Details anzeigen |
| `/addimage <id> <url>` | Bild-URL einem Artikel hinzufügen |

**Beispiel-Workflow:**
1. Foto an den Bot senden
2. Bot gibt URL zurück, z.B. `https://res.cloudinary.com/.../bild.jpg`
3. `/addimage 2563066 https://res.cloudinary.com/.../bild.jpg`

---

## 7. Verfügbare MCP Tools

| Tool | Beschreibung |
|---|---|
| `et_login` | Authentifizierung mit Easy-Template API |
| `et_list_items` | Artikel-Liste abrufen |
| `et_get_item` | Einzelnen Artikel abrufen |
| `et_create_item` | Neuen Artikel erstellen |
| `et_update_item` | Artikel aktualisieren |
| `et_send_to_ebay` | Artikel zu eBay senden |
| `et_get_ebay_item` | eBay-Listing abrufen |
| `et_get_seller_events` | eBay Verkäufer-Events abrufen |
| `et_send_template_to_ebay` | Template-HTML zu eBay senden |
| `et_get_template` | Gerendertes Template-HTML abrufen |
