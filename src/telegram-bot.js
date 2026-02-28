const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TelegramBot = require('node-telegram-bot-api');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const OpenAI = require('openai');
const EasyTemplateAPI = require('./api.js');

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const bot = new TelegramBot(TOKEN, { polling: true });
const api = new EasyTemplateAPI();
const openai = (() => {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  if (process.env.GITHUB_TOKEN) {
    // GitHub Models – OpenAI-kompatible API (GPT-4o Vision inklusive)
    return new OpenAI({
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey: process.env.GITHUB_TOKEN
    });
  }
  return null;
})();

// Pending articles awaiting user confirmation: chatId -> articleData
const pendingArticles = new Map();

// Auto-login
if (process.env.ET_CLIENT_ID && process.env.ET_CLIENT_SECRET) {
  api.login(process.env.ET_CLIENT_ID, process.env.ET_CLIENT_SECRET)
    .then(() => console.log('✅ Easy-Template: Auto-login successful'))
    .catch(e => console.error('⚠️  Auto-login failed:', e.message));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function uploadToCloudinary(telegramFileUrl) {
  const result = await cloudinary.uploader.upload(telegramFileUrl, {
    folder: 'easy-template'
  });
  return result.secure_url;
}

async function getTelegramFileUrl(fileId) {
  const file = await bot.getFile(fileId);
  return `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  try {
    await bot.sendMessage(msg.chat.id,
      '👋 Easy-Template Bot\n\n' +
      '📷 Foto senden – KI analysiert das Produkt, füllt die Artikelstruktur aus und fragt ob du es anlegen willst.\n\n' +
      'Befehle:\n' +
      '/items – Artikel-Liste anzeigen\n' +
      '/item <id> – Artikel-Details\n' +
      '/addimage <id> <url> – Bild-URL einem Artikel hinzufügen\n' +
      '/help – Diese Hilfe'
    );
  } catch(e) {
    console.error('[/start] sendMessage error:', e.message);
  }
});

bot.onText(/\/help/, async (msg) => {
  bot.sendMessage(msg.chat.id,
    'Verfügbare Befehle:\n\n' +
    '📷 Foto senden – KI erkennt Produktinfos → Artikel-Vorschau → auf Wunsch anlegen\n' +
    '/items [limit] – Artikel-Liste (Standard: 10)\n' +
    '/item <id> – Artikel-Details\n' +
    '/addimage <id> <url> – Bild-URL einem Artikel hinzufügen'
  );
});

bot.onText(/\/items(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const limit = parseInt(match[1]) || 10;

  try {
    await bot.sendMessage(chatId, '⏳ Lade Artikel...');
    const data = await api.getItems(0, limit);
    const items = data.list || data;

    const lines = items.map(i =>
      `• *${i.id}* – ${(i.Title || '').substring(0, 50)} – ${i.SalePrice}€`
    ).join('\n');

    bot.sendMessage(chatId, `📦 *${items.length} Artikel:*\n\n${lines}`, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, `❌ Fehler: ${e.message}`);
  }
});

bot.onText(/\/item (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const articleId = parseInt(match[1]);

  try {
    const item = await api.getItem(articleId);
    const title  = item.Title || item.article?.Title || '?';
    const price  = item.SalePrice || item.article?.SalePrice || '?';
    const qty    = item.Quantity || item.article?.Quantity || '?';
    const images = item.images || item.article?.images || [];

    const imgList = images.length
      ? images.slice(0, 3).map((u, i) => `  ${i + 1}. ${u}`).join('\n')
      : '  *(keine Bilder)*';

    bot.sendMessage(chatId,
      `📄 *Artikel ${articleId}*\n\n` +
      `Titel: ${title}\nPreis: ${price}€\nMenge: ${qty}\n\n` +
      `🖼 Bilder:\n${imgList}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ Fehler: ${e.message}`);
  }
});

bot.onText(/\/addimage (\d+) (https?:\/\/\S+)/, async (msg, match) => {
  const chatId    = msg.chat.id;
  const articleId = parseInt(match[1]);
  const imageUrl  = match[2];

  try {
    const item = await api.getItem(articleId);
    const existing = item.images || item.article?.images || [];
    const updated  = [...existing, imageUrl];

    await api.updateItem(articleId, { images: updated });
    bot.sendMessage(chatId,
      `✅ Bild zu Artikel *${articleId}* hinzugefügt!\n\nURL: ${imageUrl}\nGesamt Bilder: ${updated.length}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ Fehler: ${e.message}`);
  }
});

// ─── AI Vision ───────────────────────────────────────────────────────────────

async function analyzeImageForProduct(imageUrl) {
  if (!openai) throw new Error('OPENAI_API_KEY nicht gesetzt');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analysiere dieses Produktbild und extrahiere die Informationen als reines JSON-Objekt (kein Markdown, keine Codeblöcke):
{
  "Title": "Produkttitel (max 80 Zeichen, Deutsch)",
  "SalePrice": <Zahl, geschätzter Verkaufspreis in EUR>,
  "OriginalPrice": <Zahl oder null>,
  "Quantity": 1,
  "ProductCode": "",
  "shortDescription": "Kurzbeschreibung (1-2 Sätze, Deutsch)",
  "longDescription": "Detaillierte Beschreibung (3-5 Sätze, Deutsch)"
}`
        },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }],
    max_tokens: 600
  });

  const text = response.choices[0].message.content.trim()
    .replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(text);
}

function formatArticlePreview(article, imageUrl) {
  return (
    `🤖 *KI-Analyse – Artikelvorschau*\n\n` +
    `📌 *Titel:* ${article.Title}\n` +
    `💶 *Preis:* ${article.SalePrice} €` +
    (article.OriginalPrice ? ` _(UVP: ${article.OriginalPrice} €)_` : '') + `\n` +
    `📦 *Menge:* ${article.Quantity}\n` +
    (article.ProductCode ? `🔖 *SKU:* ${article.ProductCode}\n` : '') +
    `\n📝 *Kurzbeschreibung:*\n${article.shortDescription}\n` +
    `\n📄 *Langbeschreibung:*\n${article.longDescription}\n` +
    `\n🖼 *Bild:* [Cloudinary](${imageUrl})\n\n` +
    `Soll ich diesen Artikel anlegen?`
  );
}

// ─── Photo handler ────────────────────────────────────────────────────────────

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return bot.sendMessage(chatId,
      '⚠️ Cloudinary ist nicht konfiguriert.\nBitte `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` und `CLOUDINARY_API_SECRET` in der `.env` setzen.'
    );
  }

  const statusMsg = await bot.sendMessage(chatId, '⏳ Bild wird hochgeladen und analysiert...');

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileUrl = await getTelegramFileUrl(photo.file_id);
    const publicUrl = await uploadToCloudinary(fileUrl);

    if (!openai) {
      return bot.editMessageText(
        `✅ *Bild hochgeladen!*\n\n🔗 URL:\n\`${publicUrl}\`\n\n` +
        `Artikel zuweisen:\n/addimage <artikel-id> ${publicUrl}\n\n` +
        `⚠️ Für KI-Analyse bitte \`OPENAI_API_KEY\` oder \`GITHUB_TOKEN\` in der \`.env\` setzen.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );
    }

    await bot.editMessageText('⏳ KI analysiert das Produktbild...', {
      chat_id: chatId, message_id: statusMsg.message_id
    });

    const article = await analyzeImageForProduct(publicUrl);
    article.images = [publicUrl];
    pendingArticles.set(chatId, article);

    await bot.deleteMessage(chatId, statusMsg.message_id);
    bot.sendMessage(chatId, formatArticlePreview(article, publicUrl), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Ja, Artikel anlegen', callback_data: 'create_article' },
          { text: '❌ Abbrechen', callback_data: 'cancel_article' }
        ]]
      }
    });
  } catch (e) {
    bot.editMessageText(`❌ Fehler: ${e.message}`, {
      chat_id: chatId, message_id: statusMsg.message_id
    });
  }
});

// ─── Document handler (for full-resolution photos sent as file) ───────────────

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const doc = msg.document;

  if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
    return bot.sendMessage(chatId, '⚠️ Nur Bilddateien werden unterstützt.');
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return bot.sendMessage(chatId, '⚠️ Cloudinary ist nicht konfiguriert.');
  }

  const statusMsg = await bot.sendMessage(chatId, '⏳ Bild wird hochgeladen und analysiert...');

  try {
    const fileUrl = await getTelegramFileUrl(doc.file_id);
    const publicUrl = await uploadToCloudinary(fileUrl);

    if (!openai) {
      return bot.editMessageText(
        `✅ *Bild hochgeladen!*\n\n🔗 URL:\n\`${publicUrl}\`\n\n` +
        `Artikel zuweisen:\n/addimage <artikel-id> ${publicUrl}\n\n` +
        `⚠️ Für KI-Analyse bitte \`OPENAI_API_KEY\` oder \`GITHUB_TOKEN\` in der \`.env\` setzen.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );
    }

    await bot.editMessageText('⏳ KI analysiert das Produktbild...', {
      chat_id: chatId, message_id: statusMsg.message_id
    });

    const article = await analyzeImageForProduct(publicUrl);
    article.images = [publicUrl];
    pendingArticles.set(chatId, article);

    await bot.deleteMessage(chatId, statusMsg.message_id);
    bot.sendMessage(chatId, formatArticlePreview(article, publicUrl), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Ja, Artikel anlegen', callback_data: 'create_article' },
          { text: '❌ Abbrechen', callback_data: 'cancel_article' }
        ]]
      }
    });
  } catch (e) {
    bot.editMessageText(`❌ Fehler: ${e.message}`, {
      chat_id: chatId, message_id: statusMsg.message_id
    });
  }
});

// ─── Inline-Keyboard Callback (Artikel anlegen / abbrechen) ──────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;

  await bot.answerCallbackQuery(query.id);

  if (query.data === 'cancel_article') {
    pendingArticles.delete(chatId);
    return bot.editMessageText('❌ Abgebrochen. Kein Artikel angelegt.', {
      chat_id: chatId, message_id: msgId
    });
  }

  if (query.data === 'create_article') {
    const article = pendingArticles.get(chatId);
    if (!article) {
      return bot.editMessageText('⚠️ Keine Artikeldaten gefunden. Bitte erneut ein Foto senden.', {
        chat_id: chatId, message_id: msgId
      });
    }

    pendingArticles.delete(chatId);
    await bot.editMessageText('⏳ Artikel wird angelegt...', {
      chat_id: chatId, message_id: msgId
    });

    try {
      const result = await api.createItem(article);
      const newId = result.articleId || result.id || '?';
      bot.editMessageText(
        `✅ *Artikel erfolgreich angelegt!*\n\n` +
        `🆔 Artikel-ID: *${newId}*\n` +
        `📄 Details: /item ${newId}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
      );
    } catch (e) {
      bot.editMessageText(`❌ Fehler beim Anlegen: ${e.message}`, {
        chat_id: chatId, message_id: msgId
      });
    }
  }
});

// ─── Error handling ───────────────────────────────────────────────────────────

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.code, error.message);
});

// ─── Start ────────────────────────────────────────────────────────────────────

console.log('🤖 Easy-Template Telegram Bot gestartet...');
