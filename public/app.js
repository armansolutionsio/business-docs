// Estado global de la aplicación
const appState = {
    currentTab: 'invoice',
    items: [],
    formData: {}
};

// Configuración de documentos
const documentConfig = {
    invoice: {
        title: 'FACTURA',
        fields: [
            { name: 'number', label: 'Número de Factura', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'clientName', label: 'Nombre del Cliente', type: 'text', required: true },
            { name: 'clientDNI', label: 'DNI/CUIT del Cliente', type: 'text' },
            { name: 'clientPhone', label: 'Teléfono del Cliente', type: 'tel' }
        ],
        hasItems: true
    },
    receipt: {
        title: 'RECIBO',
        fields: [
            { name: 'number', label: 'Número de Recibo', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'paidBy', label: 'Recibimos de', type: 'text', required: true },
            { name: 'concept', label: 'Concepto de Pago', type: 'text', required: true },
            { name: 'amount', label: 'Monto', type: 'number', required: true }
        ],
        hasItems: false
    },
    'delivery-note': {
        title: 'REMITO',
        fields: [
            { name: 'number', label: 'Número de Remito', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'recipientName', label: 'Destinatario', type: 'text', required: true },
            { name: 'observations', label: 'Observaciones', type: 'textarea' }
        ],
        hasItems: true
    },
    quote: {
        title: 'COTIZACIÓN',
        fields: [
            { name: 'number', label: 'Número de Cotización', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'requesterName', label: 'Solicitante', type: 'text', required: true },
            { name: 'validity', label: 'Vigencia de la Cotización', type: 'text' }
        ],
        hasItems: true
    },
    budget: {
        title: 'PRESUPUESTO',
        fields: [
            { name: 'number', label: 'Número de Presupuesto', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'clientName', label: 'Cliente', type: 'text', required: true },
            { name: 'description', label: 'Descripción del Proyecto', type: 'textarea' }
        ],
        hasItems: true
    },
    proposal: {
        title: 'PROPUESTA',
        fields: [
            { name: 'number', label: 'Número de Propuesta', type: 'text', required: true },
            { name: 'date', label: 'Fecha', type: 'date', required: true },
            { name: 'clientName', label: 'Para', type: 'text', required: true },
            { name: 'summary', label: 'Resumen Ejecutivo', type: 'textarea' },
            { name: 'solution', label: 'Solución Propuesta', type: 'textarea' },
            { name: 'investment', label: 'Inversión', type: 'number' }
        ],
        hasItems: false
    }
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    setupTabButtons();
    renderTab('invoice');
    setDefaultDate();
});

// Configurar botones de pestañas
function setupTabButtons() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appState.currentTab = tabName;
            appState.items = [];
            renderTab(tabName);
        });
    });
}

// Renderizar contenido de pestaña
function renderTab(tabName) {
    const config = documentConfig[tabName];
    const contentDiv = document.getElementById('content');
    let html = '<form id="documentForm">';

    // Mensaje
    html += '<div class="message" id="message"></div>';
    html += '<div class="loading" id="loading"><div class="spinner"></div><p>Generando documento...</p></div>';

    // Campos del formulario
    html += '<div class="form-row">';
    config.fields.forEach(field => {
        if (field.type === 'textarea') {
            html += `
                <div class="form-group form-row full">
                    <label>${field.label}${field.required ? '*' : ''}</label>
                    <textarea name="${field.name}" ${field.required ? 'required' : ''}></textarea>
                </div>
            `;
        } else {
            html += `
                <div class="form-group">
                    <label>${field.label}${field.required ? '*' : ''}</label>
                    <input type="${field.type}" name="${field.name}" ${field.required ? 'required' : ''}>
                </div>
            `;
        }
    });
    html += '</div>';

    // Sección de items
    if (config.hasItems) {
        html += `
            <div class="items-section">
                <h3>Items / Detalles</h3>
                <div class="item-row">
                    <input type="text" id="itemDesc" placeholder="Descripción" required>
                    <input type="number" id="itemQuantity" placeholder="Cantidad" step="0.01" min="0">
                    <input type="number" id="itemPrice" placeholder="Precio" step="0.01" min="0" required>
                    <button type="button" class="add-item-btn" onclick="addItem()">+ Agregar</button>
                </div>
                <div id="itemsList"></div>
            </div>
        `;
    }

    // Sección de total
    html += `
        <div class="total-section">
            <div>
                <span>Total del Documento:</span>
            </div>
            <div class="total-value">$<span id="totalAmount">0.00</span></div>
        </div>
    `;

    // Botones de acción
    html += `
        <div class="button-group">
            <button type="button" class="btn btn-primary" onclick="downloadDocument('pdf')">
                📄 Descargar PDF
            </button>
            <button type="button" class="btn btn-primary" onclick="downloadDocument('word')">
                📋 Descargar Word
            </button>
        </div>
    `;

    html += '</form>';
    contentDiv.innerHTML = html;

    // Setup de eventos si tiene items
    if (config.hasItems) {
        setupItemsListeners();
    }

    // Setup de cálculo de total
    setupTotalCalculation();
}

// Configurar listeners para items
function setupItemsListeners() {
    const itemDesc = document.getElementById('itemDesc');
    const itemQuantity = document.getElementById('itemQuantity');
    const itemPrice = document.getElementById('itemPrice');

    if (itemDesc) {
        itemDesc.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
            }
        });
    }

    if (itemPrice) {
        itemPrice.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
            }
        });
    }
}

// Agregar item
function addItem() {
    const desc = document.getElementById('itemDesc');
    const quantity = document.getElementById('itemQuantity');
    const price = document.getElementById('itemPrice');

    if (!desc.value || !price.value) {
        showMessage('Por favor completa descripción y precio', 'error');
        return;
    }

    const item = {
        id: Date.now(),
        description: desc.value,
        quantity: parseFloat(quantity.value) || 1,
        price: parseFloat(price.value)
    };

    appState.items.push(item);
    renderItems();
    desc.value = '';
    quantity.value = '';
    price.value = '';
    updateTotal();
    desc.focus();
}

// Renderizar lista de items
function renderItems() {
    const itemsList = document.getElementById('itemsList');
    if (!itemsList) return;

    let html = '';
    appState.items.forEach(item => {
        const subtotal = item.quantity * item.price;
        html += `
            <div class="item-row">
                <input type="text" value="${item.description}" readonly>
                <input type="number" value="${item.quantity}" readonly>
                <input type="number" value="${item.price}" readonly>
                <button type="button" class="remove-item" onclick="removeItem(${item.id})">Eliminar</button>
            </div>
        `;
    });

    itemsList.innerHTML = html;
}

// Eliminar item
function removeItem(id) {
    appState.items = appState.items.filter(item => item.id !== id);
    renderItems();
    updateTotal();
}

// Actualizar total
function updateTotal() {
    let total = 0;

    if (appState.items.length > 0) {
        total = appState.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    } else {
        // Si es recibo, usar el campo amount
        const amountInput = document.querySelector('input[name="amount"]');
        if (amountInput) {
            total = parseFloat(amountInput.value) || 0;
        }
        // Si es propuesta, usar investment
        const investmentInput = document.querySelector('input[name="investment"]');
        if (investmentInput) {
            total = parseFloat(investmentInput.value) || 0;
        }
    }

    document.getElementById('totalAmount').textContent = total.toFixed(2);
    appState.formData.total = total;
}

// Setup de cálculo de total
function setupTotalCalculation() {
    const inputs = document.querySelectorAll('input[type="number"], input[type="text"][name="amount"], input[type="number"][name="investment"]');
    inputs.forEach(input => {
        input.addEventListener('change', updateTotal);
        input.addEventListener('input', updateTotal);
    });
    updateTotal();
}

// Establecer fecha actual por defecto
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
}

// Mostrar mensaje
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    setTimeout(() => {
        messageDiv.className = 'message';
    }, 5000);
}

// Recolectar datos del formulario
function collectFormData() {
    const form = document.getElementById('documentForm');
    const formData = new FormData(form);
    const data = {};

    formData.forEach((value, key) => {
        data[key] = value;
    });

    // Agregar items
    data.items = appState.items;
    data.total = appState.formData.total || 0;

    return data;
}

// Descargar documento
async function downloadDocument(format) {
    try {
        const form = document.getElementById('documentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        showLoading(true);

        const data = collectFormData();

        const response = await fetch(`/api/documents/generate-${format}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                documentType: appState.currentTab,
                data: data
            })
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

        // Crear blob y descargar
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${appState.currentTab}_${Date.now()}.${format === 'pdf' ? 'pdf' : 'docx'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showMessage(`${format.toUpperCase()} descargado correctamente`, 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage(`Error al generar el documento: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Mostrar/ocultar loading
function showLoading(active) {
    const loading = document.getElementById('loading');
    if (active) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}
