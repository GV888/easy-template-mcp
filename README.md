# Easy-Template MCP Server

MCP Server für [Easy-Template.com](https://www.easy-template.com) — stellt die Easy-Template API als Tool-Set für KI-Assistenten (Claude Desktop, VS Code Copilot u.a.) bereit.

---

## Projektstruktur

```
easy-template-mcp/
├── package.json
├── .env.example
├── mcp-config.example.json
└── src/
    ├── api.js       # Easy-Template API-Client
    └── mcp.js       # MCP Server (stdio)
```

---

## Installation

```bash
npm install
cp .env.example .env
```

`.env` befüllen:
```env
# Optional: Auto-Login beim Serverstart
ET_CLIENT_ID=deine_client_id
ET_CLIENT_SECRET=dein_client_secret
```

---

## Einbindung

### Claude Desktop

Datei öffnen:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "easy-template": {
      "command": "node",
      "args": ["C:/Users/.../easy-template-mcp/src/mcp.js"],
      "env": {
        "ET_CLIENT_ID": "deine_client_id",
        "ET_CLIENT_SECRET": "dein_client_secret"
      }
    }
  }
}
```

Claude Desktop neu starten → `et_*`-Tools sind sofort verfügbar.

### VS Code (Copilot)

`.vscode/mcp.json` im Workspace anlegen:

```json
{
  "servers": {
    "easy-template": {
      "type": "stdio",
      "command": "node",
      "args": ["./src/mcp.js"],
      "env": {
        "ET_CLIENT_ID": "deine_client_id",
        "ET_CLIENT_SECRET": "dein_client_secret"
      }
    }
  }
}
```

### Manuell starten

```bash
npm start
```

---

## Verfügbare Tools

| Tool | Parameter | Beschreibung |
|---|---|---|
| `et_login` | `clientId`, `clientSecret` | Bei Easy-Template anmelden |
| `et_list_items` | `offset`, `limit` | Artikel auflisten (Pagination) |
| `et_get_item` | `articleId` | Einzelnen Artikel abrufen |
| `et_create_item` | `article` | Neuen Artikel anlegen |
| `et_update_item` | `articleId`, `article` | Artikel aktualisieren (partial update) |
| `et_send_to_ebay` | `articleId`, `testMode?`, `template_id?` | Artikel auf eBay listen |
| `et_get_ebay_item` | `itemID` | eBay-Artikel nach ItemID abrufen |
| `et_get_template` | `ebayItemId`, `templateId?` | Gerendertes Template-HTML abrufen |

> Sind `ET_CLIENT_ID` und `ET_CLIENT_SECRET` als Umgebungsvariablen gesetzt, erfolgt der Login automatisch beim Start. Alternativ `et_login` zuerst aufrufen.

---

## Authentifizierung

1. `POST /token` mit `Token: Basic base64(clientId:clientSecret)`
2. Gibt `accessToken` (1 h) + `refreshToken` (24 h) zurück
3. `ensureToken()` prüft vor jedem Aufruf die Ablaufzeit und erneuert automatisch

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Server startet nicht | `node --version` ≥ 18 prüfen; `npm install` ausgeführt? |
| Authentifizierung fehlgeschlagen | Client ID / Secret korrekt? API-Zugriff freigeschaltet? |
| Artikel-Liste leer | `et_login` aufgerufen? Konto enthält Artikel? |
| Pfadfehler (Windows) | Backslashes in der Config durch `/` ersetzen |

---

## Lizenz

MIT


