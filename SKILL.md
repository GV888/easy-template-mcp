---
name: easy-template
description: Manage Easy-Template.com articles and eBay listings via MCP tools.
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - ET_CLIENT_ID
        - ET_CLIENT_SECRET
      bins:
        - node
    primaryEnv: ET_CLIENT_ID
    emoji: "📦"
    homepage: https://github.com/easy-template/easy-template-mcp
    install:
      - npm install
---

# Easy-Template MCP Skill

MCP-Server für [Easy-Template.com](https://www.easy-template.com) — verwalte eBay-Artikel und -Listings direkt über KI-Tools.

## Setup

Nach der Installation müssen die Umgebungsvariablen gesetzt werden:

- `ET_CLIENT_ID` — Deine Easy-Template Client-ID
- `ET_CLIENT_SECRET` — Dein Easy-Template Client-Secret

Der Server startet mit:

```bash
node src/mcp.js
```

Sind `ET_CLIENT_ID` und `ET_CLIENT_SECRET` gesetzt, erfolgt der Login automatisch beim Start.

## Verfügbare Tools

### `et_login`
Bei Easy-Template.com anmelden.
- `clientId` (string, required) — Easy-Template Client ID
- `clientSecret` (string, required) — Easy-Template Client Secret

### `et_list_items`
Artikel auflisten mit Pagination und Filterung.
- `articleIds` (string) — Kommagetrennte Artikel-IDs zum Filtern (z.B. "123,456,789")
- `offset` (integer) — Pagination-Offset (Standard: 0)
- `limit` (integer) — Anzahl Ergebnisse (Standard: 10, max: 100)
- `orderField` (string) — Feld zum Sortieren (Standard: id)
- `orderDirection` (integer) — 0 = absteigend, 1 = aufsteigend (Standard: 0)

### `et_get_item`
Einzelnen Artikel nach lokaler Artikel-ID abrufen.
- `articleId` (integer, required) — Lokale Artikel-ID

### `et_create_item`
Neuen Artikel in Easy-Template.com anlegen. Gibt die neue articleId und zugewiesene template_id zurück.
- `article` (object, required) — Produktdaten. Wichtige Felder: Title, ProductCode (SKU), SalePrice, OriginalPrice, Quantity, images (Array von URLs), shortDescription, longDescription, EAN, Country, Currency, CategoryID, ebaySiteId, ConditionID, template_id, Variations.

### `et_update_item`
Bestehenden Artikel aktualisieren (Partial Update — nur übergebene Felder werden geändert).
- `articleId` (integer, required) — ID des Artikels
- `article` (object, required) — Partielle Produktdaten mit den zu ändernden Feldern

### `et_send_to_ebay`
Artikel auf eBay listen. Erstellt ein neues Listing (AddItem) wenn keine eBay ItemID existiert, oder aktualisiert ein bestehendes (ReviseItem).
- `articleId` (integer, required) — Lokale Artikel-ID
- `testMode` (boolean) — Bei true wird VerifyAddItem verwendet (kein echtes Listing)
- `template_id` (integer) — Optionale explizite Template-ID
- `article` (boolean) — Artikeldaten senden (Standard: true)
- `picture` (boolean) — Bilder senden (Standard: true)
- `price` (boolean) — Preisdaten senden (Standard: true)
- `amount` (boolean) — Menge senden (Standard: true)
- `title` (boolean) — Titel senden (Standard: true)
- `sku` (boolean) — SKU/ProductCode senden (Standard: true)
- `html` (boolean) — Template-HTML rendern und senden (Standard: true)
- `Specifics` (boolean) — ItemSpecifics senden (Standard: true)
- `ebaySettings` (boolean) — eBay-Profilsettings mergen (Standard: true)
- `uvp` (boolean) — OriginalRetailPrice (UVP) senden
- `StoreCategoryID` (boolean) — StoreCategoryID senden
- `CategoryID` (boolean) — CategoryID senden
- `ean` (boolean) — EAN senden

### `et_get_ebay_item`
eBay-Artikel nach ItemID abrufen.
- `itemID` (string, required) — eBay Item ID (z.B. "165775527034")

### `et_get_seller_events`
Alle eBay-Seller-Events (verkauft, überarbeitet, neu gelistet) seit einem Unix-Timestamp abrufen.
- `startTime` (integer, required) — Unix-Timestamp ab dem Events abgerufen werden

### `et_send_template_to_ebay`
Gerendertes Template-HTML an eBay senden für bestehende Listings (max 10 auf einmal).
- `itemIDs` (array of integer, required) — Array von eBay ItemIDs (max 10)

### `et_get_template`
Gerendertes HTML-Template für einen eBay-Artikel abrufen.
- `ebayItemId` (string, required) — eBay Item ID
- `templateId` (integer) — Optionale Template-ID (nutzt Standard wenn nicht angegeben)

## Authentifizierung

1. Login mit `clientId` und `clientSecret` → gibt `accessToken` (1 h) + `refreshToken` (24 h) zurück
2. Token wird automatisch vor jedem Aufruf geprüft und bei Bedarf erneuert
3. Bei gesetzten Umgebungsvariablen erfolgt Auto-Login beim Serverstart

## Publishing

```bash
npx clawhub@latest login
npx clawhub@latest publish . --slug easy-template --version 1.0.0 --tags latest --changelog "Initial release"
```
