const axios = require('axios');

const BASE_URL = 'https://www.easy-template.com/api/v3';

class EasyTemplateAPI {
  constructor() {
    this.accessToken = null;
    this._refreshToken = null;
    this.tokenExpires = null;
    this.refreshTokenExpires = null;
  }

  /**
   * Login with client credentials
   * @param {string} clientId
   * @param {string} clientSecret
   */
  async login(clientId, clientSecret) {
    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await axios.post(`${BASE_URL}/token`, {}, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      });

      this.accessToken = response.data.accessToken;
      this._refreshToken = response.data.refreshToken;
      this.tokenExpires = response.data.tokenExpires * 1000;
      this.refreshTokenExpires = response.data.refreshTokenExpires * 1000;

      return {
        success: true,
        message: 'Successfully authenticated'
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Refresh the access token
   */
  async doRefreshToken() {
    try {
      const response = await axios.post(`${BASE_URL}/refreshToken`, {}, {
        headers: {
          'Authorization': `Bearer ${this._refreshToken}`,
          'Content-Type': 'application/json'
        }
      });

      this.accessToken = response.data.accessToken;
      this._refreshToken = response.data.refreshToken;
      this.tokenExpires = response.data.tokenExpires * 1000;
      this.refreshTokenExpires = response.data.refreshTokenExpires * 1000;

      return true;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.response?.data?.message || error.message}`);
    }
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

      const response = await axios.get(`${BASE_URL}/Items`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get items: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get a single item by article ID
   * @param {string} articleId
   */
  async getItem(articleId) {
    try {
      await this.ensureToken();

      const response = await axios.get(`${BASE_URL}/Item`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          articleId
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get item: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a new item
   * @param {object} article - Product data
   */
  async createItem(article) {
    try {
      await this.ensureToken();
      const response = await axios.post(`${BASE_URL}/Item`, { article }, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create item: ${error.response?.data?.message || error.message}`);
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
      const response = await axios.put(`${BASE_URL}/Item`, { articleId, article }, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update item: ${error.response?.data?.message || error.message}`);
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

      const response = await axios.post(`${BASE_URL}/Item/sendToEbay`, body, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to send to eBay: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get eBay item by ItemID
   * @param {string} itemID
   */
  async getEbayItem(itemID) {
    try {
      await this.ensureToken();

      const response = await axios.get(`${BASE_URL}/eBayItem/${itemID}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get eBay item: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get all seller events from a Unix timestamp
   * @param {number} startTime - Unix timestamp
   */
  async getEbaySellerEvents(startTime) {
    try {
      await this.ensureToken();
      const response = await axios.get(`${BASE_URL}/eBaySellerEvents/${startTime}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get seller events: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send template(s) to eBay by eBay ItemIDs (max 10)
   * @param {number[]} itemIDs - Array of eBay ItemIDs
   */
  async sendTemplateToEbay(itemIDs) {
    try {
      await this.ensureToken();
      const response = await axios.post(`${BASE_URL}/template/sendToEbay/ids`, { ItemIDs: itemIDs }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to send template to eBay: ${error.response?.data?.message || error.message}`);
    }
  }


  async getTemplate(templateId, ebayItemId) {
    try {
      await this.ensureToken();

      const response = await axios.get(`${BASE_URL}/template`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          templateId,
          ebayItemId
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get template: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = EasyTemplateAPI;
