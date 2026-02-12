const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize clients file if it doesn't exist
if (!fs.existsSync(CLIENTS_FILE)) {
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2));
}

function readClients() {
  try {
    const data = fs.readFileSync(CLIENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading clients:', error);
    return [];
  }
}

function writeClients(clients) {
  try {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing clients:', error);
    return false;
  }
}

function getAllClients() {
  return readClients();
}

function getClientById(id) {
  const clients = readClients();
  return clients.find(client => client.id === id);
}

function addClient(clientData) {
  const clients = readClients();
  
  // Generate new ID
  const maxId = clients.length > 0 ? Math.max(...clients.map(c => parseInt(c.id) || 0)) : 0;
  const newId = String(maxId + 1);
  
  const newClient = {
    id: newId,
    ...clientData,
    createdAt: new Date().toISOString()
  };
  
  clients.push(newClient);
  writeClients(clients);
  return newClient;
}

function updateClient(id, clientData) {
  const clients = readClients();
  const index = clients.findIndex(client => client.id === id);
  
  if (index === -1) {
    return null;
  }
  
  const updatedClient = {
    ...clients[index],
    ...clientData,
    id: clients[index].id, // Don't allow ID change
    createdAt: clients[index].createdAt // Don't allow creation date change
  };
  
  clients[index] = updatedClient;
  writeClients(clients);
  return updatedClient;
}

function deleteClient(id) {
  const clients = readClients();
  const filtered = clients.filter(client => client.id !== id);
  
  if (filtered.length === clients.length) {
    return false; // Client not found
  }
  
  writeClients(filtered);
  return true;
}

function searchClients(query) {
  const clients = readClients();
  const q = query.toLowerCase();
  
  return clients.filter(client => 
    client.clientName.toLowerCase().includes(q) ||
    client.clientCUIT.includes(q) ||
    client.clientEmail?.toLowerCase().includes(q)
  );
}

module.exports = {
  getAllClients,
  getClientById,
  addClient,
  updateClient,
  deleteClient,
  searchClients
};
