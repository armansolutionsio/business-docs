// Estado global de la aplicación
const appState = {
    currentTab: 'quote',
    items: [],
    formData: {},
    categoryDetails: {},
    images: null
};

// ===== BASE DE DATOS DE AEROPUERTOS (IATA) =====
const AIRPORTS_DB = [
    // Argentina
    { code: "EZE", name: "Ministro Pistarini (Ezeiza)", city: "Buenos Aires", country: "Argentina" },
    { code: "AEP", name: "Aeroparque Jorge Newbery", city: "Buenos Aires", country: "Argentina" },
    { code: "COR", name: "Ingeniero Ambrosio Taravella", city: "Córdoba", country: "Argentina" },
    { code: "MDZ", name: "El Plumerillo", city: "Mendoza", country: "Argentina" },
    { code: "BRC", name: "Teniente Luis Candelaria", city: "Bariloche", country: "Argentina" },
    { code: "IGR", name: "Cataratas del Iguazú", city: "Puerto Iguazú", country: "Argentina" },
    { code: "SLA", name: "Martín Miguel de Güemes", city: "Salta", country: "Argentina" },
    { code: "TUC", name: "Teniente Benjamín Matienzo", city: "Tucumán", country: "Argentina" },
    { code: "NQN", name: "Presidente Perón", city: "Neuquén", country: "Argentina" },
    { code: "USH", name: "Malvinas Argentinas", city: "Ushuaia", country: "Argentina" },
    { code: "ROS", name: "Islas Malvinas", city: "Rosario", country: "Argentina" },
    { code: "FTE", name: "Comandante Armando Tola", city: "El Calafate", country: "Argentina" },
    { code: "REL", name: "Almirante Marcos A. Zar", city: "Trelew", country: "Argentina" },
    { code: "CRD", name: "General Enrique Mosconi", city: "Comodoro Rivadavia", country: "Argentina" },
    { code: "PSS", name: "Libertador Gral. San Martín", city: "Posadas", country: "Argentina" },
    { code: "RGA", name: "Río Grande", city: "Río Grande", country: "Argentina" },
    { code: "JUJ", name: "Gobernador Horacio Guzmán", city: "San Salvador de Jujuy", country: "Argentina" },
    { code: "CNQ", name: "Doctor Fernando Piragine Niveyro", city: "Corrientes", country: "Argentina" },
    { code: "RES", name: "Resistencia", city: "Resistencia", country: "Argentina" },
    { code: "SFN", name: "Sauce Viejo", city: "Santa Fe", country: "Argentina" },
    { code: "MDQ", name: "Astor Piazzolla", city: "Mar del Plata", country: "Argentina" },
    { code: "BHI", name: "Comandante Espora", city: "Bahía Blanca", country: "Argentina" },
    { code: "CTC", name: "Coronel Felipe Varela", city: "Catamarca", country: "Argentina" },
    { code: "IRJ", name: "Capitán V. Almandos Almonacid", city: "La Rioja", country: "Argentina" },
    { code: "UAQ", name: "Domingo Faustino Sarmiento", city: "San Juan", country: "Argentina" },
    { code: "LUQ", name: "Brigadier Mayor C. R. Ojeda", city: "San Luis", country: "Argentina" },
    { code: "SDE", name: "Vicecomodoro Á. de la Paz Aragonés", city: "Santiago del Estero", country: "Argentina" },
    { code: "FMA", name: "El Pucú", city: "Formosa", country: "Argentina" },
    { code: "PMY", name: "El Tehuelche", city: "Puerto Madryn", country: "Argentina" },
    { code: "VDM", name: "Gobernador Edgardo Castello", city: "Viedma", country: "Argentina" },
    { code: "RSA", name: "Santa Rosa", city: "Santa Rosa", country: "Argentina" },
    { code: "RGL", name: "Piloto Civil Norberto Fernández", city: "Río Gallegos", country: "Argentina" },
    { code: "EPA", name: "El Palomar", city: "El Palomar", country: "Argentina" },
    // Sudamérica
    { code: "GRU", name: "Guarulhos", city: "São Paulo", country: "Brasil" },
    { code: "GIG", name: "Galeão", city: "Río de Janeiro", country: "Brasil" },
    { code: "BSB", name: "Presidente Juscelino Kubitschek", city: "Brasilia", country: "Brasil" },
    { code: "SSA", name: "Deputado Luís Eduardo Magalhães", city: "Salvador de Bahía", country: "Brasil" },
    { code: "FLN", name: "Hercílio Luz", city: "Florianópolis", country: "Brasil" },
    { code: "POA", name: "Salgado Filho", city: "Porto Alegre", country: "Brasil" },
    { code: "SCL", name: "Arturo Merino Benítez", city: "Santiago", country: "Chile" },
    { code: "BOG", name: "El Dorado", city: "Bogotá", country: "Colombia" },
    { code: "MDE", name: "José María Córdova", city: "Medellín", country: "Colombia" },
    { code: "CTG", name: "Rafael Núñez", city: "Cartagena", country: "Colombia" },
    { code: "LIM", name: "Jorge Chávez", city: "Lima", country: "Perú" },
    { code: "CUZ", name: "Alejandro Velasco Astete", city: "Cusco", country: "Perú" },
    { code: "MVD", name: "Carrasco", city: "Montevideo", country: "Uruguay" },
    { code: "ASU", name: "Silvio Pettirossi", city: "Asunción", country: "Paraguay" },
    { code: "VVI", name: "Viru Viru", city: "Santa Cruz", country: "Bolivia" },
    { code: "LPB", name: "El Alto", city: "La Paz", country: "Bolivia" },
    { code: "UIO", name: "Mariscal Sucre", city: "Quito", country: "Ecuador" },
    { code: "GYE", name: "José Joaquín de Olmedo", city: "Guayaquil", country: "Ecuador" },
    { code: "CCS", name: "Simón Bolívar", city: "Caracas", country: "Venezuela" },
    // Centroamérica y Caribe
    { code: "PTY", name: "Tocumen", city: "Ciudad de Panamá", country: "Panamá" },
    { code: "SJO", name: "Juan Santamaría", city: "San José", country: "Costa Rica" },
    { code: "CUN", name: "Cancún", city: "Cancún", country: "México" },
    { code: "MEX", name: "Benito Juárez", city: "Ciudad de México", country: "México" },
    { code: "HAV", name: "José Martí", city: "La Habana", country: "Cuba" },
    { code: "PUJ", name: "Punta Cana", city: "Punta Cana", country: "Rep. Dominicana" },
    { code: "SDQ", name: "Las Américas", city: "Santo Domingo", country: "Rep. Dominicana" },
    { code: "SXM", name: "Princess Juliana", city: "Sint Maarten", country: "Sint Maarten" },
    { code: "MBJ", name: "Sangster", city: "Montego Bay", country: "Jamaica" },
    // Norteamérica
    { code: "JFK", name: "John F. Kennedy", city: "New York", country: "USA" },
    { code: "EWR", name: "Newark Liberty", city: "Newark/New York", country: "USA" },
    { code: "MIA", name: "Miami International", city: "Miami", country: "USA" },
    { code: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "USA" },
    { code: "ORD", name: "O'Hare", city: "Chicago", country: "USA" },
    { code: "ATL", name: "Hartsfield-Jackson", city: "Atlanta", country: "USA" },
    { code: "DFW", name: "Dallas/Fort Worth", city: "Dallas", country: "USA" },
    { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "USA" },
    { code: "IAH", name: "George Bush Intercontinental", city: "Houston", country: "USA" },
    { code: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "Canadá" },
    // Europa
    { code: "MAD", name: "Adolfo Suárez Madrid-Barajas", city: "Madrid", country: "España" },
    { code: "BCN", name: "El Prat", city: "Barcelona", country: "España" },
    { code: "FCO", name: "Leonardo da Vinci (Fiumicino)", city: "Roma", country: "Italia" },
    { code: "MXP", name: "Malpensa", city: "Milán", country: "Italia" },
    { code: "CDG", name: "Charles de Gaulle", city: "París", country: "Francia" },
    { code: "LHR", name: "Heathrow", city: "Londres", country: "Reino Unido" },
    { code: "LGW", name: "Gatwick", city: "Londres", country: "Reino Unido" },
    { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Alemania" },
    { code: "MUC", name: "Franz Josef Strauss", city: "Múnich", country: "Alemania" },
    { code: "AMS", name: "Schiphol", city: "Ámsterdam", country: "Países Bajos" },
    { code: "IST", name: "Istanbul Airport", city: "Estambul", country: "Turquía" },
    { code: "LIS", name: "Humberto Delgado", city: "Lisboa", country: "Portugal" },
    { code: "ZRH", name: "Zurich Airport", city: "Zúrich", country: "Suiza" },
    { code: "VIE", name: "Vienna International", city: "Viena", country: "Austria" },
    { code: "ATH", name: "Eleftherios Venizelos", city: "Atenas", country: "Grecia" },
    // Medio Oriente y Asia
    { code: "DXB", name: "Dubai International", city: "Dubái", country: "Emiratos Árabes" },
    { code: "DOH", name: "Hamad International", city: "Doha", country: "Qatar" },
    { code: "TLV", name: "Ben Gurion", city: "Tel Aviv", country: "Israel" },
    { code: "NRT", name: "Narita", city: "Tokio", country: "Japón" },
    { code: "HND", name: "Haneda", city: "Tokio", country: "Japón" },
    { code: "ICN", name: "Incheon", city: "Seúl", country: "Corea del Sur" },
    { code: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "Tailandia" },
    { code: "SIN", name: "Changi", city: "Singapur", country: "Singapur" },
    // Oceanía y África
    { code: "SYD", name: "Kingsford Smith", city: "Sídney", country: "Australia" },
    { code: "AKL", name: "Auckland Airport", city: "Auckland", country: "Nueva Zelanda" },
    { code: "JNB", name: "OR Tambo", city: "Johannesburgo", country: "Sudáfrica" },
    { code: "CAI", name: "Cairo International", city: "El Cairo", country: "Egipto" },
];

// ===== CONFIGURACIÓN DE SECCIONES POR CATEGORÍA =====
const CATEGORY_DETAIL_CONFIG = {
    'Aéreos': {
        slug: 'aereos',
        title: 'Información de Vuelos',
        icon: '✈️',
        multiInstance: true,
        subItemLabel: 'Vuelo',
        topFields: [
            { name: 'passengerName', label: 'Nombre del Pasajero', type: 'text', placeholder: 'Ej: Leonardo Ponzio' },
        ],
        subItemFields: [
            { name: 'airline', label: 'Aerolínea', type: 'text', placeholder: 'Ej: Aerolíneas Argentinas' },
            { name: 'flightNumber', label: 'Nro. de Vuelo', type: 'text', placeholder: 'Ej: AR1234' },
            { name: 'departureAirport', label: 'Aeropuerto de Salida', type: 'airport', placeholder: 'Buscar por código o ciudad...' },
            { name: 'arrivalAirport', label: 'Aeropuerto de Llegada', type: 'airport', placeholder: 'Buscar por código o ciudad...' },
            { name: 'departureDate', label: 'Fecha de Salida', type: 'date' },
            { name: 'departureTime', label: 'Hora de Salida', type: 'time' },
            { name: 'arrivalDate', label: 'Fecha de Llegada', type: 'date' },
            { name: 'arrivalTime', label: 'Hora de Llegada', type: 'time' },
        ]
    },
    'Hoteles': {
        slug: 'hoteles',
        title: 'Información del Hospedaje',
        icon: '🏨',
        multiInstance: true,
        subItemLabel: 'Hotel',
        subItemFields: [
            { name: 'hotelName', label: 'Nombre del Hotel', type: 'text', placeholder: 'Ej: Hotel Hilton Buenos Aires' },
            { name: 'hotelLocation', label: 'Ubicación / Ciudad', type: 'text', placeholder: 'Ej: Puerto Madero, Buenos Aires' },
            { name: 'checkInDate', label: 'Fecha de Check-in', type: 'date' },
            { name: 'checkOutDate', label: 'Fecha de Check-out', type: 'date' },
            { name: 'numberOfNights', label: 'Cantidad de Noches', type: 'number', readonly: true, computed: 'nights' },
            { name: 'roomType', label: 'Tipo de Habitación', type: 'select', options: ['Standard', 'Superior', 'Suite', 'Deluxe', 'Junior Suite', 'Family Room'] },
            { name: 'mealPlan', label: 'Régimen', type: 'select', options: ['Solo alojamiento', 'Desayuno incluido', 'Media pensión', 'Pensión completa', 'All Inclusive'] },
        ]
    },
    'Packs Turísticos': {
        slug: 'packs',
        title: 'Detalle del Pack Turístico',
        icon: '🎒',
        multiInstance: true,
        subItemLabel: 'Pack',
        subItemFields: [
            { name: 'packName', label: 'Nombre del Pack', type: 'text', placeholder: 'Ej: Europa Clásica' },
            { name: 'destinations', label: 'Destinos Incluidos', type: 'textarea', placeholder: 'Ej: Madrid, Barcelona, París, Roma...' },
            { name: 'duration', label: 'Duración', type: 'text', placeholder: 'Ej: 7 noches / 8 días' },
            { name: 'included', label: '¿Qué Incluye?', type: 'textarea', placeholder: 'Detallar servicios incluidos en el pack...' },
        ]
    },
    'VIP/Premium': {
        slug: 'vip',
        title: 'Servicios VIP / Premium',
        icon: '⭐',
        multiInstance: true,
        subItemLabel: 'Servicio',
        subItemFields: [
            { name: 'serviceDescription', label: 'Descripción del Servicio', type: 'textarea', placeholder: 'Detallar el servicio VIP/Premium...' },
            { name: 'vipLocation', label: 'Ubicación / Lugar', type: 'text', placeholder: 'Ej: Lounge VIP Ezeiza' },
            { name: 'vipDate', label: 'Fecha', type: 'date' },
            { name: 'vipTime', label: 'Hora', type: 'time' },
            { name: 'specialNotes', label: 'Notas Especiales', type: 'textarea', placeholder: 'Requerimientos o detalles adicionales...' },
        ]
    },
    'Traslados': {
        slug: 'traslados',
        title: 'Información de Traslados',
        icon: '🚐',
        multiInstance: true,
        subItemLabel: 'Traslado',
        subItemFields: [
            { name: 'pickupPoint', label: 'Punto de Recogida', type: 'airport', placeholder: 'Buscar aeropuerto o escribir dirección...' },
            { name: 'dropoffPoint', label: 'Punto de Destino', type: 'text', placeholder: 'Ej: Hotel Hilton Puerto Madero' },
            { name: 'vehicleType', label: 'Tipo de Vehículo', type: 'select', options: ['Sedan', 'Van', 'Minibus', 'Bus', 'SUV', 'Limusina'] },
            { name: 'transferDate', label: 'Fecha', type: 'date' },
            { name: 'transferTime', label: 'Hora', type: 'time' },
            { name: 'passengerCount', label: 'Cantidad de Pasajeros', type: 'number', placeholder: '1' },
        ]
    },
    'Tours': {
        slug: 'tours',
        title: 'Detalle del Tour',
        icon: '🗺️',
        multiInstance: true,
        subItemLabel: 'Tour',
        subItemFields: [
            { name: 'tourName', label: 'Nombre del Tour', type: 'text', placeholder: 'Ej: City Tour Buenos Aires' },
            { name: 'tourLocation', label: 'Ubicación / Destino', type: 'text', placeholder: 'Ej: Buenos Aires, Argentina' },
            { name: 'tourDate', label: 'Fecha', type: 'date' },
            { name: 'tourDuration', label: 'Duración', type: 'text', placeholder: 'Ej: 4 horas, medio día, día completo' },
            { name: 'guideIncluded', label: 'Incluye Guía', type: 'select', options: ['Sí', 'No'] },
            { name: 'tourIncludes', label: '¿Qué Incluye?', type: 'textarea', placeholder: 'Detallar actividades y servicios incluidos...' },
        ]
    },
    'Seguros': {
        slug: 'seguros',
        title: 'Detalle del Seguro de Viaje',
        icon: '🛡️',
        multiInstance: true,
        subItemLabel: 'Seguro',
        subItemFields: [
            { name: 'insuranceCompany', label: 'Compañía Aseguradora', type: 'text', placeholder: 'Ej: Assist Card, Universal Assistance' },
            { name: 'coverageType', label: 'Tipo de Cobertura', type: 'select', options: ['Básico', 'Standard', 'Premium', 'Cobertura Total'] },
            { name: 'insuranceStartDate', label: 'Fecha de Inicio', type: 'date' },
            { name: 'insuranceEndDate', label: 'Fecha de Fin', type: 'date' },
            { name: 'coverageDetails', label: 'Detalle de Cobertura', type: 'textarea', placeholder: 'Detallar coberturas incluidas...' },
        ]
    },
    'Otros Servicios': {
        slug: 'otros',
        title: 'Información Adicional',
        icon: '📋',
        multiInstance: true,
        subItemLabel: 'Servicio',
        subItemFields: [
            { name: 'otherNotes', label: 'Notas / Detalles', type: 'textarea', placeholder: 'Describir el servicio adicional...' },
        ]
    }
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

// ── Integración con Core API (CRM) ──────────────────────────────────────────
const CORE_API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`;

function detectDocType(value) {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length === 11 ? 'CUIT' : 'DNI';
}

function normalizeDoc(value) {
    return (value || '').replace(/\D/g, '');
}

async function crmUpsertParty(clientName, clientCUIT, clientEmail, clientPhone) {
    if (!clientCUIT) return null;
    try {
        const r = await fetch(`${CORE_API_URL}/v1/parties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doc_type: detectDocType(clientCUIT),
                doc_number: clientCUIT,
                country: 'AR',
                full_name: clientName || '',
                email: clientEmail || '',
                phone: clientPhone || '',
            }),
        });
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; }
}

async function crmCreateLead(partyId, destination, leadId) {
    try {
        // Si viene leadId desde CRM, actualizar a QUOTE_SENT en lugar de crear
        if (leadId) {
            await fetch(`${CORE_API_URL}/v1/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'QUOTE_SENT' }),
            });
            return;
        }
        await fetch(`${CORE_API_URL}/v1/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                party_id: partyId || null,
                destination: destination || null,
                source: 'cotizador',
                status: 'QUOTE_SENT',
            }),
        });
    } catch { /* silencioso — no bloquear la descarga */ }
}

// Pre-rellenar formulario con parámetros de URL (ej. desde CRM)
function prefillFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const mapping = {
        clientName: params.get('clientName'),
        clientCUIT: params.get('clientCUIT'),
        clientEmail: params.get('clientEmail'),
        clientPhone: params.get('clientPhone'),
    };
    Object.entries(mapping).forEach(([field, value]) => {
        if (!value) return;
        const el = document.querySelector(`input[name="${field}"], textarea[name="${field}"]`);
        if (el) el.value = value;
    });
    const destination = params.get('destination');
    if (destination) {
        const descEl = document.querySelector('input[name="itemDescription"], textarea[name="itemDescription"]');
        if (descEl && !descEl.value) descEl.value = destination;
    }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadCompanyData();
    loadDefaultLogo();
    setupTabButtons();
    renderTab('quote');
    setDefaultDate();
    prefillFromUrlParams();
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

    // Contenedor dinámico para secciones de detalle por categoría
    if (['quote', 'budget', 'proposal'].includes(tabName)) {
        html += `<div id="categoryDetailSections"></div>`;
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

    // Renderizar secciones de detalle según items existentes
    updateCategoryDetailSections();
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

    // Auto-generate description for multi-instance categories
    const catConfig = CATEGORY_DETAIL_CONFIG[category.value];
    if (catConfig && catConfig.multiInstance && !desc.value) {
        const existingCount = appState.items.filter(i => i.category === category.value).length;
        const baseNames = {
            'Aéreos': 'Paquete Aéreo',
            'Hoteles': 'Paquete Hotel',
            'Packs Turísticos': 'Pack Turístico',
            'VIP/Premium': 'Servicio VIP',
            'Traslados': 'Paquete Traslado',
            'Tours': 'Paquete Tour',
            'Seguros': 'Seguro de Viaje',
            'Otros Servicios': 'Servicio Adicional'
        };
        const baseName = baseNames[category.value] || category.value;
        description = `${baseName} ${existingCount + 1}`;
    }

    // Para items con categoría, el precio puede ser 0 (se calcula de sub-items)
    const isCategorized = !!(catConfig && category.value);
    if (!description) {
        showMessage('Por favor completa la descripción', 'error');
        return;
    }
    if (!isCategorized && !price.value) {
        showMessage('Por favor completa el precio', 'error');
        return;
    }

    const qty = parseFloat(quantity.value) || 1;
    const item = {
        id: Date.now(),
        description: description,
        category: category.value || null,
        quantity: qty,
        price: parseFloat(price.value) || 0
    };

    appState.items.push(item);

    // Inicializar sub-items en el estado basado en la cantidad
    if (catConfig && catConfig.subItemFields) {
        const sectionKey = catConfig.slug + '_' + item.id;
        const subItems = [];
        for (let i = 0; i < qty; i++) {
            subItems.push({});
        }
        appState.categoryDetails[sectionKey] = { subItems: subItems };
    }

    renderItems();
    category.value = '';
    desc.value = '';
    quantity.value = '';
    price.value = '';
    updateTotal();
    updateCategoryDetailSections();
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
        // Para items con categoría: subtotal = price (el precio ya es la suma de sub-items)
        // Para items sin categoría: subtotal = quantity * price
        const isCategorized = item.category && CATEGORY_DETAIL_CONFIG[item.category];
        const subtotal = isCategorized ? item.price : (item.quantity * item.price);
        const qtyLabel = isCategorized ? item.quantity + ' (' + (CATEGORY_DETAIL_CONFIG[item.category].subItemLabel || 'sub') + (item.quantity > 1 ? 's' : '') + ')' : item.quantity;
        html += `
            <div class="item-row">
                <input type="text" value="${escapeHtml(item.description)}" readonly>
                <input type="text" value="${qtyLabel}" readonly>
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
    updateCategoryDetailSections();
}

// Actualizar total
function updateTotal() {
    let total = 0;

    if (appState.items.length > 0) {
        total = appState.items.reduce((sum, item) => {
            const isCategorized = item.category && CATEGORY_DETAIL_CONFIG[item.category];
            return sum + (isCategorized ? item.price : (item.quantity * item.price));
        }, 0);
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

// ===== SECCIONES DINÁMICAS POR CATEGORÍA =====

// Obtener categorías activas basado en items agregados
function getActiveCategories() {
    const categories = new Set();
    appState.items.forEach(item => {
        if (item.category && CATEGORY_DETAIL_CONFIG[item.category]) {
            categories.add(item.category);
        }
    });
    return categories;
}

// Orden de las categorías (mismo orden que el select)
const CATEGORY_ORDER = ['Aéreos', 'Hoteles', 'Packs Turísticos', 'VIP/Premium', 'Traslados', 'Tours', 'Seguros', 'Otros Servicios'];

// Actualizar secciones visibles según categorías activas
function updateCategoryDetailSections() {
    const container = document.getElementById('categoryDetailSections');
    if (!container) return;

    const activeCategories = getActiveCategories();

    // Build ordered list of expected section keys
    const expectedKeys = [];
    CATEGORY_ORDER.forEach(categoryName => {
        const config = CATEGORY_DETAIL_CONFIG[categoryName];
        if (!config || !activeCategories.has(categoryName)) return;

        if (config.multiInstance) {
            const items = appState.items.filter(i => i.category === categoryName);
            items.forEach((item, idx) => {
                expectedKeys.push({
                    key: config.slug + '_' + item.id,
                    categoryName,
                    item,
                    index: idx
                });
            });
        } else {
            expectedKeys.push({
                key: config.slug,
                categoryName,
                item: null,
                index: 0
            });
        }
    });

    const expectedKeySet = new Set(expectedKeys.map(e => e.key));

    // Remove sections that shouldn't exist
    const currentSections = container.querySelectorAll('.category-detail-section');
    currentSections.forEach(sec => {
        const secKey = sec.dataset.sectionKey;
        if (!expectedKeySet.has(secKey)) {
            const catName = sec.dataset.category;
            const config = CATEGORY_DETAIL_CONFIG[catName];
            if (config) saveCategoryDetailToState(secKey, config);
            sec.classList.add('category-section-exiting');
            setTimeout(() => {
                if (sec.parentNode) sec.parentNode.removeChild(sec);
            }, 300);
        }
    });

    // Add sections that don't exist yet (in correct order)
    expectedKeys.forEach(({ key, categoryName, item, index }) => {
        if (document.getElementById(`detail-${key}`)) return;

        saveAllCategoryDetails();
        const config = CATEGORY_DETAIL_CONFIG[categoryName];
        const sectionHtml = renderCategorySection(categoryName, key, item, index);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = sectionHtml;
        const sectionEl = wrapper.firstElementChild;
        sectionEl.classList.add('category-section-entering');

        // Insert in correct order
        let inserted = false;
        const existingSections = container.querySelectorAll('.category-detail-section');
        const myOrder = expectedKeys.findIndex(e => e.key === key);
        for (const sec of existingSections) {
            const secKey = sec.dataset.sectionKey;
            const secOrder = expectedKeys.findIndex(e => e.key === secKey);
            if (secOrder > myOrder) {
                container.insertBefore(sectionEl, sec);
                inserted = true;
                break;
            }
        }
        if (!inserted) container.appendChild(sectionEl);

        setupCategorySectionListeners(key, config);
        requestAnimationFrame(() => {
            sectionEl.classList.remove('category-section-entering');
        });
    });
}

// Renderizar HTML de una sección de detalle
function renderCategorySection(categoryName, sectionKey, item, instanceIndex) {
    const config = CATEGORY_DETAIL_CONFIG[categoryName];
    if (!sectionKey) sectionKey = config.slug;
    const savedData = appState.categoryDetails[sectionKey] || {};
    const subItems = savedData.subItems || [{}];

    // Build title
    let title = config.title;
    if (config.multiInstance && item) {
        title = item.description;
        if (config.topFields) {
            const nameField = config.topFields.find(f => f.name === 'passengerName');
            if (nameField && savedData.passengerName) {
                title += ' — ' + savedData.passengerName;
            }
        }
    }

    let html = `<div class="form-section category-detail-section" id="detail-${sectionKey}" data-category="${categoryName}" data-section-key="${sectionKey}">`;
    html += `<h3 class="section-title"><span class="category-icon">${config.icon}</span> ${escapeHtml(title)}</h3>`;

    // Top fields (e.g. passenger name for Aéreos)
    if (config.topFields) {
        html += `<div class="form-grid">`;
        config.topFields.forEach(field => {
            html += renderDetailField(field, sectionKey, savedData);
        });
        html += `</div>`;
    }

    // Sub-items container
    if (config.subItemFields) {
        html += `<div class="sub-items-container" id="sub-items-${sectionKey}">`;
        subItems.forEach((subItemData, idx) => {
            html += renderSubItemForm(config, sectionKey, idx, subItemData, subItems.length);
        });
        html += `</div>`;
        html += `<button type="button" class="btn-add-subitem" onclick="addSubItem('${sectionKey}', '${categoryName}')">+ Agregar ${config.subItemLabel || 'Item'}</button>`;
    }

    // Imagen upload + descripción (siempre presente)
    const hasImage = appState.images && appState.images[sectionKey];
    html += `
        <div class="image-upload-card" style="margin-top: 16px;">
            <div class="image-upload-header">
                <label style="margin: 0; font-size: 14px;">Imagen / Captura</label>
                <select id="${sectionKey}Size" class="image-size-select" onchange="handleImageSizeChange('${sectionKey}', this.value)">
                    <option value="medium">Tamaño: Mediano</option>
                    <option value="small">Tamaño: Pequeño</option>
                    <option value="large">Tamaño: Grande</option>
                </select>
            </div>
            <input type="file" id="${sectionKey}Image" accept="image/*" onchange="handleImageUpload(event, '${sectionKey}')" style="margin-bottom: 10px;">
            <div id="${sectionKey}Preview" class="image-preview-container">${hasImage ? `<div class="image-preview"><img src="${appState.images[sectionKey].data}" alt="Vista previa"><button type="button" class="remove-preview-btn" onclick="removeImage('${sectionKey}')">✕ Eliminar</button></div>` : ''}</div>
            <textarea id="detail-${sectionKey}-description" placeholder="Descripción adicional (opcional)" rows="2" style="margin-top: 10px;">${savedData.description || ''}</textarea>
        </div>
    `;

    html += `</div>`;
    return html;
}

// Renderizar formulario de un sub-item individual
function renderSubItemForm(config, sectionKey, index, subItemData, totalSubItems) {
    const label = config.subItemLabel || 'Item';
    let html = `<div class="sub-item-form" data-sub-index="${index}" id="sub-item-${sectionKey}-${index}">`;
    html += `<div class="sub-item-header">`;
    html += `<span class="sub-item-title">${label} ${index + 1}</span>`;
    // Price field for each sub-item
    html += `<div class="sub-item-price-group">`;
    html += `<label>Precio:</label>`;
    html += `<input type="number" class="sub-item-price" id="sub-price-${sectionKey}-${index}" value="${subItemData._price || ''}" placeholder="0.00" step="0.01" min="0" onchange="updateItemPriceFromSubItems('${sectionKey}')">`;
    html += `</div>`;
    if (totalSubItems > 1) {
        html += `<button type="button" class="remove-subitem-btn" onclick="removeSubItem('${sectionKey}', ${index}, '${config.slug}')">✕</button>`;
    }
    html += `</div>`;
    html += `<div class="form-grid">`;
    config.subItemFields.forEach(field => {
        const fieldId = `detail-${sectionKey}-sub-${index}-${field.name}`;
        const value = subItemData[field.name] || '';
        const readonlyAttr = field.readonly ? 'readonly' : '';
        const readonlyClass = field.readonly ? 'auto-calculated' : '';

        if (field.type === 'textarea') {
            html += `
                <div class="form-group full-width">
                    <label>${field.label}</label>
                    <textarea id="${fieldId}" placeholder="${field.placeholder || ''}" rows="3">${value}</textarea>
                </div>`;
        } else if (field.type === 'select') {
            html += `
                <div class="form-group">
                    <label>${field.label}</label>
                    <select id="${fieldId}">
                        <option value="">Seleccionar...</option>
                        ${field.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                </div>`;
        } else if (field.type === 'airport') {
            html += `
                <div class="form-group">
                    <label>${field.label}</label>
                    <div class="airport-autocomplete-wrapper">
                        <input type="text" id="${fieldId}" class="airport-input" placeholder="${field.placeholder || 'Buscar aeropuerto...'}" value="${escapeHtml(value)}" autocomplete="off">
                        <div class="airport-autocomplete-dropdown" id="${fieldId}-dropdown"></div>
                    </div>
                </div>`;
        } else {
            html += `
                <div class="form-group">
                    <label>${field.label}</label>
                    <input type="${field.type}" id="${fieldId}" placeholder="${field.placeholder || ''}" value="${escapeHtml(value)}" ${readonlyAttr} class="${readonlyClass}">
                </div>`;
        }
    });
    html += `</div>`;
    html += `</div>`;
    return html;
}

// Agregar un sub-item a una sección
function addSubItem(sectionKey, categoryName) {
    const config = CATEGORY_DETAIL_CONFIG[categoryName];
    if (!config) return;

    // Guardar estado actual antes de modificar
    saveCategoryDetailToState(sectionKey, config);

    // Agregar sub-item vacío
    if (!appState.categoryDetails[sectionKey]) appState.categoryDetails[sectionKey] = {};
    if (!appState.categoryDetails[sectionKey].subItems) appState.categoryDetails[sectionKey].subItems = [];
    appState.categoryDetails[sectionKey].subItems.push({});

    // Re-renderizar la sección de sub-items
    const container = document.getElementById(`sub-items-${sectionKey}`);
    if (container) {
        const subItems = appState.categoryDetails[sectionKey].subItems;
        container.innerHTML = '';
        subItems.forEach((subData, idx) => {
            container.innerHTML += renderSubItemForm(config, sectionKey, idx, subData, subItems.length);
        });
        // Re-setup listeners
        setupSubItemListeners(sectionKey, config);
    }
}

// Eliminar un sub-item de una sección
function removeSubItem(sectionKey, index, slug) {
    // Find the category config from slug
    let config = null;
    let categoryName = null;
    for (const [name, cfg] of Object.entries(CATEGORY_DETAIL_CONFIG)) {
        if (cfg.slug === slug) { config = cfg; categoryName = name; break; }
    }
    if (!config) return;

    // Guardar estado actual
    saveCategoryDetailToState(sectionKey, config);

    const detail = appState.categoryDetails[sectionKey];
    if (!detail || !detail.subItems || detail.subItems.length <= 1) return;

    detail.subItems.splice(index, 1);

    // Re-renderizar sub-items
    const container = document.getElementById(`sub-items-${sectionKey}`);
    if (container) {
        container.innerHTML = '';
        detail.subItems.forEach((subData, idx) => {
            container.innerHTML += renderSubItemForm(config, sectionKey, idx, subData, detail.subItems.length);
        });
        setupSubItemListeners(sectionKey, config);
    }

    // Recalcular precio del item
    updateItemPriceFromSubItems(sectionKey);
}

// Actualizar precio del item principal desde la suma de sub-items
function updateItemPriceFromSubItems(sectionKey) {
    // Find the item that owns this section
    let foundItem = null;
    for (const item of appState.items) {
        if (item.category) {
            const config = CATEGORY_DETAIL_CONFIG[item.category];
            if (config && config.slug + '_' + item.id === sectionKey) {
                foundItem = item;
                break;
            }
        }
    }
    if (!foundItem) return;

    // Sum all sub-item prices from DOM
    const detail = appState.categoryDetails[sectionKey];
    const subItems = detail ? detail.subItems : [];
    let total = 0;
    subItems.forEach((_, idx) => {
        const priceInput = document.getElementById(`sub-price-${sectionKey}-${idx}`);
        if (priceInput) {
            total += parseFloat(priceInput.value) || 0;
        }
    });

    foundItem.price = total;
    renderItems();
    updateTotal();
}

// Renderizar un campo individual
function renderDetailField(field, slug, savedData) {
    const fieldId = `detail-${slug}-${field.name}`;
    const value = savedData[field.name] || '';
    const readonlyAttr = field.readonly ? 'readonly' : '';
    const readonlyClass = field.readonly ? 'auto-calculated' : '';
    let html = '';

    if (field.type === 'textarea') {
        html = `
            <div class="form-group full-width">
                <label>${field.label}</label>
                <textarea id="${fieldId}" placeholder="${field.placeholder || ''}" rows="3">${value}</textarea>
            </div>`;
    } else if (field.type === 'select') {
        html = `
            <div class="form-group">
                <label>${field.label}</label>
                <select id="${fieldId}">
                    <option value="">Seleccionar...</option>
                    ${field.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                </select>
            </div>`;
    } else if (field.type === 'airport') {
        html = `
            <div class="form-group">
                <label>${field.label}</label>
                <div class="airport-autocomplete-wrapper">
                    <input type="text" id="${fieldId}" class="airport-input" placeholder="${field.placeholder || 'Buscar aeropuerto...'}" value="${escapeHtml(value)}" autocomplete="off">
                    <div class="airport-autocomplete-dropdown" id="${fieldId}-dropdown"></div>
                </div>
            </div>`;
    } else {
        html = `
            <div class="form-group">
                <label>${field.label}</label>
                <input type="${field.type}" id="${fieldId}" placeholder="${field.placeholder || ''}" value="${escapeHtml(value)}" ${readonlyAttr} class="${readonlyClass}">
            </div>`;
    }
    return html;
}

// Configurar listeners para una sección recién creada
function setupCategorySectionListeners(sectionKey, config) {
    // Top fields listeners
    if (config.topFields) {
        config.topFields.forEach(field => {
            if (field.type === 'airport') {
                const input = document.getElementById(`detail-${sectionKey}-${field.name}`);
                if (input) setupAirportAutocomplete(input);
            }
        });
    }

    // Sub-item listeners
    setupSubItemListeners(sectionKey, config);

    // For multi-instance: update section title when passenger name changes
    if (config.multiInstance && config.topFields) {
        const passengerInput = document.getElementById(`detail-${sectionKey}-passengerName`);
        if (passengerInput) {
            passengerInput.addEventListener('input', () => {
                const section = document.getElementById(`detail-${sectionKey}`);
                if (section) {
                    const titleEl = section.querySelector('.section-title');
                    const item = appState.items.find(i => sectionKey === config.slug + '_' + i.id);
                    if (titleEl && item) {
                        let title = item.description;
                        if (passengerInput.value.trim()) {
                            title += ' — ' + passengerInput.value.trim();
                        }
                        titleEl.innerHTML = `<span class="category-icon">${config.icon}</span> ${escapeHtml(title)}`;
                    }
                }
            });
        }
    }

    // Restaurar tamaño de imagen si había uno guardado
    if (appState.images && appState.images[sectionKey]) {
        const sizeSelect = document.getElementById(`${sectionKey}Size`);
        if (sizeSelect && appState.images[sectionKey].size) {
            sizeSelect.value = appState.images[sectionKey].size;
        }
    }
}

// Configurar listeners para sub-items (aeropuertos autocomplete, hotel nights calc, etc.)
function setupSubItemListeners(sectionKey, config) {
    if (!config.subItemFields) return;
    const detail = appState.categoryDetails[sectionKey] || {};
    const subItems = detail.subItems || [{}];

    subItems.forEach((_, idx) => {
        // Airport autocomplete
        config.subItemFields.forEach(field => {
            if (field.type === 'airport') {
                const input = document.getElementById(`detail-${sectionKey}-sub-${idx}-${field.name}`);
                if (input) setupAirportAutocomplete(input);
            }
        });

        // Hotel nights auto-calculation
        if (config.slug === 'hoteles') {
            const checkIn = document.getElementById(`detail-${sectionKey}-sub-${idx}-checkInDate`);
            const checkOut = document.getElementById(`detail-${sectionKey}-sub-${idx}-checkOutDate`);
            const nights = document.getElementById(`detail-${sectionKey}-sub-${idx}-numberOfNights`);
            if (checkIn && checkOut && nights) {
                const calcNights = () => {
                    if (checkIn.value && checkOut.value) {
                        const d1 = new Date(checkIn.value);
                        const d2 = new Date(checkOut.value);
                        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                        nights.value = diff > 0 ? diff : '';
                    } else {
                        nights.value = '';
                    }
                };
                checkIn.addEventListener('change', calcNights);
                checkOut.addEventListener('change', calcNights);
                calcNights();
            }
        }
    });
}

// Autocomplete de aeropuertos
function setupAirportAutocomplete(input) {
    const dropdownId = input.id + '-dropdown';
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    let debounceTimer = null;
    let highlightedIndex = -1;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = input.value.trim().toLowerCase();
            if (query.length < 2) {
                dropdown.classList.remove('visible');
                return;
            }
            const results = AIRPORTS_DB.filter(a =>
                a.code.toLowerCase().includes(query) ||
                a.city.toLowerCase().includes(query) ||
                a.name.toLowerCase().includes(query) ||
                a.country.toLowerCase().includes(query)
            ).slice(0, 8);

            if (results.length === 0) {
                dropdown.classList.remove('visible');
                return;
            }

            highlightedIndex = -1;
            dropdown.innerHTML = results.map((a, i) => `
                <div class="airport-option" data-index="${i}" data-value="${a.code} - ${a.city} (${a.name})">
                    <span class="airport-code">${a.code}</span>
                    <span class="airport-city">${a.city}</span>
                    <span class="airport-country">· ${a.country}</span>
                    <span class="airport-name">${a.name}</span>
                </div>
            `).join('');

            dropdown.querySelectorAll('.airport-option').forEach(opt => {
                opt.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    input.value = opt.dataset.value;
                    dropdown.classList.remove('visible');
                    input.dispatchEvent(new Event('change'));
                });
            });

            dropdown.classList.add('visible');
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        const options = dropdown.querySelectorAll('.airport-option');
        if (!dropdown.classList.contains('visible') || options.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
            options.forEach((o, i) => o.classList.toggle('highlighted', i === highlightedIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            options.forEach((o, i) => o.classList.toggle('highlighted', i === highlightedIndex));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && options[highlightedIndex]) {
                input.value = options[highlightedIndex].dataset.value;
                dropdown.classList.remove('visible');
                input.dispatchEvent(new Event('change'));
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('visible'), 200);
    });
}

// Guardar datos de una sección en el estado
function saveCategoryDetailToState(sectionKey, config) {
    if (!appState.categoryDetails[sectionKey]) appState.categoryDetails[sectionKey] = {};
    const data = appState.categoryDetails[sectionKey];

    // Top fields
    if (config.topFields) {
        config.topFields.forEach(field => {
            const el = document.getElementById(`detail-${sectionKey}-${field.name}`);
            if (el) data[field.name] = el.value;
        });
    }

    // Sub-items
    if (config.subItemFields) {
        const container = document.getElementById(`sub-items-${sectionKey}`);
        if (container) {
            const subItemForms = container.querySelectorAll('.sub-item-form');
            const subItems = [];
            subItemForms.forEach((form, idx) => {
                const subData = {};
                config.subItemFields.forEach(field => {
                    const el = document.getElementById(`detail-${sectionKey}-sub-${idx}-${field.name}`);
                    if (el) subData[field.name] = el.value;
                });
                // Price
                const priceEl = document.getElementById(`sub-price-${sectionKey}-${idx}`);
                if (priceEl) subData._price = priceEl.value;
                subItems.push(subData);
            });
            data.subItems = subItems;
        }
    }

    // Descripción
    const descEl = document.getElementById(`detail-${sectionKey}-description`);
    if (descEl) data.description = descEl.value;
}

// Guardar todas las secciones activas
function saveAllCategoryDetails() {
    const activeCategories = getActiveCategories();
    activeCategories.forEach(categoryName => {
        const config = CATEGORY_DETAIL_CONFIG[categoryName];
        if (config.multiInstance) {
            const items = appState.items.filter(i => i.category === categoryName);
            items.forEach(item => {
                const sectionKey = config.slug + '_' + item.id;
                if (document.getElementById(`detail-${sectionKey}`)) {
                    saveCategoryDetailToState(sectionKey, config);
                }
            });
        } else {
            if (document.getElementById(`detail-${config.slug}`)) {
                saveCategoryDetailToState(config.slug, config);
            }
        }
    });
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

    // Recopilar datos de secciones de detalle por categoría
    saveAllCategoryDetails();
    data.categoryDetails = {};
    const activeCategories = getActiveCategories();
    activeCategories.forEach(categoryName => {
        const config = CATEGORY_DETAIL_CONFIG[categoryName];
        const slug = config.slug;

        if (config.multiInstance) {
            // Collect as array
            const items = appState.items.filter(i => i.category === categoryName);
            const entries = [];
            items.forEach(item => {
                const sectionKey = slug + '_' + item.id;
                if (appState.categoryDetails[sectionKey]) {
                    entries.push({
                        ...appState.categoryDetails[sectionKey],
                        _itemDescription: item.description
                    });
                }
            });
            if (entries.length > 0) {
                data.categoryDetails[slug] = entries;
            }
        } else {
            if (appState.categoryDetails[slug]) {
                data.categoryDetails[slug] = { ...appState.categoryDetails[slug] };
            }
        }
    });

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
            // Para imágenes de categorías dinámicas
            const activeCategories = getActiveCategories();
            const categoryImagesPayload = {};
            activeCategories.forEach(categoryName => {
                const config = CATEGORY_DETAIL_CONFIG[categoryName];
                const slug = config.slug;

                if (config.multiInstance) {
                    // Collect images indexed by position (aereos_0, aereos_1, etc.)
                    const items = appState.items.filter(i => i.category === categoryName);
                    items.forEach((item, idx) => {
                        const imgKey = slug + '_' + item.id;
                        if (appState.images[imgKey]) {
                            categoryImagesPayload[slug + '_' + idx] = {
                                data: appState.images[imgKey].data,
                                size: appState.images[imgKey].size || 'medium'
                            };
                        }
                    });
                } else {
                    if (appState.images[slug]) {
                        categoryImagesPayload[slug] = {
                            data: appState.images[slug].data,
                            size: appState.images[slug].size || 'medium'
                        };
                    }
                }
            });
            if (Object.keys(categoryImagesPayload).length > 0) {
                payload.data.categoryImages = categoryImagesPayload;
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

        // Sincronizar con CRM: si es cotización, upsert party + crear/actualizar lead
        if (appState.currentTab === 'quote') {
            const urlParams = new URLSearchParams(window.location.search);
            const leadId = urlParams.get('leadId');
            const party = await crmUpsertParty(data.clientName, data.clientCUIT, data.clientEmail, data.clientPhone);
            await crmCreateLead(party?.id, data.destinations || null, leadId);
        }
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
        showMessage('Por favor completa nombre y CUIT/DNI', 'error');
        return;
    }

    // Verificar si ya existe un cliente con el mismo documento
    try {
        const allResp = await fetch('/api/clients');
        if (allResp.ok) {
            const all = await allResp.json();
            const docNorm = normalizeDoc(cuit);
            const existing = all.find(c => normalizeDoc(c.clientCUIT) === docNorm);
            if (existing) {
                showMessage(`El cliente "${existing.clientName || cuit}" ya está registrado con ese documento. Se actualizarán sus datos.`, 'warning');
            }
        }
    } catch { /* continuar igual */ }

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

        if (!response.ok) throw new Error('Error guardando cliente');

        // Limpiar form
        document.getElementById('new-client-name').value = '';
        document.getElementById('new-client-cuit').value = '';
        document.getElementById('new-client-iva').value = '';
        document.getElementById('new-client-address').value = '';
        document.getElementById('new-client-email').value = '';
        document.getElementById('new-client-phone').value = '';

        showMessage('Cliente guardado correctamente', 'success');
        loadClientsList();
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error al guardar cliente', 'error');
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