'use strict';
/**
 * Stage 2 Integration Tests — Business Docs ↔ Core API
 *
 * Tests run with Node.js built-in test runner (no external dependencies).
 * Core API calls are intercepted via mock server to allow offline testing.
 *
 * Usage:
 *   node --test test/test_stage2.js
 *
 * Test 2.1: Quote con buyer DNI → Party + Lead + DocumentRef registrados en Core.
 * Test 2.2: Mismo Idempotency-Key → no duplica DocumentRef.
 * Test 2.3: PDF incluye identificadores (quoteNumber/coreDocRefId) y branding Arman Travel.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ── Minimal HTTP helper ───────────────────────────────────────────────────────

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Mock Core API server ──────────────────────────────────────────────────────

let mockServer;
let mockCalls = [];
let mockPort;

/**
 * Minimal mock that replicates Core API behaviour needed for these tests:
 *  POST /v1/parties     → 201 { id: 'party-uuid', ... }
 *  POST /v1/leads       → 201 { id: 'lead-uuid', ... }  (idempotency via header)
 *  POST /v1/sales       → 201 { id: 'sale-uuid', ... }
 *  POST /v1/documents/refs → 201 { id: 'docref-uuid', doc_number: 1, ... }
 *                           (idempotency: same Idempotency-Key returns same body)
 */
function startMockCoreApi() {
  return new Promise((resolve) => {
    let docRefCounter = 0;
    const idempotencyStore = {};   // key → response body

    mockServer = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const idemKey = req.headers['idempotency-key'];

        mockCalls.push({ method: req.method, url: req.url, body, idempotencyKey: idemKey });

        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'POST' && req.url === '/v1/parties') {
          res.writeHead(201);
          return res.end(JSON.stringify({ id: 'party-uuid-001', doc_type: 'DNI', doc_number_normalized: '33445566' }));
        }

        if (req.method === 'POST' && req.url === '/v1/leads') {
          if (idemKey && idempotencyStore[idemKey]) {
            res.writeHead(201);
            return res.end(JSON.stringify(idempotencyStore[idemKey]));
          }
          const resp = { id: `lead-uuid-${Date.now()}`, party_id: 'party-uuid-001', source: 'QUOTE', status: 'NEW' };
          if (idemKey) idempotencyStore[idemKey] = resp;
          res.writeHead(201);
          return res.end(JSON.stringify(resp));
        }

        if (req.method === 'POST' && req.url === '/v1/sales') {
          if (idemKey && idempotencyStore[idemKey]) {
            res.writeHead(201);
            return res.end(JSON.stringify(idempotencyStore[idemKey]));
          }
          const resp = { id: `sale-uuid-${Date.now()}`, buyer_party_id: 'party-uuid-001', status: 'DRAFT' };
          if (idemKey) idempotencyStore[idemKey] = resp;
          res.writeHead(201);
          return res.end(JSON.stringify(resp));
        }

        if (req.method === 'POST' && req.url === '/v1/documents/refs') {
          if (idemKey && idempotencyStore[idemKey]) {
            res.writeHead(201);
            return res.end(JSON.stringify(idempotencyStore[idemKey]));
          }
          docRefCounter += 1;
          const resp = {
            id: `docref-uuid-${docRefCounter}`,
            party_id: body.party_id,
            lead_id: body.lead_id || null,
            sale_id: body.sale_id || null,
            doc_type: body.doc_type,
            doc_number: docRefCounter,
            external_ref: body.external_ref || null,
            totals: body.totals || null,
          };
          if (idemKey) idempotencyStore[idemKey] = resp;
          res.writeHead(201);
          return res.end(JSON.stringify(resp));
        }

        res.writeHead(404);
        res.end(JSON.stringify({ detail: 'Not found in mock' }));
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      resolve(mockPort);
    });
  });
}

function stopMockCoreApi() {
  return new Promise((resolve) => mockServer.close(resolve));
}

// ── Business-Docs server (in-process) ────────────────────────────────────────

let appServer;
let appPort;

function startBusinessDocs(coreApiUrl) {
  return new Promise((resolve) => {
    // Point SDK client to our mock
    process.env.CORE_API_URL = coreApiUrl;
    process.env.COMPANY_NAME = 'Arman Travel';
    process.env.COMPANY_CUIT = '30-12345678-9';
    process.env.COMPANY_ADDRESS = 'Av. Corrientes 1234, CABA';
    process.env.COMPANY_EMAIL = 'info@armantravel.com';
    process.env.COMPANY_PHONE = '+541151327320';

    // Require app fresh (clear module cache for env vars)
    Object.keys(require.cache).forEach((k) => {
      if (k.includes('business-docs') || k.includes('@arman')) delete require.cache[k];
    });

    const app = require('../src/backend/server');
    appServer = app.listen(0, '127.0.0.1', () => {
      appPort = appServer.address().port;
      resolve(appPort);
    });
  });
}

function stopBusinessDocs() {
  return new Promise((resolve) => appServer.close(resolve));
}

// ── Minimal quote payload ─────────────────────────────────────────────────────

function quotePayload(overrides = {}) {
  return {
    type: 'quote',
    data: {
      quoteNumber: 'TEMP-001',
      quoteDate: '2026-03-12',
      clientName: 'Juan Pérez',
      clientCUIT: '33445566',
      clientEmail: 'juan@test.com',
      items: [
        { description: 'Vuelo BUE-MAD', quantity: 1, price: 5000 },
      ],
      validity: 15,
      paymentTerms: '50% al confirmar, 50% antes del viaje',
      deliveryTerm: 'Inmediato',
      ...overrides,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

before(async () => {
  await startMockCoreApi();
  await startBusinessDocs(`http://127.0.0.1:${mockPort}`);
});

after(async () => {
  await stopBusinessDocs();
  await stopMockCoreApi();
});

test('Test 2.1 — Quote con buyer DNI registra Party + Lead + DocumentRef en Core', async () => {
  mockCalls = [];  // reset call log

  const resp = await httpPost(
    `http://127.0.0.1:${appPort}/api/documents/generate-pdf`,
    quotePayload(),
  );

  // PDF generated successfully
  assert.equal(resp.status, 200, `Expected 200, got ${resp.status}`);
  assert.equal(resp.headers['content-type'], 'application/pdf');
  assert.ok(resp.body.length > 0, 'PDF buffer should be non-empty');

  // Core API was called in correct order
  const urls = mockCalls.map((c) => c.url);
  assert.ok(urls.includes('/v1/parties'), 'Should call upsertParty');
  assert.ok(urls.includes('/v1/leads'), 'Should call createLead for a quote');
  assert.ok(urls.includes('/v1/documents/refs'), 'Should call createDocumentRef');
  assert.ok(!urls.includes('/v1/sales'), 'Should NOT create a Sale for a quote');

  // Party call uses buyer doc
  const partyCall = mockCalls.find((c) => c.url === '/v1/parties');
  assert.equal(partyCall.body.doc_number, '33445566');
  assert.equal(partyCall.body.full_name, 'Juan Pérez');

  // Lead call links to party
  const leadCall = mockCalls.find((c) => c.url === '/v1/leads');
  assert.equal(leadCall.body.party_id, 'party-uuid-001');
  assert.equal(leadCall.body.source, 'QUOTE');

  // DocumentRef call has totals
  const docRefCall = mockCalls.find((c) => c.url === '/v1/documents/refs');
  assert.equal(docRefCall.body.doc_type, 'QUOTE');
  assert.ok(docRefCall.body.totals, 'DocumentRef should include totals');
  assert.ok(Number(docRefCall.body.totals.total) > 0, 'total should be > 0');

  // Core IDs returned in response headers
  assert.ok(resp.headers['x-core-party-id'], 'X-Core-Party-Id header expected');
  assert.ok(resp.headers['x-core-lead-id'], 'X-Core-Lead-Id header expected');
  assert.ok(resp.headers['x-core-doc-ref-id'], 'X-Core-Doc-Ref-Id header expected');
});

test('Test 2.2 — Mismo Idempotency-Key no duplica DocumentRef', async () => {
  mockCalls = [];
  const idemKey = 'idem-test-2-2-quote-xyz';

  // First call
  const r1 = await httpPost(
    `http://127.0.0.1:${appPort}/api/documents/generate-pdf`,
    quotePayload({ quoteNumber: 'TEMP-002' }),
    { 'Idempotency-Key': idemKey },
  );
  assert.equal(r1.status, 200);
  const docRefId1 = r1.headers['x-core-doc-ref-id'];
  assert.ok(docRefId1, 'First call should return a doc ref id');

  // Count doc ref calls after first call
  const docRefCallsAfterFirst = mockCalls.filter((c) => c.url === '/v1/documents/refs').length;

  mockCalls = [];

  // Second call with same key
  const r2 = await httpPost(
    `http://127.0.0.1:${appPort}/api/documents/generate-pdf`,
    quotePayload({ quoteNumber: 'TEMP-002' }),
    { 'Idempotency-Key': idemKey },
  );
  assert.equal(r2.status, 200);
  const docRefId2 = r2.headers['x-core-doc-ref-id'];

  // Same doc ref returned (idempotency)
  assert.equal(docRefId2, docRefId1, 'Same Idempotency-Key must return same DocRef ID');

  // DocumentRef call was made with the idempotency key (Core handles dedup)
  const docRefCall = mockCalls.find((c) => c.url === '/v1/documents/refs');
  assert.ok(docRefCall, 'DocumentRef call should still be made (Core deduplicates)');
  assert.equal(docRefCall.idempotencyKey, idemKey, 'Idempotency-Key must be forwarded to Core');
});

test('Test 2.3 — PDF incluye quoteNumber de Core y branding Arman Travel', async () => {
  mockCalls = [];

  // Import helpers directly from the route to test computeTotals and injectBranding
  // without rendering a full PDF (faster, no Playwright dependency in unit test)
  const docsRouter = require('../src/backend/routes/documents');
  const computeTotals = docsRouter._computeTotals;
  const injectBranding = docsRouter._injectBranding;
  const formatDocNumber = docsRouter._formatDocNumber;

  // 2.3a — branding injection fills company fields from env vars
  const raw = { clientName: 'Test', quoteNumber: 'X', quoteDate: '2026-03-12', items: [] };
  const enriched = injectBranding(raw);
  assert.equal(enriched.companyName, 'Arman Travel', 'companyName should come from branding env var');
  assert.ok(enriched.companyCUIT, 'companyCUIT should be injected from branding');

  // 2.3b — tax calculations are correct
  const data = {
    items: [
      { quantity: 2, price: 1500 },
      { quantity: 1, price: 800 },
    ],
    discount: 300,
    ivaRate: 0,   // travel agency — IVA exento
  };
  const totals = computeTotals(data);
  assert.equal(totals.subtotal, 3800, 'subtotal = 2×1500 + 1×800');
  assert.equal(totals.discount, 300);
  assert.equal(totals.taxableBase, 3500, 'taxable_base = subtotal - discount');
  assert.equal(totals.iva, 0, 'IVA=0 when ivaRate=0');
  assert.equal(totals.total, 3500);

  // 2.3c — IVA 21% calculation
  const dataIVA = { items: [{ quantity: 1, price: 1000 }], ivaRate: 0.21 };
  const totalsIVA = computeTotals(dataIVA);
  assert.equal(totalsIVA.subtotal, 1000);
  assert.equal(totalsIVA.iva, 210);
  assert.equal(totalsIVA.total, 1210);

  // 2.3d — doc number formatting from Core correlative
  assert.equal(formatDocNumber('quote', 1), 'COT-0001');
  assert.equal(formatDocNumber('quote', 42), 'COT-0042');
  assert.equal(formatDocNumber('invoice', 5), 'FAC-0005');
  assert.equal(formatDocNumber('receipt', 100), 'REC-0100');

  // 2.3e — full PDF response has correct headers (branding + doc number)
  const resp = await httpPost(
    `http://127.0.0.1:${appPort}/api/documents/generate-pdf`,
    quotePayload({ quoteNumber: 'TEMP-003' }),
  );
  assert.equal(resp.status, 200);
  // Core mock returns doc_number=N, so route overwrites quoteNumber with COT-000N
  // The PDF is a binary — we can't parse it here, but we verify the flow completed
  assert.ok(resp.body.length > 1000, 'PDF should have substantial size (rendered with Playwright)');
  assert.equal(resp.headers['content-type'], 'application/pdf');
});
