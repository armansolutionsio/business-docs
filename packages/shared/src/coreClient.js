'use strict';

const http = require('http');
const https = require('https');

/**
 * Minimal HTTP client for Core API.
 * Base URL is read from CORE_API_URL env var (default: http://localhost:8002).
 */
class CoreApiClient {
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || process.env.CORE_API_URL || 'http://localhost:8002').replace(/\/$/, '');
  }

  _request(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const lib = url.protocol === 'https:' ? https : http;
      const bodyStr = body != null ? JSON.stringify(body) : null;

      const headers = {
        'Content-Type': 'application/json',
        ...extraHeaders,
      };
      if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode, body: raw });
            }
          });
        },
      );
      req.setTimeout(5000, () => {
        req.destroy(new Error('Core API request timeout'));
      });
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Upsert a party (client/customer) by document number.
   * Returns the party object with its id.
   */
  async upsertParty({ docType, docNumber, country = 'ARG', fullName, email, phone }) {
    const res = await this._request('POST', '/v1/parties', {
      doc_type: docType,
      doc_number: docNumber,
      country,
      full_name: fullName || null,
      email: email || null,
      phone: phone || null,
    });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Party upsert failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  /**
   * Create a lead linked to a party.
   * Pass idempotencyKey to prevent duplicates on retries.
   */
  async createLead({ partyId, source = 'QUOTE', status = 'NEW', notes }, idempotencyKey) {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await this._request(
      'POST',
      '/v1/leads',
      { party_id: partyId, source, status, notes: notes || null },
      headers,
    );
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Lead creation failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  /**
   * Create a sale linked to a party (buyer).
   * Pass idempotencyKey to prevent duplicates on retries.
   */
  async createSale({ partyId, status = 'DRAFT', currency = 'ARS', notes }, idempotencyKey) {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await this._request(
      'POST',
      '/v1/sales',
      {
        buyer_party_id: partyId,
        status,
        currency,
        notes: notes || null,
      },
      headers,
    );
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Sale creation failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  /**
   * Create a document reference (quote, invoice, receipt) in Core.
   * Returns the DocumentRef including its correlative doc_number.
   *
   * @param {object} opts
   * @param {string}  opts.partyId     - UUID of the party (buyer)
   * @param {string}  [opts.saleId]    - UUID of the sale (for INVOICE/RECEIPT)
   * @param {string}  [opts.leadId]    - UUID of the lead (for QUOTE)
   * @param {string}  opts.docType     - QUOTE | INVOICE | RECEIPT
   * @param {string}  [opts.externalRef] - human-readable ref (e.g. COT-0001)
   * @param {string}  [opts.url]       - URL to the stored PDF
   * @param {object}  [opts.totals]    - fiscal totals snapshot
   * @param {string}  idempotencyKey   - prevents duplicate document refs
   */
  async createDocumentRef({ partyId, saleId, leadId, docType, externalRef, url, totals }, idempotencyKey) {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await this._request(
      'POST',
      '/v1/documents/refs',
      {
        party_id: partyId || null,
        sale_id: saleId || null,
        lead_id: leadId || null,
        doc_type: docType,
        external_ref: externalRef || null,
        url: url || null,
        totals: totals || null,
      },
      headers,
    );
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`DocumentRef creation failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }
}

module.exports = CoreApiClient;
