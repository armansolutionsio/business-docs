const express = require('express');
const router = express.Router();
const clientsManager = require('../utils/clientsManager');

// Get all clients
router.get('/', (req, res) => {
  try {
    const clients = clientsManager.getAllClients();
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search clients
router.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.json([]);
    }
    const results = clientsManager.searchClients(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get client by ID
router.get('/:id', (req, res) => {
  try {
    const client = clientsManager.getClientById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new client
router.post('/', (req, res) => {
  try {
    const { clientName, clientCUIT, clientIVACondition, clientAddress, clientEmail, clientPhone } = req.body;
    
    if (!clientName || !clientCUIT) {
      return res.status(400).json({ error: 'clientName and clientCUIT are required' });
    }
    
    const newClient = clientsManager.addClient({
      clientName,
      clientCUIT,
      clientIVACondition: clientIVACondition || '',
      clientAddress: clientAddress || '',
      clientEmail: clientEmail || '',
      clientPhone: clientPhone || ''
    });
    
    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update client
router.put('/:id', (req, res) => {
  try {
    const updated = clientsManager.updateClient(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete client
router.delete('/:id', (req, res) => {
  try {
    const deleted = clientsManager.deleteClient(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
