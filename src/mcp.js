require('dotenv').config();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');

const EasyTemplateAPI = require('./api.js');

const api = new EasyTemplateAPI();

// Auto-login if credentials are set via environment variables
if (process.env.ET_CLIENT_ID && process.env.ET_CLIENT_SECRET) {
  api.login(process.env.ET_CLIENT_ID, process.env.ET_CLIENT_SECRET)
    .then(() => console.error('✅ Easy-Template: Auto-login successful'))
    .catch(e => console.error('⚠️  Easy-Template: Auto-login failed:', e.message));
}

const server = new Server(
  { name: 'easy-template-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'et_login',
      description: 'Authenticate with Easy-Template.com API using clientId and clientSecret.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId:     { type: 'string', description: 'Easy-Template Client ID' },
          clientSecret: { type: 'string', description: 'Easy-Template Client Secret' }
        },
        required: ['clientId', 'clientSecret']
      }
    },
    {
      name: 'et_list_items',
      description: 'List articles from Easy-Template.com with optional pagination and filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          articleIds: { type: 'string', description: 'Comma-separated list of article IDs to filter (e.g. "123,456,789")' },
          offset: { type: 'integer', description: 'Pagination offset (default: 0)', default: 0 },
          limit:  { type: 'integer', description: 'Number of items to return (default: 10, max: 100)', default: 10 },
          orderField: { type: 'string', description: 'Field name to order results by (default: id)' },
          orderDirection: { type: 'integer', description: 'Order direction: 0 = descending, 1 = ascending (default: 0)', enum: [0, 1], default: 0 }
        }
      }
    },
    {
      name: 'et_get_item',
      description: 'Get detailed information about a specific article by its local article ID.',
      inputSchema: {
        type: 'object',
        properties: {
          articleId: { type: 'integer', description: 'Local article ID' }
        },
        required: ['articleId']
      }
    },
    {
      name: 'et_create_item',
      description: 'Create a new article in Easy-Template.com. Returns the new articleId and assigned template_id.',
      inputSchema: {
        type: 'object',
        properties: {
          article: {
            type: 'object',
            description: 'Product data. Key fields: Title, ProductCode (SKU), SalePrice, OriginalPrice, Quantity, images (array of URLs), shortDescription, longDescription, EAN, Country, Currency, CategoryID, ebaySiteId, ConditionID, template_id, Variations.'
          }
        },
        required: ['article']
      }
    },
    {
      name: 'et_update_item',
      description: 'Update an existing article. Only provided fields will be changed (partial update).',
      inputSchema: {
        type: 'object',
        properties: {
          articleId: { type: 'integer', description: 'ID of the article to update' },
          article:   { type: 'object',  description: 'Partial product data with the fields to update' }
        },
        required: ['articleId', 'article']
      }
    },
    {
      name: 'et_send_to_ebay',
      description: 'Send an article to eBay. Creates a new listing (AddItem) if no eBay ItemID exists, or revises an existing one (ReviseItem). Use testMode=true to verify without creating a real listing.',
      inputSchema: {
        type: 'object',
        properties: {
          articleId:     { type: 'integer', description: 'Local article ID to send' },
          testMode:      { type: 'boolean', description: 'If true, uses VerifyAddItem (no real listing created)', default: false },
          template_id:   { type: 'integer', description: 'Optional explicit template ID to use for rendering' },
          article:       { type: 'boolean', description: 'Send full article data (default: true)', default: true },
          picture:       { type: 'boolean', description: 'Send images (default: true)', default: true },
          price:         { type: 'boolean', description: 'Send price data (default: true)', default: true },
          amount:        { type: 'boolean', description: 'Send quantity (default: true)', default: true },
          title:         { type: 'boolean', description: 'Send title (default: true)', default: true },
          sku:           { type: 'boolean', description: 'Send SKU/ProductCode (default: true)', default: true },
          html:          { type: 'boolean', description: 'Render and send template HTML (default: true)', default: true },
          Specifics:     { type: 'boolean', description: 'Send ItemSpecifics (default: true)', default: true },
          ebaySettings:  { type: 'boolean', description: 'Merge eBay profile settings (default: true)', default: true },
          uvp:           { type: 'boolean', description: 'Send OriginalRetailPrice (UVP)' },
          StoreCategoryID: { type: 'boolean', description: 'Send StoreCategoryID' },
          CategoryID:    { type: 'boolean', description: 'Send CategoryID' },
          ean:           { type: 'boolean', description: 'Send EAN' }
        },
        required: ['articleId']
      }
    },
    {
      name: 'et_get_ebay_item',
      description: 'Get an existing eBay listing by its eBay ItemID.',
      inputSchema: {
        type: 'object',
        properties: {
          itemID: { type: 'string', description: 'eBay Item ID (e.g. "165775527034")' }
        },
        required: ['itemID']
      }
    },
    {
      name: 'et_get_seller_events',
      description: 'Get all eBay seller events (sold, revised, relisted items) since a given Unix timestamp.',
      inputSchema: {
        type: 'object',
        properties: {
          startTime: { type: 'integer', description: 'Unix timestamp to fetch events from' }
        },
        required: ['startTime']
      }
    },
    {
      name: 'et_send_template_to_ebay',
      description: 'Send rendered template HTML to eBay for existing listings by their eBay ItemIDs (max 10 at once).',
      inputSchema: {
        type: 'object',
        properties: {
          itemIDs: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Array of eBay ItemIDs (max 10)',
            example: [165775527034, 166448190120]
          }
        },
        required: ['itemIDs']
      }
    },
    {
      name: 'et_get_template',
      description: 'Get the rendered HTML template for an eBay item (optionally specifying a template).',
      inputSchema: {
        type: 'object',
        properties: {
          ebayItemId: { type: 'string',  description: 'eBay Item ID' },
          templateId: { type: 'integer', description: 'Optional template ID (uses default if omitted)' }
        },
        required: ['ebayItemId']
      }
    }
  ]
}));

// ─── Tool execution ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case 'et_login': {
        await api.login(args.clientId, args.clientSecret);
        return { content: [{ type: 'text', text: '✅ Successfully authenticated with Easy-Template.com' }] };
      }

      case 'et_list_items': {
        const items = await api.getItems(
          args.offset ?? 0,
          args.limit ?? 10,
          args.orderField ?? null,
          args.orderDirection ?? 0,
          args.articleIds ?? null
        );
        const count = Array.isArray(items) ? items.length : '?';
        return {
          content: [{
            type: 'text',
            text: `Found ${count} item(s):\n\n${JSON.stringify(items, null, 2)}`
          }]
        };
      }

      case 'et_get_item': {
        const item = await api.getItem(args.articleId);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'et_create_item': {
        const result = await api.createItem(args.article);
        return {
          content: [{
            type: 'text',
            text: `✅ Article created.\narticleId: ${result.articleId}\ntemplate_id: ${result.template_id ?? 'auto-assigned'}`
          }]
        };
      }

      case 'et_update_item': {
        const result = await api.updateItem(args.articleId, args.article);
        return {
          content: [{
            type: 'text',
            text: `✅ Article updated.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      }

      case 'et_send_to_ebay': {
        const { articleId, ...options } = args;
        const result = await api.sendToEbay(articleId, options);
        const status = result.status === 'ok' ? '✅' : '⚠️';
        return {
          content: [{
            type: 'text',
            text: `${status} eBay send result:\nStatus: ${result.status}\neBay ItemID: ${result.ItemID ?? 'N/A'}\nebayStatus: ${result.ebayStatus ?? 'N/A'}\n\nFull response:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      }

      case 'et_get_ebay_item': {
        const item = await api.getEbayItem(args.itemID);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'et_get_seller_events': {
        const events = await api.getEbaySellerEvents(args.startTime);
        return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
      }

      case 'et_send_template_to_ebay': {
        const result = await api.sendTemplateToEbay(args.itemIDs);
        const sent = result.sendItems ?? '?';
        return {
          content: [{
            type: 'text',
            text: `✅ Template sent to ${sent} item(s):\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      }

      case 'et_get_template': {
        const result = await api.getTemplate(args.templateId, args.ebayItemId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

  } catch (e) {
    if (e instanceof McpError) throw e;
    return {
      content: [{ type: 'text', text: `❌ Error: ${e.message}` }],
      isError: true
    };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Easy-Template MCP Server running on stdio');
}

main().catch(console.error);
