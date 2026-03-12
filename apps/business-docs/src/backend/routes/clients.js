const express = require('express');
const router = express.Router();

const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:8003';

function detectDocType(value) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 11 ? 'CUIT' : 'DNI';
}

function mapParty(p) {
  return {
    id: p.id,
    clientName: p.full_name || '',
    clientCUIT: p.doc_number_normalized || '',
    clientEmail: p.email || '',
    clientPhone: p.phone || '',
    clientIVACondition: '',
    clientAddress: '',
    createdAt: p.created_at || '',
  };
}

async function coreGet(path) {
  const r = await fetch(`${CORE_API_URL}${path}`);
  if (!r.ok) throw new Error(`Core API ${r.status}`);
  return r.json();
}

async function corePost(path, body) {
  const r = await fetch(`${CORE_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `Core API ${r.status}`);
  }
  return r.json();
}

// List all clients
router.get('/', async (req, res) => {
  try {
    const parties = await coreGet('/v1/parties?limit=500');
    res.json(parties.map(mapParty));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search clients
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json([]);
    const parties = await coreGet('/v1/parties?limit=500');
    const results = parties
      .filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.doc_number_normalized || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
      .map(mapParty);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get client by ID
router.get('/:id', async (req, res) => {
  try {
    const party = await coreGet(`/v1/parties/${req.params.id}`);
    res.json(mapParty(party));
  } catch (e) {
    res.status(404).json({ error: 'Client not found' });
  }
});

// Create client → upsert party in Core API
router.post('/', async (req, res) => {
  try {
    const { clientName, clientCUIT, clientEmail, clientPhone } = req.body;
    if (!clientCUIT) return res.status(400).json({ error: 'clientCUIT is required' });
    const party = await corePost('/v1/parties', {
      doc_type: detectDocType(clientCUIT),
      doc_number: clientCUIT,
      country: 'AR',
      full_name: clientName || '',
      email: clientEmail || '',
      phone: clientPhone || '',
    });
    res.status(201).json(mapParty(party));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update client → re-upsert party (Core API merges fields)
router.put('/:id', async (req, res) => {
  try {
    const { clientName, clientCUIT, clientEmail, clientPhone } = req.body;
    if (!clientCUIT) return res.status(400).json({ error: 'clientCUIT is required' });
    const party = await corePost('/v1/parties', {
      doc_type: detectDocType(clientCUIT),
      doc_number: clientCUIT,
      country: 'AR',
      full_name: clientName || '',
      email: clientEmail || '',
      phone: clientPhone || '',
    });
    res.json(mapParty(party));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete — parties are permanent in the shared DB
router.delete('/:id', (req, res) => {
  res.status(405).json({ error: 'Deletion not supported' });
});

module.exports = router;
