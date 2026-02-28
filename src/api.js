const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.easy-template.com/api/v3';
const TOKEN_CACHE_FILE = path.join(__dirname, '..', '.token-cache.json');

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; // 2 seconds

class EasyTemplateAPI {
  constructor() {
    this.accessToken = null;
    this._refreshToken = null;
    this.tokenExpires = null;
    this.refreshTokenExpires = null;
    this._loadTokenCache();
  }

  _loadTokenCache() {
    try {
      if (fs.existsSync(TOKEN_CACHE_FILE)) {
        const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
        const now = Date.now();
        // Only use cache if refresh token is still valid
        if (cache.refreshTokenExpires && cache.refreshTokenExpires > now) {
          this.accessToken = cache.accessToken;
          this._refreshToken = cache.refreshToken;
          this.tokenExpires = cache.tokenExpires;
          this.refreshTokenExpires = cache.refreshTokenExpires;
        }
      }
    } catch (e) {
      // Ignore cache read errors
    }
  }

  _saveTokenCache() {
    try {
      fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
        accessToken: this.accessToken,
        refreshToken: this._refreshToken,
        tokenExpires: this.tokenExpires,
        refreshTokenExpires: this.refreshTokenExpires
      }), 'utf8');
    } catch (e) {
      // Ignore cache write errors
    }
  }

  /**
   * Login with client credentials
   * @param {string} clientId
   * @param {string} clientSecret
   */
  async login(clientId, clientSecret) {
    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await this._requestWithRetry(() =>
        axios.post(`${BASE_URL}/token`, {}, {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          }
        })
      );

      this.accessToken = response.data.accessToken;
      this._refreshToken = response.data.refreshToken;
      this.tokenExpires = (response.data.accessTokenExpires || response.data.tokenExpires) * 1000;
      this.refreshTokenExpires = response.data.refreshTokenExpires * 1000;
      this._saveTokenCache();

      return {
        success: true,
        message: 'Successfully authenticated'
      };
    } catch (error) {
      throw this._formatError('Login failed', error);
    }
  }

  /**
   * Refresh the access token
   */
  async doRefreshToken() {
    try {
      const response = await this._requestWithRetry(() =>
        axios.post(`${BASE_URL}/refreshToken`, {}, {
          headers: {
            'Authorization': `Bearer ${this._refreshToken}`,
            'Content-Type': 'application/json'
          }
        })
      );

      this.accessToken = response.data.accessToken;
      this._refreshToken = response.data.refreshToken;
      this.tokenExpires = (response.data.accessTokenExpires || response.data.tokenExpires) * 1000;
      this.refreshTokenExpires = response.data.refreshTokenExpires * 1000;
      this._saveTokenCache();

      return true;
    } catch (error) {
      throw this._formatError('Token refresh failed', error);
    }
  }

  /**
   * Execute an HTTP request with automatic retry on 429 (rate limit) errors.
   * Uses exponential backoff: 2s, 4s, 8s
   */
  async _requestWithRetry(requestFn) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        const status = error.response?.status;
        if (status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = error.response?.headers?.['retry-after'];
          const backoff = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.error(`⏳ Rate limited (429). Retrying in ${backoff / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        // Improve error message when response has no body
        if (error.response && !error.response.data) {
          throw new Error(`HTTP ${status} (no response body)`);
        }
        throw error;
      }
    }
  }

  /**
   * Format error message, handling cases with no response body
   */
  _formatError(prefix, error) {
    if (error.response) {
      const msg = error.response.data?.message || error.response.data || `HTTP ${error.response.status}`;
      return new Error(`${prefix}: ${msg}`);
    }
    return new Error(`${prefix}: ${error.message}`);
  }

  /**
   * Ensure the current token is valid, refresh if needed
   */
  async ensureToken() {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please use /login <clientId> <clientSecret>');
    }

    // Check if token is expiring soon (within 1 minute)
    const now = Date.now();
    const timeUntilExpiry = this.tokenExpires - now;

    if (timeUntilExpiry < 60000) {
      await this.doRefreshToken();
    }
  }

  /**
   * Get list of items
   * @param {number} offset - Default 0
   * @param {number} limit - Default 10
   * @param {string} orderField - Optional field to order by
   * @param {string} orderDirection - 'asc' or 'desc'
   */
  async getItems(offset = 0, limit = 10, orderField = null, orderDirection = 0, articleIds = null) {
    try {
      await this.ensureToken();

      const params = { offset, limit };
      if (orderField) {
        params.orderField = orderField;
        params.orderDirection = orderDirection;
      }
      if (articleIds) params.articleIds = articleIds;

      const response = await this._requestWithRetry(() =>
        axios.get(`${BASE_URL}/Items`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          params
        })
      );

      return response.data;
    } catch (error) {
      throw this._formatError('Failed to get items', error);
    }
  }

  /**
   * Get a single item by article ID
   * @param {string} articleId
   */
  async getItem(articleId) {
    try {
      await this.ensureToken();

      const response = await this._requestWithRetry(() =>
        axios.get(`${BASE_URL}/Item`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            articleId
          }
        })
      );

      return response.data;
    } catch (error) {
      throw this._formatError('Failed to get item', error);
    }
  }

  /**
   * Create a new item
   * @param {object} article - Product data
   */
  async createItem(article) {
    try {
      await this.ensureToken();
      const response = await this._requestWithRetry(() =>
        axios.post(`${BASE_URL}/Item`, { article }, {
          headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }
        })
      );
      return response.data;
    } catch (error) {
      throw this._formatError('Failed to create item', error);
    }
  }

  /**
   * Update an existing item (partial update)
   * @param {number} articleId
   * @param {object} article - Fields to update
   */
  async updateItem(articleId, article) {
    try {
      await this.ensureToken();
      const response = await this._requestWithRetry(() =>
        axios.put(`${BASE_URL}/Item`, { articleId, article }, {
          headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }
        })
      );
      return response.data;
    } catch (error) {
      throw this._formatError('Failed to update item', error);
    }
  }

  /**
   * Send item to eBay
   * @param {string} articleId
   * @param {object} options - {testMode, article, price, amount, title, html, ...}
   */
  async sendToEbay(articleId, options = {}) {
    try {
      await this.ensureToken();

      const body = {
        articleId,
        ...options
      };

      const response = await this._requestWithRetry(() =>
        axios.post(`${BASE_URL}/Item/sendToEbay`, body, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );

      return response.data;
    } catch (error) {
      throw this._formatError('Failed to send to eBay', error);
    }
  }

  /**
   * Get eBay item by ItemID
   * @param {string} itemID
   */
  async getEbayItem(itemID) {
    try {
      await this.ensureToken();

      const response = await this._requestWithRetry(() =>
        axios.get(`${BASE_URL}/eBayItem/${itemID}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );

      return response.data;
    } catch (error) {
      throw this._formatError('Failed to get eBay item', error);
    }
  }

  /**
   * Get all seller events from a Unix timestamp
   * @param {number} startTime - Unix timestamp
   */
  async getEbaySellerEvents(startTime) {
    try {
      await this.ensureToken();
      const response = await this._requestWithRetry(() =>
        axios.get(`${BASE_URL}/eBaySellerEvents/${startTime}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );
      return response.data;
    } catch (error) {
      throw this._formatError('Failed to get seller events', error);
    }
  }

  /**
   * Send template(s) to eBay by eBay ItemIDs (max 10)
   * @param {number[]} itemIDs - Array of eBay ItemIDs
   */
  async sendTemplateToEbay(itemIDs) {
    try {
      await this.ensureToken();
      const response = await this._requestWithRetry(() =>
        axios.post(`${BASE_URL}/template/sendToEbay/ids`, { ItemIDs: itemIDs }, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );
      return response.data;
    } catch (error) {
      throw this._formatError('Failed to send template to eBay', error);
    }
  }


  async getTemplate(templateId, ebayItemId) {
    try {
      await this.ensureToken();

      const response = await this._requestWithRetry(() =>
        axios.get(`${BASE_URL}/template`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            templateId,
            ebayItemId
          }
        })
      );

      return response.data;
    } catch (error) {
      throw this._formatError('Failed to get template', error);
    }
  }
}

module.exports = EasyTemplateAPI;
