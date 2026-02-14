// Estado global de la aplicación
const appState = {
    currentTab: 'quote',
    items: [],
    formData: {}
};

// Configuración de la Empresa
const companyData = {
    companyName: 'ARMAN SOLUTIONS S.R.L.',
    companyCUIT: '30-71918984-5',
    companyIVACondition: 'Responsable Inscripto',
    companyAddress: 'Uriburu J. Evaristo Pte. 592 Piso:2 Dpto:D - Ciudad de Buenos Aires',
    companyPOS: 1,
    companyStartDate: '2025-12-01',
    companyGrossIncome: '30719189845',
    companyEmail: 'info@armansolutions.com',
    companyPhone: '+54 11 XXXX-XXXX'
};

// Configuración de documentos
const documentConfig = {
    invoice: {
        title: 'FACTURA',
        fields: [
            // Datos del Emisor
            { name: 'companyName', label: 'Razón Social del Emisor', type: 'text', required: true },
            { name: 'companyCUIT', label: 'CUIT del Emisor', type: 'text', required: true, placeholder: 'XX-XXXXXXXX-X' },
            { name: 'companyIVACondition', label: 'Condición frente al IVA', type: 'select', required: true, options: ['Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'] },
            { name: 'companyAddress', label: 'Domicilio Fiscal', type: 'textarea', required: true },
            { name: 'companyPOS', label: 'Punto de Venta', type: 'number', required: true },
            { name: 'companyStartDate', label: 'Fecha de Inicio de Actividades', type: 'date', required: true },
            { name: 'companyGrossIncome', label: 'Ingresos Brutos (opcional)', type: 'text' },
            // Datos del Comprobante
            { name: 'invoiceNumber', label: 'Número de Comprobante', type: 'number', required: true },
            { name: 'invoiceLetter', label: 'Letra (A, B, C)', type: 'select', required: true, options: ['A', 'B', 'C', 'E', 'M', 'X'] },
            { name: 'invoiceDate', label: 'Fecha de Emisión', type: 'date', required: true },
            // Datos del Cliente
            { name: 'clientName', label: 'Nombre/Razón Social del Cliente', type: 'text', required: true },
            { name: 'clientCUIT', label: 'CUIT/DNI del Cliente', type: 'text', required: true },
            { name: 'clientIVACondition', label: 'Condición IVA del Cliente', type: 'select', required: true, options: ['Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable', 'Consumidor Final'] },
            { name: 'clientAddress', label: 'Domicilio del Cliente', type: 'textarea', required: true },
            // Datos Fiscales
            { name: 'cae', label: 'CAE (Código de Autorización Electrónico)', type: 'text', required: true },
            { name: 'caeExpiration', label: 'Fecha de Vencimiento del CAE', type: 'date', required: true },
            { name: 'qrCode', label: 'Código QR AFIP (opcional)', type: 'textarea' }
        ],
        hasItems: true
    },
    receipt: {
        title: 'RECIBO',
        fields: [
            // Datos del Emisor
            { name: 'companyName', label: 'Nombre o Razón Social', type: 'text', required: true },
            { name: 'companyCUIT', label: 'CUIT', type: 'text', required: true, placeholder: 'XX-XXXXXXXX-X' },
            { name: 'companyAddress', label: 'Domicilio', type: 'textarea', required: true },
            // Datos del Pagador
            { name: 'payerName', label: 'Nombre/Razón Social del Pagador', type: 'text', required: true },
            { name: 'payerCUIT', label: 'CUIT/DNI del Pagador', type: 'text', required: true },
            // Detalle del Pago
            { name: 'receiptNumber', label: 'Número de Recibo', type: 'number', required: true },
            { name: 'receiptDate', label: 'Fecha', type: 'date', required: true },
            { name: 'concept', label: 'Concepto (ej: Cancelación Factura Nº)', type: 'textarea', required: true },
            { name: 'amount', label: 'Importe en Números', type: 'number', required: true },
            { name: 'amountInLetters', label: 'Importe en Letras', type: 'text', required: true },
            { name: 'paymentMethod', label: 'Medio de Pago', type: 'select', required: true, options: ['Efectivo', 'Transferencia Bancaria', 'Cheque', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Billetera Virtual', 'Otro'] }
        ],
        hasItems: false
    },
    quote: {
        title: 'COTIZACIÓN / PRESUPUESTO',
        fields: [
            // Datos del Emisor
            { name: 'companyName', label: 'Nombre o Razón Social', type: 'text', required: true },
            { name: 'companyCUIT', label: 'CUIT', type: 'text', required: true, placeholder: 'XX-XXXXXXXX-X' },
            { name: 'companyAddress', label: 'Domicilio', type: 'textarea', required: true },
            { name: 'companyEmail', label: 'Email', type: 'email', required: true },
            { name: 'companyPhone', label: 'Teléfono', type: 'tel', required: true },
            // Datos del Cliente
            { name: 'clientName', label: 'Nombre/Empresa del Cliente', type: 'text', required: true },
            { name: 'clientCUIT', label: 'CUIT/DNI (opcional)', type: 'text' },
            { name: 'clientEmail', label: 'Email del Cliente', type: 'email' },
            { name: 'clientPhone', label: 'Teléfono del Cliente', type: 'tel' },
            // Comprobante
            { name: 'quoteNumber', label: 'Número de Cotización', type: 'text', required: true },
            { name: 'quoteDate', label: 'Fecha', type: 'date', required: true },
            // Condiciones
            { name: 'validity', label: 'Validez de la Oferta (días)', type: 'number', required: true, placeholder: '3', defaultValue: 3 },
            { name: 'paymentTerms', label: 'Forma de Pago (selecciona las que aceptas)', type: 'multiselect', required: true, options: ['Efectivo', 'Transferencia Bancaria', 'Cheque', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Billetera Virtual', 'Criptomonedas'] },
            { name: 'deliveryTerm', label: 'Plazo de Entrega', type: 'text', required: true, placeholder: 'a coordinar', defaultValue: 'a coordinar' }
        ],
        hasItems: true
    }
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadCompanyData();
    loadDefaultLogo();
    setupTabButtons();
    renderTab('quote');
    setDefaultDate();
});

// Configurar botones de pestañas
function setupTabButtons() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            // Ignorar botones deshabilitados
            if (e.target.disabled) return;

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

    // Agrupar campos por secciones
    const sections = {
        'Datos del Emisor': [],
        'Datos del Cliente': [],
        'Datos del Comprobante': [],
        'Condiciones': [],
        'Información Adicional': []
    };

    config.fields.forEach(field => {
        if (field.name.startsWith('company')) sections['Datos del Emisor'].push(field);
        else if (field.name.startsWith('client') || field.name.startsWith('payer')) sections['Datos del Cliente'].push(field);
        else if (field.name.startsWith('invoice') || field.name.startsWith('receipt') || field.name.startsWith('quote')) sections['Datos del Comprobante'].push(field);
        else if (field.name === 'validity' || field.name === 'paymentTerms' || field.name === 'deliveryTerm') sections['Condiciones'].push(field);
        else sections['Información Adicional'].push(field);
    });

    // Renderizar secciones
    Object.entries(sections).forEach(([sectionTitle, fields]) => {
        if (fields.length === 0) return;
        
        html += `<div class="form-section">
                    <h3 class="section-title">${sectionTitle}</h3>
                    <div class="form-grid">`;
        
        fields.forEach(field => {
            if (field.type === 'textarea') {
                html += `
                    <div class="form-group full-width">
                        <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                        <textarea name="${field.name}" ${field.required ? 'required' : ''} placeholder="${field.placeholder || ''}" rows="3">${field.defaultValue || ''}</textarea>
                    </div>
                `;
            } else if (field.type === 'multiselect') {
                html += `
                    <div class="form-group full-width">
                        <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                        <div class="multiselect-grid">
                            ${field.options.map(opt => `
                                <label class="multiselect-option">
                                    <input type="checkbox" name="${field.name}" value="${opt}">
                                    <span>${opt}</span>
                                </label>
                            `).join('')}
                        </div>
                        <input type="hidden" id="${field.name}-hidden" name="${field.name}" ${field.required ? 'required' : ''}>
                    </div>
                `;
            } else if (field.type === 'select') {
                // Mostrar como botones si es paymentMethod
                if (field.name === 'paymentMethod') {
                    html += `
                        <div class="form-group full-width">
                            <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                            <div class="payment-methods-grid">
                                ${field.options.map(opt => `
                                    <button type="button" class="payment-method-btn" data-method="${opt}" onclick="selectPaymentMethod(this, '${field.name}')">
                                        ${opt}
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" name="${field.name}" ${field.required ? 'required' : ''}>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="form-group">
                            <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                            <select name="${field.name}" ${field.required ? 'required' : ''}>
                                <option value="">Seleccionar...</option>
                                ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                            </select>
                        </div>
                    `;
                }
            } else {
                html += `
                    <div class="form-group">
                        <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                        <input type="${field.type}" name="${field.name}" ${field.required ? 'required' : ''} placeholder="${field.placeholder || ''}" value="${field.defaultValue || ''}">
                    </div>
                `;
            }
        });
        
        html += `    </div>
                </div>`;

        
        // Agregar sección de logo después de Datos del Emisor
        if (sectionTitle === 'Datos del Emisor') {
            html += `
                <div class="form-section">
                    <h3 class="section-title">Logo de la Empresa</h3>
                    <div class="form-grid">
                        <div class="form-group full-width">
                            <label>Cargar Logo <span class="required">*</span></label>
                            <input type="file" id="logoUpload" accept="image/*" onchange="handleLogoUpload(event)">
                            <div id="logoPreview" style="margin-top: 10px; max-height: 100px;">
                                ${appState.images && appState.images.logo ? '<img src="' + appState.images.logo.data + '" style="max-width: 100%; max-height: 100px; border-radius: 4px; border: 1px solid #ddd; padding: 5px;">' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    // Sección de items
    if (config.hasItems) {
        html += `
            <div class="form-section">
                <h3 class="section-title">Items / Detalles</h3>
                <div class="items-input-group">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <select id="itemCategory" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                            <option value="">-- Seleccionar concepto --</option>
                            <option value="Aéreos">✈️ Aéreos</option>
                            <option value="Hoteles">🏨 Hoteles</option>
                            <option value="Packs Turísticos">🎒 Packs Turísticos</option>
                            <option value="VIP/Premium">⭐ VIP/Premium</option>
                            <option value="Traslados">🚐 Traslados</option>
                            <option value="Tours">🗺️ Tours</option>
                            <option value="Seguros">🛡️ Seguros</option>
                            <option value="Otros Servicios">📋 Otros Servicios</option>
                        </select>
                        <input type="text" id="itemDesc" placeholder="O escribir descripción personalizada...">
                    </div>
                    <input type="number" id="itemQuantity" placeholder="Cantidad" step="0.01" min="0">
                    <input type="number" id="itemPrice" placeholder="Precio unitario" step="0.01" min="0">
                    <button type="button" class="btn-add-item" onclick="addItem()">+ Agregar Item</button>
                </div>
                <div id="itemsList"></div>
            </div>
        `;
    }

    // Sección de imágenes (solo para ciertos tipos de documentos)
    if (['quote', 'budget', 'proposal'].includes(tabName)) {
        html += `
            <div class="form-section">
                <h3 class="section-title">Información Adicional del Viaje</h3>
                <div class="image-upload-grid">
                    <div class="image-upload-card">
                        <div class="image-upload-header">
                            <label style="margin: 0; font-size: 14px;">Datos del Vuelo</label>
                            <select id="flightSize" class="image-size-select" onchange="handleImageSizeChange('flight', this.value)">
                                <option value="medium">Tamaño: Mediano</option>
                                <option value="small">Tamaño: Pequeño</option>
                                <option value="large">Tamaño: Grande</option>
                            </select>
                        </div>
                        <input type="file" id="flightImage" accept="image/*" onchange="handleImageUpload(event, 'flight')" style="margin-bottom: 10px;">
                        <div id="flightPreview" class="image-preview-container"></div>
                        <textarea id="flightDescription" placeholder="Descripción adicional (opcional)" rows="2" style="margin-top: 10px;"></textarea>
                    </div>
                    <div class="image-upload-card">
                        <div class="image-upload-header">
                            <label style="margin: 0; font-size: 14px;">Datos del Hospedaje</label>
                            <select id="hotelSize" class="image-size-select" onchange="handleImageSizeChange('hotel', this.value)">
                                <option value="medium">Tamaño: Mediano</option>
                                <option value="small">Tamaño: Pequeño</option>
                                <option value="large">Tamaño: Grande</option>
                            </select>
                        </div>
                        <input type="file" id="hotelImage" accept="image/*" onchange="handleImageUpload(event, 'hotel')" style="margin-bottom: 10px;">
                        <div id="hotelPreview" class="image-preview-container"></div>
                        <textarea id="hotelDescription" placeholder="Descripción adicional (opcional)" rows="2" style="margin-top: 10px;"></textarea>
                    </div>
                    <div class="image-upload-card">
                        <div class="image-upload-header">
                            <label style="margin: 0; font-size: 14px;">Información de Traslados</label>
                            <select id="transferSize" class="image-size-select" onchange="handleImageSizeChange('transfer', this.value)">
                                <option value="medium">Tamaño: Mediano</option>
                                <option value="small">Tamaño: Pequeño</option>
                                <option value="large">Tamaño: Grande</option>
                            </select>
                        </div>
                        <input type="file" id="transferImage" accept="image/*" onchange="handleImageUpload(event, 'transfer')" style="margin-bottom: 10px;">
                        <div id="transferPreview" class="image-preview-container"></div>
                        <textarea id="transferDescription" placeholder="Descripción adicional (opcional)" rows="2" style="margin-top: 10px;"></textarea>
                    </div>
                </div>
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
            <button type="button" class="btn btn-primary" onclick="downloadDocument('pdf')" style="grid-column: 1 / -1;">
                📄 Descargar PDF
            </button>
        </div>
    `;

    html += '</form>';
    contentDiv.innerHTML = html;

    // Pre-llenar campos de la empresa
    preFillCompanyData();

    // Setup de multiselect para Forma de Pago
    setupMultiselect();

    // Setup de eventos si tiene items
    if (config.hasItems) {
        setupItemsListeners();
    }

    // Setup de cálculo de total
    setupTotalCalculation();

    // Set default dates for date inputs
    setDefaultDate();
}

// Pre-llenar datos de la empresa
function preFillCompanyData() {
    Object.entries(companyData).forEach(([key, value]) => {
        const field = document.querySelector(`input[name="${key}"], select[name="${key}"], textarea[name="${key}"]`);
        if (field) {
            field.value = value;
        }
    });
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
    const category = document.getElementById('itemCategory');
    const desc = document.getElementById('itemDesc');
    const quantity = document.getElementById('itemQuantity');
    const price = document.getElementById('itemPrice');

    // Usar categoría seleccionada o descripción personalizada
    let description = desc.value || category.value;
    
    if (!description || !price.value) {
        showMessage('Por favor completa descripción y precio', 'error');
        return;
    }

    const item = {
        id: Date.now(),
        description: description,
        quantity: parseFloat(quantity.value) || 1,
        price: parseFloat(price.value)
    };

    appState.items.push(item);
    renderItems();
    category.value = '';
    desc.value = '';
    quantity.value = '';
    price.value = '';
    updateTotal();
    desc.focus();
}

// Manejar carga de imágenes
// Cargar logo
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!appState.images) appState.images = {};
        appState.images.logo = {
            data: e.target.result,
            name: file.name
        };
        // Mostrar preview
        const preview = document.getElementById('logoPreview');
        preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 100px; border-radius: 4px; border: 1px solid #ddd; padding: 5px;">`;
    };
    reader.readAsDataURL(file);
}

// Cargar imagen con vista previa
function handleImageUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!appState.images) appState.images = {};

        // Obtener el tamaño seleccionado
        const sizeSelect = document.getElementById(`${type}Size`);
        const size = sizeSelect ? sizeSelect.value : 'medium';

        appState.images[type] = {
            data: e.target.result,
            name: file.name,
            size: size
        };

        // Mostrar vista previa
        const previewContainer = document.getElementById(`${type}Preview`);
        if (previewContainer) {
            previewContainer.innerHTML = `
                <div class="image-preview">
                    <img src="${e.target.result}" alt="Vista previa ${type}">
                    <button type="button" class="remove-preview-btn" onclick="removeImage('${type}')">
                        ✕ Eliminar
                    </button>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

// Cambiar tamaño de imagen
function handleImageSizeChange(type, size) {
    if (appState.images && appState.images[type]) {
        appState.images[type].size = size;
    }
}

// Eliminar imagen
function removeImage(type) {
    if (appState.images && appState.images[type]) {
        delete appState.images[type];
    }

    // Limpiar vista previa
    const previewContainer = document.getElementById(`${type}Preview`);
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }

    // Limpiar input de archivo
    const fileInput = document.getElementById(`${type}Image`);
    if (fileInput) {
        fileInput.value = '';
    }

    // Limpiar descripción
    const descInput = document.getElementById(`${type}Description`);
    if (descInput) {
        descInput.value = '';
    }
}

// Seleccionar método de pago
function selectPaymentMethod(button, fieldName) {
    const container = button.parentElement;
    const buttons = container.querySelectorAll('.payment-method-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    const hiddenInput = container.nextElementSibling;
    hiddenInput.value = button.getAttribute('data-method');
}

// Setup multiselect para Forma de Pago
function setupMultiselect() {
    const checkboxes = document.querySelectorAll('input[name="paymentTerms"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const selected = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value)
                .join(', ');
            const hiddenInput = document.getElementById('paymentTerms-hidden');
            if (hiddenInput) {
                hiddenInput.value = selected;
            }
        });
    });
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
                <input type="text" value="${escapeHtml(item.description)}" readonly>
                <input type="number" value="${item.quantity}" readonly>
                <input type="text" value="${formatCurrency(item.price)}" readonly>
                <input type="text" value="${formatCurrency(subtotal)}" readonly>
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
    }

    document.getElementById('totalAmount').textContent = formatCurrency(total);
    appState.formData.total = total;
}

// Formatea números con miles '.' y decimales ',' con dos decimales
function formatCurrency(value) {
    const n = Number(value) || 0;
    const parts = n.toFixed(2).split('.');
    let intPart = parts[0];
    const decPart = parts[1];
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${intPart},${decPart}`;
}

// Escape simple HTML in text fields
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, function (s) {
        return ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[s];
    });
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
    // Agregar descripciones
    data.flightDescription = document.getElementById('flightDescription')?.value || '';
    data.hotelDescription = document.getElementById('hotelDescription')?.value || '';
    data.transferDescription = document.getElementById('transferDescription')?.value || '';
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
        const payload = {
            type: appState.currentTab,
            data: data,
            assets: {}
        };

        // Procesar imágenes si existen
        if (appState.images) {
            // Para logo
            if (appState.images.logo) {
                payload.assets.logo = appState.images.logo.data;
            }
            // Para firma
            if (appState.images.signature) {
                payload.assets.signature = appState.images.signature.data;
            }
            // Para código QR
            if (appState.images.qr) {
                payload.assets.qr = appState.images.qr.data;
            }
            // Para imágenes de viaje - pasar data URL y tamaño
            if (appState.images.flight || appState.images.hotel || appState.images.transfer) {
                payload.data.images = {};
                if (appState.images.flight) {
                    payload.data.images.flight = appState.images.flight.data;
                    payload.data.flightSize = appState.images.flight.size || 'medium';
                }
                if (appState.images.hotel) {
                    payload.data.images.hotel = appState.images.hotel.data;
                    payload.data.hotelSize = appState.images.hotel.size || 'medium';
                }
                if (appState.images.transfer) {
                    payload.data.images.transfer = appState.images.transfer.data;
                    payload.data.transferSize = appState.images.transfer.size || 'medium';
                }
            }
        }

        const response = await fetch(`/api/documents/generate-${format}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error: ${response.statusText} - ${errorText}`);
        }

        // Crear blob y descargar
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Generar nombre de archivo: TipoDocumento_Cliente_Numero
        const docTypes = {
            'invoice': 'Factura',
            'receipt': 'Recibo',
            'quote': 'Cotizacion'
        };
        const docType = docTypes[appState.currentTab] || 'Documento';

        // Obtener nombre del cliente y número de documento
        const clientName = (data.clientName || data.payerName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
        let docNumber = data.invoiceNumber || data.receiptNumber || data.quoteNumber || Date.now();

        // Sanitizar el número de documento
        docNumber = String(docNumber).replace(/[^a-zA-Z0-9]/g, '_');

        a.download = `${docType}_${clientName}_${docNumber}.${format === 'pdf' ? 'pdf' : 'docx'}`;
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

// Modal de Configuración de Empresa
function openCompanyModal() {
    const modal = document.getElementById('companyModal');
    
    // Pre-llenar modal con datos actuales
    Object.entries(companyData).forEach(([key, value]) => {
        const input = document.getElementById(`modal-${key}`);
        if (input) {
            input.value = value;
        }
    });
    
    modal.style.display = 'block';
}

function closeCompanyModal() {
    const modal = document.getElementById('companyModal');
    modal.style.display = 'none';
}

function saveCompanyData() {
    const fields = ['companyName', 'companyCUIT', 'companyAddress', 'companyIVACondition', 'companyPOS', 'companyEmail', 'companyPhone', 'companyStartDate', 'companyGrossIncome'];
    
    fields.forEach(field => {
        const input = document.getElementById(`modal-${field}`);
        if (input) {
            companyData[field] = input.value;
        }
    });
    
    // Guardar en localStorage para persistencia
    localStorage.setItem('companyData', JSON.stringify(companyData));
    
    // Re-renderizar formulario actual
    const currentTab = appState.currentTab;
    renderTab(currentTab);
    
    closeCompanyModal();
    showMessage('Datos de empresa guardados correctamente', 'success');
}

// Cargar datos de empresa desde localStorage
function loadCompanyData() {
    const saved = localStorage.getItem('companyData');
    if (saved) {
        Object.assign(companyData, JSON.parse(saved));
    }
}

// Cargar logo por defecto de Arman Travel
function loadDefaultLogo() {
    fetch('/logo-arman-travel.png')
        .then(response => {
            if (response.ok) return response.blob();
            throw new Error('Logo not found');
        })
        .then(blob => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (!appState.images) appState.images = {};
                appState.images.logo = {
                    data: e.target.result,
                    name: 'logo-arman-travel.png'
                };
                // Actualizar preview si existe
                const preview = document.getElementById('logoPreview');
                if (preview) {
                    preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 100px; border-radius: 4px; border: 1px solid #ddd; padding: 5px;">`;
                }
            };
            reader.readAsDataURL(blob);
        })
        .catch(err => {
            console.log('Logo por defecto no disponible:', err.message);
        });
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

// ===== GESTIÓN DE CLIENTES =====
function openClientsModal() {
    const modal = document.getElementById('clientsModal');
    modal.style.display = 'block';
    loadClientsList();
}

function closeClientsModal() {
    const modal = document.getElementById('clientsModal');
    modal.style.display = 'none';
}

async function loadClientsList() {
    try {
        const response = await fetch('/api/clients');
        const clients = await response.json();
        
        const clientsList = document.getElementById('clients-list');
        if (clients.length === 0) {
            clientsList.innerHTML = '<p style="text-align: center; color: #999;">No hay clientes guardados</p>';
            return;
        }
        
        let html = '';
        clients.forEach(client => {
            html += `
                <div class="client-card" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 10px; background: #f9f9f9;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <strong style="color: #7B2CBF;">${escapeHtml(client.clientName)}</strong>
                            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                                CUIT: ${escapeHtml(client.clientCUIT)} | 
                                ${client.clientEmail ? 'Email: ' + escapeHtml(client.clientEmail) : ''}
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-small" onclick="useClient('${client.id}')" style="padding: 6px 12px; font-size: 12px; background: #7B2CBF; color: white; border: none; border-radius: 4px; cursor: pointer;">Usar</button>
                            <button class="btn-small" onclick="deleteClientFromList('${client.id}')" style="padding: 6px 12px; font-size: 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Eliminar</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        clientsList.innerHTML = html;
    } catch (error) {
        console.error('Error loading clients:', error);
        document.getElementById('clients-list').innerHTML = '<p style="color: #f44336;">Error cargando clientes</p>';
    }
}

async function addNewClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const cuit = document.getElementById('new-client-cuit').value.trim();
    const iva = document.getElementById('new-client-iva').value;
    const address = document.getElementById('new-client-address').value.trim();
    const email = document.getElementById('new-client-email').value.trim();
    const phone = document.getElementById('new-client-phone').value.trim();
    
    if (!name || !cuit) {
        showMessage('Por favor completa nombre y CUIT', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientName: name,
                clientCUIT: cuit,
                clientIVACondition: iva,
                clientAddress: address,
                clientEmail: email,
                clientPhone: phone
            })
        });
        
        if (!response.ok) throw new Error('Error creando cliente');
        
        // Limpiar form
        document.getElementById('new-client-name').value = '';
        document.getElementById('new-client-cuit').value = '';
        document.getElementById('new-client-iva').value = '';
        document.getElementById('new-client-address').value = '';
        document.getElementById('new-client-email').value = '';
        document.getElementById('new-client-phone').value = '';
        
        showMessage('Cliente agregado correctamente', 'success');
        loadClientsList();
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error al agregar cliente', 'error');
    }
}

async function useClient(clientId) {
    try {
        const response = await fetch(`/api/clients/${clientId}`);
        const client = await response.json();
        
        // Llenar el formulario con datos del cliente
        const fields = ['clientName', 'clientCUIT', 'clientIVACondition', 'clientAddress', 'clientEmail', 'clientPhone'];
        fields.forEach(field => {
            const input = document.querySelector(`input[name="${field}"], select[name="${field}"], textarea[name="${field}"]`);
            if (input && client[field]) {
                input.value = client[field];
            }
        });
        
        closeClientsModal();
        showMessage('Datos del cliente cargados', 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error cargando cliente', 'error');
    }
}

async function deleteClientFromList(clientId) {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error eliminando cliente');
        
        showMessage('Cliente eliminado', 'success');
        loadClientsList();
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error al eliminar cliente', 'error');
    }
}

// Cerrar modal si se hace clic fuera
window.onclick = function(event) {
    const companyModal = document.getElementById('companyModal');
    const clientsModal = document.getElementById('clientsModal');
    
    if (companyModal && event.target === companyModal) {
        companyModal.style.display = 'none';
    }
    if (clientsModal && event.target === clientsModal) {
        clientsModal.style.display = 'none';
    }
}