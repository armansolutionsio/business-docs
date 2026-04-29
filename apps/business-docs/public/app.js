// Estado global de la aplicación
const appState = {
    currentTab: 'quote',
    items: [],
    formData: {},
    categoryDetails: {},
    images: null,
    // Estado específico del Cotizador (tech)
    tech: {
        hours: [],          // [{ id, role, seniority, hours, rate }]
        infra: [],          // [{ id, concept, model, cost, periods }]
        licenses: [],       // [{ id, service, model, cost, periods }]
        credentials: [],    // [{ id, concept, cost }]
        others: [],         // [{ id, description, quantity, price, unit }]
    }
};

// ===== CATÁLOGOS PARA EL COTIZADOR (TECH) =====
const TECH_PROJECT_TYPES = [
    'Aplicación Web', 'Aplicación Móvil (iOS/Android)', 'Aplicación de Escritorio',
    'API / Backend', 'E-commerce', 'CRM / ERP a medida', 'SaaS / Plataforma',
    'Integración de Sistemas', 'Automatización / RPA', 'Inteligencia Artificial / ML',
    'Data Engineering / Pipelines', 'Business Intelligence / Dashboards',
    'Bot / Chatbot / WhatsApp', 'DevOps / Infraestructura', 'Auditoría / Consultoría',
    'Mantenimiento / Soporte', 'Otro'
];
const TECH_METHODOLOGIES = ['Scrum', 'Kanban', 'Scrumban', 'Cascada', 'Híbrida', 'Por hitos'];
const TECH_ROLES = [
    'Tech Lead', 'Arquitecto de Software', 'Senior Full-Stack', 'Senior Backend',
    'Senior Frontend', 'Mid Full-Stack', 'Mid Backend', 'Mid Frontend',
    'Junior Developer', 'Mobile Developer', 'UX/UI Designer', 'QA Engineer',
    'DevOps / SRE', 'Data Engineer', 'Data Scientist', 'ML Engineer',
    'Project Manager', 'Product Owner', 'Consultor', 'Otro'
];
const TECH_SENIORITIES = ['Junior', 'Semi-Senior', 'Senior', 'Lead', 'N/A'];
const TECH_INFRA_PRESETS = [
    'AWS - Cómputo (EC2/Lambda)', 'AWS - Almacenamiento (S3)', 'AWS - RDS / Aurora',
    'AWS - CloudFront / Route 53', 'GCP - Compute Engine', 'GCP - Cloud SQL',
    'GCP - Cloud Storage', 'Azure - App Service', 'Azure - SQL Database',
    'Vercel', 'Netlify', 'Railway', 'Render', 'Fly.io', 'DigitalOcean',
    'Supabase', 'Firebase', 'PlanetScale', 'MongoDB Atlas', 'Redis Cloud',
    'Cloudflare (CDN/WAF)', 'Servidor dedicado / VPS', 'Backups y DRP', 'Otro'
];
const TECH_LICENSE_PRESETS = [
    'GitHub / GitLab / Bitbucket', 'Sentry (monitoreo errores)', 'Datadog / New Relic',
    'Stripe / MercadoPago (pasarela)', 'OpenAI API / Anthropic API',
    'Auth0 / Clerk / Cognito', 'Twilio (SMS/Voz)', 'WhatsApp Business API',
    'SendGrid / Mailgun / Resend', 'Mapbox / Google Maps API', 'Algolia / Meilisearch',
    'Atlassian (Jira/Confluence)', 'Figma / Adobe Creative Cloud',
    'Postman / Bruno', 'Apple Developer Program', 'Google Play Console',
    'Microsoft 365 / Google Workspace', 'Zapier / Make (n8n)', 'Otro'
];
const TECH_CREDENTIAL_PRESETS = [
    'Dominio (.com / .com.ar / etc.)', 'Certificado SSL extendido',
    'Apple Developer Program (anual)', 'Google Play Console (one-time)',
    'Firma de código (Code Signing)', 'Verificación de empresa (Meta/Google)',
    'Cuentas de servicios cloud', 'Licencia de software de terceros', 'Otro'
];
const TECH_PAYMENT_SCHEMES = [
    '50% anticipo / 50% contra-entrega',
    '40% anticipo / 30% mid / 30% entrega',
    '30% anticipo / hitos parciales / 10% aceptación',
    'Pago por hitos (a definir)',
    'Mensualizado (proyecto largo)',
    'Pago contra-entrega 100%',
    'Anticipo 100%',
    'A convenir'
];
const TECH_DEFAULT_TERMS = [
    'PROPIEDAD INTELECTUAL: Todo el código fuente, la documentación y los entregables del proyecto serán propiedad del CLIENTE una vez recibido el pago total acordado. Los componentes de uso interno, librerías propias y herramientas previas de ARMAN SOLUTIONS continuarán siendo propiedad del PROVEEDOR.',
    'CONFIDENCIALIDAD: Las partes se comprometen a mantener absoluta confidencialidad sobre la información técnica, comercial, financiera y estratégica intercambiada durante la ejecución del proyecto, durante un plazo mínimo de 5 (cinco) años contados desde la finalización del mismo.',
    'ALCANCE Y CAMBIOS (CHANGE REQUESTS): Cualquier modificación al alcance descripto en esta cotización implicará una orden de cambio (CR) que será presupuestada por separado. ARMAN SOLUTIONS no estará obligada a ejecutar tareas fuera del alcance hasta tanto se apruebe la CR correspondiente por escrito.',
    'GARANTÍA: Se otorga una garantía sobre defectos en la funcionalidad entregada por un plazo de 30 (treinta) días corridos desde la entrega final, siempre que no medie modificación posterior por terceros. Quedan excluidas mejoras, nuevas funcionalidades, errores derivados de cambios de entorno, datos corruptos o uso indebido.',
    'LIMITACIÓN DE RESPONSABILIDAD: La responsabilidad económica de ARMAN SOLUTIONS por incumplimientos se limita al monto efectivamente abonado por el CLIENTE bajo esta cotización. En ningún caso se responderá por daños indirectos, lucro cesante, pérdida de chance, ni perjuicios consecuentes o reputacionales.',
    'COSTOS RECURRENTES DE TERCEROS: Los costos de infraestructura cloud, suscripciones, licencias, credenciales, dominios y servicios SaaS de terceros listados en esta cotización son referenciales y pueden variar según el proveedor; serán trasladados al CLIENTE a costo, salvo que se indique lo contrario.',
    'PLAZO DE ENTREGA: Los plazos consignados están sujetos a la entrega oportuna por parte del CLIENTE de información, accesos, validaciones y aprobaciones requeridas. Las demoras imputables al CLIENTE extenderán automáticamente el cronograma.',
    'CANCELACIÓN: En caso de cancelación anticipada del proyecto por parte del CLIENTE, se facturarán las horas y costos efectivamente incurridos hasta la notificación, más una compensación equivalente al 15% del saldo pendiente en concepto de lucro cesante.',
    'JURISDICCIÓN Y LEY APLICABLE: Para toda controversia derivada de la presente cotización, las partes se someten a los Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires, República Argentina, con renuncia expresa a cualquier otro fuero o jurisdicción que pudiera corresponder. Se aplicará la legislación argentina vigente.',
    'ACEPTACIÓN: La aprobación de esta cotización por escrito (firma, e-mail, mensajería instantánea o transferencia del anticipo) implica el pleno conocimiento y aceptación de todas las condiciones aquí establecidas.'
].join('\n\n');

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
        subItemLabel: 'Servicio',
        isPackContainer: true,
        topFields: [
            { name: 'packName', label: 'Nombre del Pack', type: 'text', placeholder: 'Ej: Europa Clásica 15 días' },
            { name: 'destinations', label: 'Destinos Incluidos', type: 'text', placeholder: 'Ej: Madrid, Barcelona, París, Roma' },
            { name: 'duration', label: 'Duración', type: 'text', placeholder: 'Ej: 14 noches / 15 días' },
            { name: 'passengers', label: 'Cantidad de Pasajeros', type: 'number', placeholder: '1' },
        ],
        serviceTypes: {
            vuelo: {
                label: 'Vuelo', icon: '✈️',
                fields: [
                    { name: 'passengerName', label: 'Pasajero', type: 'text', placeholder: 'Nombre del pasajero' },
                    { name: 'airline', label: 'Aerolínea', type: 'text', placeholder: 'Ej: Aerolíneas Argentinas' },
                    { name: 'flightNumber', label: 'Nro. de Vuelo', type: 'text', placeholder: 'Ej: AR1234' },
                    { name: 'departureAirport', label: 'Aeropuerto Salida', type: 'airport', placeholder: 'Buscar...' },
                    { name: 'arrivalAirport', label: 'Aeropuerto Llegada', type: 'airport', placeholder: 'Buscar...' },
                    { name: 'departureDate', label: 'Fecha Salida', type: 'date' },
                    { name: 'departureTime', label: 'Hora Salida', type: 'time' },
                    { name: 'arrivalDate', label: 'Fecha Llegada', type: 'date' },
                    { name: 'arrivalTime', label: 'Hora Llegada', type: 'time' },
                ]
            },
            hotel: {
                label: 'Hotel', icon: '🏨',
                fields: [
                    { name: 'hotelName', label: 'Hotel', type: 'text', placeholder: 'Nombre del hotel' },
                    { name: 'hotelLocation', label: 'Ubicación', type: 'text', placeholder: 'Ciudad / zona' },
                    { name: 'checkInDate', label: 'Check-in', type: 'date' },
                    { name: 'checkOutDate', label: 'Check-out', type: 'date' },
                    { name: 'numberOfNights', label: 'Noches', type: 'number', readonly: true, computed: 'nights' },
                    { name: 'roomType', label: 'Habitación', type: 'select', options: ['Standard', 'Superior', 'Suite', 'Deluxe', 'Junior Suite', 'Family Room'] },
                    { name: 'mealPlan', label: 'Régimen', type: 'select', options: ['Solo alojamiento', 'Desayuno incluido', 'Media pensión', 'Pensión completa', 'All Inclusive'] },
                ]
            },
            traslado: {
                label: 'Traslado', icon: '🚐',
                fields: [
                    { name: 'pickupPoint', label: 'Origen', type: 'airport', placeholder: 'Buscar aeropuerto o escribir dirección...' },
                    { name: 'dropoffPoint', label: 'Destino', type: 'text', placeholder: 'Hotel, aeropuerto, etc.' },
                    { name: 'vehicleType', label: 'Vehículo', type: 'select', options: ['Sedan', 'Van', 'Minibus', 'Bus', 'SUV'] },
                    { name: 'transferDate', label: 'Fecha', type: 'date' },
                    { name: 'transferTime', label: 'Hora', type: 'time' },
                ]
            },
            tour: {
                label: 'Tour', icon: '🗺️',
                fields: [
                    { name: 'tourName', label: 'Tour', type: 'text', placeholder: 'Nombre del tour' },
                    { name: 'tourLocation', label: 'Ubicación', type: 'text', placeholder: 'Ciudad / zona' },
                    { name: 'tourDate', label: 'Fecha', type: 'date' },
                    { name: 'tourDuration', label: 'Duración', type: 'text', placeholder: 'Ej: 4 horas' },
                    { name: 'tourIncludes', label: '¿Qué Incluye?', type: 'textarea', placeholder: 'Actividades incluidas...' },
                ]
            },
            seguro: {
                label: 'Seguro', icon: '🛡️',
                fields: [
                    { name: 'insuranceCompany', label: 'Compañía', type: 'text', placeholder: 'Ej: Assist Card' },
                    { name: 'coverageType', label: 'Cobertura', type: 'select', options: ['Básico', 'Standard', 'Premium', 'Cobertura Total'] },
                    { name: 'insuranceStartDate', label: 'Desde', type: 'date' },
                    { name: 'insuranceEndDate', label: 'Hasta', type: 'date' },
                    { name: 'coverageDetails', label: 'Detalle', type: 'textarea', placeholder: 'Coberturas incluidas...' },
                ]
            }
        }
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
    companyPhone: '+54 9 11 5698-9263'
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
            { name: 'companyAddress', label: 'Domicilio', type: 'text', required: true },
            { name: 'companyEmail', label: 'Email', type: 'email' },
            { name: 'companyPhone', label: 'Teléfono', type: 'tel' },
            // Datos del Pagador
            { name: 'payerName', label: 'Nombre/Razón Social del Pagador', type: 'text', required: true },
            { name: 'payerCUIT', label: 'CUIT/DNI/Pasaporte del Pagador', type: 'text' },
            { name: 'payerEmail', label: 'Email del Pagador', type: 'email' },
            { name: 'payerPhone', label: 'Teléfono del Pagador', type: 'tel' },
            // Detalle del Pago
            { name: 'receiptNumber', label: 'Número de Recibo', type: 'text', required: true, readonly: true },
            { name: 'receiptDate', label: 'Fecha', type: 'date', required: true },
            { name: 'concept', label: 'Concepto (ej: Pago parcial viaje a Europa)', type: 'textarea', required: true },
            { name: 'currency', label: 'Moneda', type: 'select', required: true, options: ['ARS', 'USD', 'EUR'], defaultValue: 'USD' },
            { name: 'amount', label: 'Importe', type: 'number', required: true },
            { name: 'amountInLetters', label: 'Importe en Letras (ej: Cuatro mil novecientos sesenta)', type: 'text', required: true },
            { name: 'paymentMethod', label: 'Medio de Pago', type: 'select', required: true, options: ['Efectivo', 'Transferencia Bancaria', 'Cheque', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Billetera Virtual', 'Otro'] },
            { name: 'paymentReference', label: 'Referencia de Pago (nº transferencia, cheque, etc.)', type: 'text' }
        ],
        hasItems: false
    },
    quote: {
        title: 'COTIZACIÓN / PRESUPUESTO',
        fields: [
            // Datos del Emisor
            { name: 'companyName', label: 'Nombre o Razón Social', type: 'text', required: true },
            { name: 'companyCUIT', label: 'CUIT', type: 'text', required: true, placeholder: 'XX-XXXXXXXX-X' },
            { name: 'companyAddress', label: 'Domicilio', type: 'text', required: true },
            { name: 'companyEmail', label: 'Email', type: 'email', required: true },
            { name: 'companyPhone', label: 'Teléfono', type: 'tel', required: true },
            // Datos del Cliente
            { name: 'clientName', label: 'Nombre/Empresa', type: 'text' },
            { name: 'clientCUIT', label: 'CUIT/DNI', type: 'text' },
            { name: 'clientEmail', label: 'Email', type: 'email' },
            { name: 'clientPhone', label: 'Teléfono', type: 'tel' },
            { name: 'clientDomicilio', label: 'Domicilio', type: 'text', placeholder: 'Calle, número, piso, depto.' },
            { name: 'clientLocalidad', label: 'Localidad', type: 'text' },
            { name: 'clientProvincia', label: 'Provincia', type: 'text' },
            { name: 'clientCodigoPostal', label: 'Código Postal', type: 'text' },
            // Comprobante
            { name: 'quoteNumber', label: 'Número de Cotización', type: 'text', required: false, defaultValue: '', readonly: true },
            { name: 'quoteDate', label: 'Fecha', type: 'date', required: true },
            // Condiciones
            { name: 'validity', label: 'Validez de la Oferta (días)', type: 'number', required: true, placeholder: '3', defaultValue: 3 },
            { name: 'paymentTerms', label: 'Forma de Pago (selecciona las que aceptas)', type: 'multiselect', required: true, options: ['Efectivo', 'Transferencia Bancaria', 'Cheque', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Billetera Virtual', 'Criptomonedas'] },
            { name: 'deliveryTerm', label: 'Plazo de Entrega', type: 'text', required: true, placeholder: 'A confirmar', defaultValue: 'A confirmar' }
        ],
        hasItems: true
    }
};

function normalizeDoc(value) {
    return (value || '').replace(/\D/g, '');
}

// Pre-rellenar formulario con parámetros de URL (ej. desde CRM)
function prefillFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const mapping = {
        clientName: params.get('clientName'),
        clientCUIT: params.get('clientCUIT'),
        clientEmail: params.get('clientEmail'),
        clientPhone: params.get('clientPhone'),
        clientDomicilio: params.get('clientDomicilio'),
        clientLocalidad: params.get('clientLocalidad'),
        clientProvincia: params.get('clientProvincia'),
        clientCodigoPostal: params.get('clientCodigoPostal'),
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

// Cambia el branding del header/body según la pestaña activa
function applyBrandingForTab(tabName) {
    const body = document.body;
    const logo = document.getElementById('brandLogo');
    const title = document.getElementById('brandTitle');
    const subtitle = document.getElementById('brandSubtitle');
    if (tabName === 'quote-tech') {
        body.classList.add('brand-solutions');
        if (logo) { logo.src = '/Logo Arman Solutions.png'; logo.alt = 'Arman Solutions'; }
        if (title) title.textContent = 'Arman Solutions';
        if (subtitle) subtitle.textContent = 'Cotizador de Proyectos Tecnológicos';
    } else if (tabName === 'admin-ia') {
        body.classList.remove('brand-solutions');
        if (logo) { logo.src = '/logo-arman-travel.png'; logo.alt = 'Arman Travel'; }
        if (title) title.textContent = 'Admin IA';
        if (subtitle) subtitle.textContent = 'Extracción inteligente de comprobantes (factura, NC, ND, recibo, etc.)';
    } else {
        body.classList.remove('brand-solutions');
        if (logo) { logo.src = '/logo-arman-travel.png'; logo.alt = 'Arman Travel'; }
        if (title) title.textContent = 'Arman Travel';
        if (subtitle) subtitle.textContent = 'Sistema de Gestión de Documentos Comerciales';
    }
}

// Renderizar contenido de pestaña
function renderTab(tabName) {
    applyBrandingForTab(tabName);

    if (tabName === 'quote-tech') {
        renderTechQuoteTab();
        return;
    }
    if (tabName === 'admin-ia') {
        renderAdminIaTab();
        return;
    }

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
                                ${field.options.map(opt => `<option value="${opt}" ${field.defaultValue === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                            </select>
                        </div>
                    `;
                }
            } else {
                html += `
                    <div class="form-group">
                        <label>${field.label}${field.required ? '<span class="required">*</span>' : ''}</label>
                        <input type="${field.type}" name="${field.name}" ${field.required ? 'required' : ''} ${field.readonly ? 'readonly style="background:#f1f5f9;color:#64748b;cursor:not-allowed;"' : ''} placeholder="${field.placeholder || ''}" value="${field.defaultValue || ''}">
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
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <select id="itemCurrency" style="padding: 8px 6px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; font-weight: 700; color: #7B2CBF; background: white; cursor: pointer; width: 70px;">
                            <option value="USD">USD</option>
                            <option value="ARS">$</option>
                            <option value="EUR">EUR</option>
                        </select>
                        <input type="number" id="itemPrice" placeholder="Precio" step="0.01" min="0" style="flex: 1;">
                    </div>
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
            <div class="total-value"><span id="totalCurrency">USD</span> <span id="totalAmount">0.00</span></div>
        </div>
    `;

    // Botones de acción
    if (appState.currentTab === 'quote') {
        html += `
            <div class="button-group" style="grid-template-columns: 1fr;">
                <button type="button" class="btn btn-primary" onclick="confirmAndDownloadQuote()" style="padding: 16px;">
                    Confirmar y Descargar PDF
                </button>
            </div>
        `;
    } else {
        html += `
            <div class="button-group" style="grid-template-columns: 1fr;">
                <button type="button" class="btn btn-primary" onclick="downloadDocument('pdf')" style="padding: 16px;">
                    Descargar PDF
                </button>
            </div>
        `;
    }

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

    // Auto-fill receipt number
    if (tabName === 'receipt') {
        fetchNextReceiptNumber();
    }

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
    const currencySelect = document.getElementById('itemCurrency');
    const item = {
        id: Date.now(),
        description: description,
        category: category.value || null,
        quantity: qty,
        price: parseFloat(price.value) || 0,
        currency: currencySelect ? currencySelect.value : 'USD'
    };

    appState.items.push(item);

    // Inicializar sub-items en el estado basado en la cantidad
    if (catConfig) {
        const sectionKey = catConfig.slug + '_' + item.id;
        if (catConfig.isPackContainer) {
            // Packs arrancan vacíos, el usuario agrega servicios
            appState.categoryDetails[sectionKey] = { subItems: [] };
        } else if (catConfig.subItemFields) {
            const subItems = [];
            for (let i = 0; i < qty; i++) {
                subItems.push({});
            }
            appState.categoryDetails[sectionKey] = { subItems: subItems };
        }
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
// Múltiples imágenes para packs
function handleMultiImageUpload(event, sectionKey) {
    const files = event.target.files;
    if (!files || !files.length) return;
    if (!appState.images) appState.images = {};
    const multiKey = sectionKey + '_multi';
    if (!appState.images[multiKey]) appState.images[multiKey] = [];

    const sizeSelect = document.getElementById(`${sectionKey}Size`);
    const size = sizeSelect ? sizeSelect.value : 'medium';

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            appState.images[multiKey].push({ data: e.target.result, name: file.name, size: size });
            // Refresh preview
            const previewContainer = document.getElementById(`${sectionKey}Preview`);
            if (previewContainer) {
                const imgs = appState.images[multiKey];
                previewContainer.innerHTML = imgs.map((img, i) =>
                    `<div class="image-preview" style="position: relative; max-width: 200px;"><img src="${img.data}" style="max-width: 100%; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;"><button type="button" class="remove-preview-btn" onclick="removeMultiImage('${sectionKey}', ${i})">✕</button></div>`
                ).join('');
            }
        };
        reader.readAsDataURL(file);
    });
}

function removeMultiImage(sectionKey, index) {
    const multiKey = sectionKey + '_multi';
    if (appState.images && appState.images[multiKey]) {
        appState.images[multiKey].splice(index, 1);
        const previewContainer = document.getElementById(`${sectionKey}Preview`);
        if (previewContainer) {
            const imgs = appState.images[multiKey];
            previewContainer.innerHTML = imgs.map((img, i) =>
                `<div class="image-preview" style="position: relative; max-width: 200px;"><img src="${img.data}" style="max-width: 100%; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;"><button type="button" class="remove-preview-btn" onclick="removeMultiImage('${sectionKey}', ${i})">✕</button></div>`
            ).join('');
        }
    }
}

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

    if (appState.items.length === 0) {
        itemsList.innerHTML = '';
        return;
    }

    let html = `
        <div class="item-row" style="background: #f1f5f9; font-weight: 600; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border: none; box-shadow: none;">
            <span>Descripcion</span>
            <span style="text-align: center;">Cant.</span>
            <span style="text-align: right;">P. Unitario</span>
            <span style="text-align: right;">Subtotal</span>
            <span></span>
        </div>
    `;

    appState.items.forEach(item => {
        const qty = parseFloat(item.quantity) || 1;
        const price = parseFloat(item.price) || 0;
        const subtotal = qty * price;
        html += `
            <div class="item-row">
                <span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.description)}</span>
                <span style="text-align: center; font-weight: 600;">${qty}</span>
                <span style="text-align: right;">${item.currency || 'USD'} ${formatCurrency(price)}</span>
                <span style="text-align: right; font-weight: 700; color: #1e293b;">${item.currency || 'USD'} ${formatCurrency(subtotal)}</span>
                <button type="button" class="remove-item" onclick="removeItem(${item.id})">X</button>
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
            const qty = parseFloat(item.quantity) || 1;
            const price = parseFloat(item.price) || 0;
            return sum + (qty * price);
        }, 0);
    } else {
        // Si es recibo, usar el campo amount
        const amountInput = document.querySelector('input[name="amount"]');
        if (amountInput) {
            total = parseFloat(amountInput.value) || 0;
        }
    }

    document.getElementById('totalAmount').textContent = formatCurrency(total);
    // Mostrar moneda del primer item o del selector
    const currencyEl = document.getElementById('totalCurrency');
    if (currencyEl) {
        const firstCurrency = appState.items.length > 0 ? (appState.items[0].currency || 'USD') : (document.getElementById('itemCurrency') ? document.getElementById('itemCurrency').value : 'USD');
        currencyEl.textContent = firstCurrency;
    }
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

// Obtener próximo número de recibo (auto-asignado, no editable)
async function fetchNextReceiptNumber() {
    try {
        const res = await fetch('/api/recibos/next-number');
        const data = await res.json();
        const input = document.querySelector('input[name="receiptNumber"]');
        if (input) {
            input.value = data.numero;
        }
    } catch (e) {
        console.error('Error obteniendo número de recibo:', e);
    }
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
    if (config.isPackContainer) {
        // Pack container: multi-type sub-items
        html += `<div class="sub-items-container" id="sub-items-${sectionKey}">`;
        subItems.forEach((subItemData, idx) => {
            html += renderSubItemForm(config, sectionKey, idx, subItemData, subItems.length);
        });
        html += `</div>`;
        // Botones para agregar cada tipo de servicio
        html += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">`;
        Object.entries(config.serviceTypes).forEach(([typeKey, typeConf]) => {
            html += `<button type="button" class="btn-add-subitem" style="width: auto; flex: none; padding: 8px 14px; font-size: 12px;" onclick="addSubItem('${sectionKey}', '${categoryName}', '${typeKey}')">+ ${typeConf.icon} ${typeConf.label}</button>`;
        });
        html += `</div>`;
    } else if (config.subItemFields) {
        html += `<div class="sub-items-container" id="sub-items-${sectionKey}">`;
        subItems.forEach((subItemData, idx) => {
            html += renderSubItemForm(config, sectionKey, idx, subItemData, subItems.length);
        });
        html += `</div>`;
        html += `<button type="button" class="btn-add-subitem" onclick="addSubItem('${sectionKey}', '${categoryName}')">+ Agregar ${config.subItemLabel || 'Item'}</button>`;
    }

    // Imágenes + descripción
    if (config.isPackContainer) {
        // Packs: múltiples imágenes
        const packImages = (appState.images && appState.images[sectionKey + '_multi']) || [];
        html += `
        <div class="image-upload-card" style="margin-top: 16px;">
            <div class="image-upload-header">
                <label style="margin: 0; font-size: 14px;">Imágenes / Capturas</label>
                <select id="${sectionKey}Size" class="image-size-select" onchange="handleImageSizeChange('${sectionKey}', this.value)">
                    <option value="medium">Tamaño: Mediano</option>
                    <option value="small">Tamaño: Pequeño</option>
                    <option value="large">Tamaño: Grande</option>
                </select>
            </div>
            <input type="file" id="${sectionKey}Image" accept="image/*" multiple onchange="handleMultiImageUpload(event, '${sectionKey}')" style="margin-bottom: 10px;">
            <div id="${sectionKey}Preview" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${packImages.map((img, i) => `<div class="image-preview" style="position: relative; max-width: 200px;"><img src="${img.data}" style="max-width: 100%; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;"><button type="button" class="remove-preview-btn" onclick="removeMultiImage('${sectionKey}', ${i})">✕</button></div>`).join('')}
            </div>
            <textarea id="detail-${sectionKey}-description" placeholder="Descripción adicional (opcional)" rows="2" style="margin-top: 10px;">${savedData.description || ''}</textarea>
        </div>
        `;
    } else {
        // Otros: imagen única
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
    }

    html += `</div>`;
    return html;
}

// Renderizar formulario de un sub-item individual
function renderSubItemForm(config, sectionKey, index, subItemData, totalSubItems) {
    // Determinar campos y label según tipo de servicio (para packs) o config estándar
    let fields = config.subItemFields || [];
    let label = config.subItemLabel || 'Item';
    if (config.isPackContainer && subItemData._serviceType) {
        const svcType = config.serviceTypes[subItemData._serviceType];
        if (svcType) {
            fields = svcType.fields;
            label = svcType.icon + ' ' + svcType.label;
        }
    }

    const canRemove = config.isPackContainer ? true : (totalSubItems > 1);
    const serviceTypeValue = (config.isPackContainer && subItemData._serviceType) ? subItemData._serviceType : '';
    let html = `<div class="sub-item-form" data-sub-index="${index}" data-service-type="${serviceTypeValue}" id="sub-item-${sectionKey}-${index}">`;
    if (serviceTypeValue) {
        html += `<input type="hidden" id="detail-${sectionKey}-sub-${index}-_serviceType" value="${serviceTypeValue}">`;
    }
    html += `<div class="sub-item-header">`;
    html += `<span class="sub-item-title">${label} ${config.isPackContainer ? '' : (index + 1)}</span>`;
    // Price field for each sub-item
    html += `<div class="sub-item-price-group">`;
    html += `<label>Precio:</label>`;
    html += `<input type="number" class="sub-item-price" id="sub-price-${sectionKey}-${index}" value="${subItemData._price || ''}" placeholder="0.00" step="0.01" min="0" onchange="updateItemPriceFromSubItems('${sectionKey}')">`;
    html += `</div>`;
    if (config.isPackContainer) {
        html += `<button type="button" style="background: #7B2CBF; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; flex-shrink: 0;" onclick="duplicateSubItem('${sectionKey}', ${index}, '${config.slug}')" title="Duplicar">⧉</button>`;
    }
    if (canRemove) {
        html += `<button type="button" class="remove-subitem-btn" onclick="removeSubItem('${sectionKey}', ${index}, '${config.slug}')">✕</button>`;
    }
    html += `</div>`;
    html += `<div class="form-grid">`;
    fields.forEach(field => {
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
function addSubItem(sectionKey, categoryName, serviceType) {
    const config = CATEGORY_DETAIL_CONFIG[categoryName];
    if (!config) return;

    // Guardar estado actual antes de modificar
    saveCategoryDetailToState(sectionKey, config);

    // Agregar sub-item (con tipo de servicio para packs)
    if (!appState.categoryDetails[sectionKey]) appState.categoryDetails[sectionKey] = {};
    if (!appState.categoryDetails[sectionKey].subItems) appState.categoryDetails[sectionKey].subItems = [];
    const newSubItem = serviceType ? { _serviceType: serviceType } : {};
    appState.categoryDetails[sectionKey].subItems.push(newSubItem);

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
// Duplicar un sub-item (copia todos los datos excepto pasajero)
function duplicateSubItem(sectionKey, index, slug) {
    let config = null;
    for (const [name, cfg] of Object.entries(CATEGORY_DETAIL_CONFIG)) {
        if (cfg.slug === slug) { config = cfg; break; }
    }
    if (!config) return;

    saveCategoryDetailToState(sectionKey, config);
    const detail = appState.categoryDetails[sectionKey];
    if (!detail || !detail.subItems || !detail.subItems[index]) return;

    // Clonar el sub-item, limpiar el nombre del pasajero para que el usuario lo cambie
    const original = detail.subItems[index];
    const clone = { ...original };
    if (clone.passengerName) clone.passengerName = '';
    detail.subItems.splice(index + 1, 0, clone);

    // Re-renderizar
    const container = document.getElementById(`sub-items-${sectionKey}`);
    if (container) {
        container.innerHTML = '';
        detail.subItems.forEach((subData, idx) => {
            container.innerHTML += renderSubItemForm(config, sectionKey, idx, subData, detail.subItems.length);
        });
        setupSubItemListeners(sectionKey, config);
    }
    updateItemPriceFromSubItems(sectionKey);
}

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
    if (!detail || !detail.subItems) return;
    // Para packs se puede eliminar cualquiera; para otros, debe quedar al menos 1
    if (!config.isPackContainer && detail.subItems.length <= 1) return;

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

    // Para packs: el precio se pone al agregar el item, no se auto-suma
    const itemConfig = CATEGORY_DETAIL_CONFIG[foundItem.category];
    if (itemConfig && itemConfig.isPackContainer) return;

    // Para otros: sumar precios de sub-items
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
    if (!config.subItemFields && !config.isPackContainer) return;
    const detail = appState.categoryDetails[sectionKey] || {};
    const subItems = detail.subItems || [{}];

    subItems.forEach((subItemData, idx) => {
        // Determinar campos según tipo
        let fields = config.subItemFields || [];
        if (config.isPackContainer && subItemData._serviceType) {
            const svcType = config.serviceTypes[subItemData._serviceType];
            if (svcType) fields = svcType.fields;
        }

        // Airport autocomplete
        fields.forEach(field => {
            if (field.type === 'airport') {
                const input = document.getElementById(`detail-${sectionKey}-sub-${idx}-${field.name}`);
                if (input) setupAirportAutocomplete(input);
            }
        });

        // Hotel nights auto-calculation (para hoteles standalone o dentro de pack)
        const isHotelType = (config.slug === 'hoteles') ||
                           (config.isPackContainer && subItemData._serviceType === 'hotel');
        if (isHotelType) {
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
    if (config.subItemFields || config.isPackContainer) {
        const container = document.getElementById(`sub-items-${sectionKey}`);
        if (container) {
            const subItemForms = container.querySelectorAll('.sub-item-form');
            const subItems = [];
            subItemForms.forEach((form, idx) => {
                const subData = {};

                // Leer _serviceType directo del DOM (hidden input o data-attribute)
                let fields = config.subItemFields || [];
                if (config.isPackContainer) {
                    const typeEl = document.getElementById(`detail-${sectionKey}-sub-${idx}-_serviceType`);
                    const svcTypeKey = typeEl ? typeEl.value : (form.dataset.serviceType || '');
                    if (svcTypeKey && config.serviceTypes[svcTypeKey]) {
                        subData._serviceType = svcTypeKey;
                        fields = config.serviceTypes[svcTypeKey].fields;
                    }
                }

                fields.forEach(field => {
                    const el = document.getElementById(`detail-${sectionKey}-sub-${idx}-${field.name}`);
                    if (el) subData[field.name] = el.value;
                });
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
    // Moneda del documento: respetar el campo del form (recibo) o tomar del primer item (cotización/factura)
    if (!data.currency) {
        data.currency = appState.items.length > 0 ? (appState.items[0].currency || 'USD') : 'USD';
    }

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
                const detail = appState.categoryDetails[sectionKey];
                if (!detail) return;

                const hasSubItems = Array.isArray(detail.subItems) && detail.subItems.some(si => {
                    if (!si) return false;
                    return Object.entries(si).some(([k, v]) => k !== '_serviceType' && v !== '' && v != null);
                });
                const hasOwnFields = Object.entries(detail).some(([k, v]) => {
                    if (k === 'subItems' || k === '_itemDescription') return false;
                    return v !== '' && v != null;
                });
                if (!hasSubItems && !hasOwnFields) return;

                entries.push({
                    ...detail,
                    _itemDescription: item.description
                });
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

// Construir el payload de imágenes (logo, firma, QR, foto suelta, imágenes por categoría)
function buildAssetsPayload() {
    const assets = {};
    const categoryImages = {};
    if (!appState.images) return { assets, categoryImages };

    if (appState.images.logo) assets.logo = appState.images.logo.data;
    if (appState.images.signature) assets.signature = appState.images.signature.data;
    if (appState.images.qr) assets.qr = appState.images.qr.data;
    if (appState.images.photo) assets.photo = appState.images.photo.data;

    const activeCategories = getActiveCategories();
    activeCategories.forEach(categoryName => {
        const config = CATEGORY_DETAIL_CONFIG[categoryName];
        if (!config) return;
        const slug = config.slug;

        if (config.multiInstance) {
            const items = appState.items.filter(i => i.category === categoryName);
            items.forEach((item, idx) => {
                const imgKey = slug + '_' + item.id;
                if (appState.images[imgKey]) {
                    categoryImages[slug + '_' + idx] = {
                        data: appState.images[imgKey].data,
                        size: appState.images[imgKey].size || 'medium'
                    };
                }
                const multiKey = imgKey + '_multi';
                if (appState.images[multiKey] && appState.images[multiKey].length > 0) {
                    appState.images[multiKey].forEach((img, imgIdx) => {
                        categoryImages[slug + '_' + idx + '_img_' + imgIdx] = {
                            data: img.data,
                            size: img.size || 'medium'
                        };
                    });
                }
            });
        } else if (appState.images[slug]) {
            categoryImages[slug] = {
                data: appState.images[slug].data,
                size: appState.images[slug].size || 'medium'
            };
        }
    });

    return { assets, categoryImages };
}

// Ensure we have a contacto ID — find or create from form data
async function ensureContactoId(data) {
    let contactoId = appState._selectedContactoId;
    if (contactoId) return contactoId;

    const clientName = data.clientName || '';
    const clientCUIT = data.clientCUIT || '';
    const clientEmail = data.clientEmail || '';
    const clientPhone = data.clientPhone || '';

    if (clientName || clientCUIT || clientEmail || clientPhone) {
        try {
            const res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientName, clientCUIT, clientEmail, clientPhone })
            });
            if (res.ok) {
                const client = await res.json();
                appState._selectedContactoId = client.id;
                return client.id;
            }
        } catch (e) { console.error('Error creating client:', e); }
    }
    return null;
}

// Confirmar cotización en DB y descargar PDF en un solo paso
async function confirmAndDownloadQuote() {
    try {
        showLoading(true);
        const data = collectFormData();

        const contactoId = await ensureContactoId(data);
        if (!contactoId) {
            showMessage('Completa al menos un dato del cliente para confirmar', 'error');
            showLoading(false);
            return;
        }

        // 1. Save cotizacion in DB (persistimos categoryDetails + snapshot del cliente para poder reconstruir la cotización completa luego)
        const cotRes = await fetch(`/api/contactos/${contactoId}/cotizaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: data.items || [],
                moneda: data.currency || 'ARS',
                validez_dias: data.validityDays || 15,
                notas: data.notes || null,
                categoryDetails: data.categoryDetails || {},
                cliente_snapshot: {
                    nombre: data.clientName || '',
                    cuit: data.clientCUIT || '',
                    email: data.clientEmail || '',
                    telefono: data.clientPhone || '',
                    domicilio: data.clientDomicilio || '',
                    localidad: data.clientLocalidad || '',
                    provincia: data.clientProvincia || '',
                    codigo_postal: data.clientCodigoPostal || '',
                },
                created_by: 'cotizador',
            })
        });

        if (!cotRes.ok) {
            const errBody = await cotRes.text();
            console.error('Cotizacion save error:', cotRes.status, errBody);
            throw new Error('Error guardando cotización');
        }
        const cotizacion = await cotRes.json();

        // 2. Set the confirmed number in the form so the PDF uses it
        const quoteInput = document.querySelector('input[name="quoteNumber"]');
        if (quoteInput) quoteInput.value = cotizacion.numero;
        data.quoteNumber = cotizacion.numero;

        // 3. Pass contactoId and skip DB registration (already confirmed above)
        data._contactoId = contactoId;
        data._skipDbRegistration = true;

        // 4. Generate PDF
        const { assets, categoryImages } = buildAssetsPayload();
        if (Object.keys(categoryImages).length > 0) {
            data.categoryImages = categoryImages;
        }
        const payload = { type: 'quote', data: data, assets };

        const pdfRes = await fetch('/api/documents/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!pdfRes.ok) {
            const errorText = await pdfRes.text();
            throw new Error(`Error generando PDF: ${errorText}`);
        }

        // 5. Download PDF
        const blob = await pdfRes.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const clientName = (data.clientName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `Cotizacion_${clientName}_${cotizacion.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showMessage(`Cotización ${cotizacion.numero} confirmada y descargada`, 'success');

        // 6. Update quote number to next
        try {
            const nextRes = await fetch(`/api/contactos/${contactoId}/cotizaciones/next-number`);
            const nextData = await nextRes.json();
            if (quoteInput) quoteInput.value = nextData.numero;
        } catch (e) { /* ignore */ }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Descargar documento
async function downloadDocument(format) {
    try {
        showLoading(true);

        const data = collectFormData();

        // Pass contactoId if we have one, so backend can link the document
        if (appState._selectedContactoId) {
            data._contactoId = appState._selectedContactoId;
        }

        const { assets, categoryImages } = buildAssetsPayload();
        if (Object.keys(categoryImages).length > 0) {
            data.categoryImages = categoryImages;
        }
        const payload = {
            type: appState.currentTab,
            data: data,
            assets
        };

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
    // Migración: teléfonos legacy → nuevo oficial
    const legacyPhones = ['+541151327320', '+54 11 1234-5678', ''];
    if (legacyPhones.includes((companyData.companyPhone || '').trim())) {
        companyData.companyPhone = '+54 9 11 5698-9263';
        localStorage.setItem('companyData', JSON.stringify(companyData));
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
// ===== CLIENTES MODAL =====
let _clientsCache = [];
let _searchTimeout = null;

function openClientsModal() {
    const modal = document.getElementById('clientsModal');
    modal.style.display = 'block';
    document.getElementById('client-search-input').value = '';
    loadClientsList();
}

function closeClientsModal() {
    document.getElementById('clientsModal').style.display = 'none';
}

function searchClients(query) {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(async () => {
        if (!query.trim()) { loadClientsList(); return; }
        try {
            const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}`);
            const clients = await res.json();
            renderClientsList(clients);
        } catch (e) { console.error(e); }
    }, 300);
}

async function loadClientsList() {
    try {
        const response = await fetch('/api/clients/search?q=');
        // Empty search returns nothing, so load recent
        const res2 = await fetch('/api/clients');
        const clients = await res2.json();
        _clientsCache = clients;
        renderClientsList(clients.slice(0, 50));
    } catch (error) {
        console.error('Error loading clients:', error);
        document.getElementById('clients-list').innerHTML = '<p style="color: #f44336;">Error cargando clientes</p>';
    }
}

function renderClientsList(clients) {
    const clientsList = document.getElementById('clients-list');
    if (clients.length === 0) {
        clientsList.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 40px 0;">No se encontraron clientes</p>';
        return;
    }

    let html = '';
    clients.forEach(client => {
        const name = escapeHtml(client.clientName || 'Sin nombre');
        const initial = (client.clientName || '?')[0].toUpperCase();
        html += `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.1s;"
                 onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background='transparent'">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: #7B2CBF; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0;">${initial}</div>
                <div style="flex: 1; min-width: 0;" onclick="useClient('${client.id}')">
                    <div style="font-weight: 600; font-size: 14px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                    <div style="font-size: 12px; color: #64748b; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
                        ${client.clientCUIT ? '<span>' + escapeHtml(client.clientCUIT) + '</span>' : ''}
                        ${client.clientPhone ? '<span>' + escapeHtml(client.clientPhone) + '</span>' : ''}
                        ${client.clientEmail ? '<span style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom;">' + escapeHtml(client.clientEmail) + '</span>' : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button onclick="event.stopPropagation(); useClient('${client.id}')" style="padding: 5px 10px; font-size: 11px; background: #7B2CBF; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Usar</button>
                    <button onclick="event.stopPropagation(); viewClientCotizaciones('${client.id}')" style="padding: 5px 10px; font-size: 11px; background: #f1f5f9; color: #475569; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-weight: 500;">Cotiz.</button>
                    <a href="/crm/contactos/${client.id}" target="_blank" onclick="event.stopPropagation()" style="padding: 5px 10px; font-size: 11px; background: #f1f5f9; color: #475569; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-weight: 500; text-decoration: none;">Ficha</a>
                </div>
            </div>
            <div id="client-cotizaciones-${client.id}" style="display: none;"></div>
        `;
    });

    clientsList.innerHTML = html;
}

async function viewClientCotizaciones(contactoId) {
    const container = document.getElementById(`client-cotizaciones-${contactoId}`);
    if (!container) return;

    // Toggle
    if (container.style.display !== 'none') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '<p style="font-size: 12px; color: #999; padding: 8px;">Cargando cotizaciones...</p>';

    try {
        const res = await fetch(`/api/contactos/${contactoId}/cotizaciones`);
        const cotizaciones = await res.json();

        if (!cotizaciones.length) {
            container.innerHTML = '<p style="font-size: 12px; color: #999; padding: 8px 0;">Sin cotizaciones previas</p>';
            return;
        }

        const estadoColors = { borrador: '#94a3b8', enviada: '#3b82f6', aceptada: '#10b981', rechazada: '#ef4444', vencida: '#f59e0b' };
        let html = '<div style="border-top: 1px solid #e0e0e0; margin-top: 10px; padding-top: 10px;">';
        html += '<strong style="font-size: 12px; color: #7B2CBF;">Cotizaciones anteriores:</strong>';
        cotizaciones.forEach(c => {
            const color = estadoColors[c.estado] || '#94a3b8';
            const total = Number(c.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
            const fecha = c.fecha ? new Date(c.fecha).toLocaleDateString('es-AR') : '';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px;">
                    <div>
                        <strong>${escapeHtml(c.numero)}</strong>
                        <span style="color: #666; margin-left: 8px;">${fecha}</span>
                        <span style="margin-left: 8px;">$${total}</span>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 600;">${c.estado}</span>
                        <button onclick="markCotizacion(${c.id}, 'aceptada')" style="padding: 3px 8px; font-size: 10px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Marcar como aceptada">&#10004;</button>
                        <button onclick="markCotizacion(${c.id}, 'rechazada')" style="padding: 3px 8px; font-size: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Marcar como rechazada">&#10008;</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="font-size: 12px; color: #f44336;">Error cargando cotizaciones</p>';
    }
}

async function markCotizacion(cotizacionId, nuevoEstado) {
    try {
        // We use a direct DB update via a small API
        const res = await fetch(`/api/cotizaciones/${cotizacionId}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        if (res.ok) {
            showMessage(`Cotización marcada como ${nuevoEstado}`, 'success');
            // Refresh the cotizaciones view - find the parent contacto
            const data = await res.json();
            if (data.contacto_id) viewClientCotizaciones(data.contacto_id);
        } else {
            showMessage('Error actualizando cotización', 'error');
        }
    } catch (e) {
        showMessage('Error actualizando cotización', 'error');
    }
}

async function addNewClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const cuit = document.getElementById('new-client-cuit').value.trim();
    const iva = document.getElementById('new-client-iva').value;
    const address = document.getElementById('new-client-address').value.trim();
    const email = document.getElementById('new-client-email').value.trim();
    const phone = document.getElementById('new-client-phone').value.trim();

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
        // Fetch full contacto data from our API
        const response = await fetch(`/api/contactos/${clientId}`);
        const contacto = await response.json();

        // Fill form fields - map contacto fields to cotizador form fields
        const mapping = {
            clientName: contacto.nombre || contacto.razon_social || [contacto.nombre, contacto.apellido].filter(Boolean).join(' ') || '',
            clientCUIT: contacto.cuit || contacto.dni || '',
            clientEmail: contacto.email || '',
            clientPhone: contacto.telefono || '',
            clientAddress: [contacto.domicilio, contacto.localidad, contacto.provincia].filter(Boolean).join(', '),
        };

        // Also try payer fields (for recibos)
        const payerMapping = {
            payerName: mapping.clientName,
            payerCUIT: mapping.clientCUIT,
            payerEmail: mapping.clientEmail,
            payerPhone: mapping.clientPhone,
        };

        const allMappings = { ...mapping, ...payerMapping };

        Object.entries(allMappings).forEach(([field, value]) => {
            if (!value) return;
            const input = document.querySelector(`input[name="${field}"], select[name="${field}"], textarea[name="${field}"]`);
            if (input) input.value = value;
        });

        // Store selected contacto ID for later use
        appState._selectedContactoId = clientId;

        // Auto-fill quote number if on quote tab
        if (appState.currentTab === 'quote') {
            try {
                const nextRes = await fetch(`/api/contactos/${clientId}/cotizaciones/next-number`);
                const nextData = await nextRes.json();
                const quoteInput = document.querySelector('input[name="quoteNumber"]');
                if (quoteInput) {
                    quoteInput.value = nextData.numero;
                }
            } catch (e) { console.error('Error getting next quote number:', e); }
        }

        closeClientsModal();
        showMessage(`Datos de "${mapping.clientName}" cargados`, 'success');
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error cargando cliente', 'error');
    }
}

async function deleteClientFromList(clientId) {
    showMessage('Los contactos no se pueden eliminar. Podés marcarlos como inactivos desde la ficha.', 'info');
}

// ============================================================
// =====               COTIZADOR (TECH)                   =====
// ============================================================

function nextTechQuoteNumber() {
    const year = new Date().getFullYear();
    const counterKey = 'techQuoteCounter_' + year;
    const current = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
    localStorage.setItem(counterKey, String(current));
    return `CTZ-${year}-${String(current).padStart(4, '0')}`;
}
function peekTechQuoteNumber() {
    const year = new Date().getFullYear();
    const counterKey = 'techQuoteCounter_' + year;
    const next = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
    return `CTZ-${year}-${String(next).padStart(4, '0')}`;
}

function renderTechQuoteTab() {
    const today = new Date().toISOString().split('T')[0];
    const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    appState.tech = { hours: [], infra: [], licenses: [], credentials: [], others: [] };
    appState.formData = {};

    const html = `
    <form id="documentForm">
        <div class="message" id="message"></div>
        <div class="loading" id="loading"><div class="spinner"></div><p>Generando documento...</p></div>

        <div class="form-section">
            <h3 class="section-title">Datos del Emisor</h3>
            <div class="form-grid">
                <div class="form-group"><label>Razón Social<span class="required">*</span></label>
                    <input type="text" name="companyName" required value="${escapeHtml(companyData.companyName || '')}"></div>
                <div class="form-group"><label>CUIT<span class="required">*</span></label>
                    <input type="text" name="companyCUIT" required value="${escapeHtml(companyData.companyCUIT || '')}"></div>
                <div class="form-group"><label>Condición IVA</label>
                    <input type="text" name="companyIVACondition" value="${escapeHtml(companyData.companyIVACondition || '')}"></div>
                <div class="form-group"><label>Ingresos Brutos</label>
                    <input type="text" name="companyGrossIncome" value="${escapeHtml(companyData.companyGrossIncome || '')}"></div>
                <div class="form-group full-width"><label>Domicilio Fiscal<span class="required">*</span></label>
                    <input type="text" name="companyAddress" required value="${escapeHtml(companyData.companyAddress || '')}"></div>
                <div class="form-group"><label>Email<span class="required">*</span></label>
                    <input type="email" name="companyEmail" required value="${escapeHtml(companyData.companyEmail || '')}"></div>
                <div class="form-group"><label>Teléfono<span class="required">*</span></label>
                    <input type="tel" name="companyPhone" required value="${escapeHtml(companyData.companyPhone || '')}"></div>
                <div class="form-group"><label>Sitio Web</label>
                    <input type="text" name="companyWebsite" placeholder="armansolutions.com" value="armansolutions.com"></div>
                <div class="form-group"><label>Inicio de Actividades</label>
                    <input type="date" name="companyStartDate" value="${escapeHtml(companyData.companyStartDate || '')}"></div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Datos del Cliente</h3>
            <div class="form-grid">
                <div class="form-group"><label>Nombre / Razón Social<span class="required">*</span></label>
                    <input type="text" name="clientName" required></div>
                <div class="form-group"><label>CUIT / DNI</label>
                    <input type="text" name="clientCUIT" placeholder="XX-XXXXXXXX-X"></div>
                <div class="form-group"><label>Condición IVA</label>
                    <select name="clientIVACondition">
                        <option value="">Seleccionar...</option>
                        <option>Responsable Inscripto</option>
                        <option>Monotributista</option>
                        <option>Exento</option>
                        <option>Consumidor Final</option>
                        <option>Exterior</option>
                    </select></div>
                <div class="form-group"><label>Persona de Contacto</label>
                    <input type="text" name="clientContactPerson" placeholder="Nombre y rol del referente"></div>
                <div class="form-group"><label>Email</label>
                    <input type="email" name="clientEmail"></div>
                <div class="form-group"><label>Teléfono</label>
                    <input type="tel" name="clientPhone"></div>
                <div class="form-group full-width"><label>Domicilio</label>
                    <input type="text" name="clientDomicilio" placeholder="Calle, número, piso"></div>
                <div class="form-group"><label>Localidad</label>
                    <input type="text" name="clientLocalidad"></div>
                <div class="form-group"><label>Provincia / País</label>
                    <input type="text" name="clientProvincia"></div>
                <div class="form-group"><label>Código Postal</label>
                    <input type="text" name="clientCodigoPostal"></div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Datos del Documento</h3>
            <div class="form-grid">
                <div class="form-group"><label>Número de Cotización<span class="required">*</span></label>
                    <input type="text" name="quoteNumber" required value="${peekTechQuoteNumber()}"></div>
                <div class="form-group"><label>Fecha de Emisión<span class="required">*</span></label>
                    <input type="date" name="quoteDate" required value="${today}"></div>
                <div class="form-group"><label>Fecha de Vencimiento<span class="required">*</span></label>
                    <input type="date" name="quoteValidUntil" required value="${inThirtyDays}"></div>
                <div class="form-group"><label>Validez de la Oferta (días)<span class="required">*</span></label>
                    <input type="number" name="validity" required min="1" value="30"></div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Información del Proyecto</h3>
            <div class="form-grid">
                <div class="form-group full-width"><label>Nombre del Proyecto<span class="required">*</span></label>
                    <input type="text" name="projectName" required placeholder="Ej: Plataforma de gestión de pedidos"></div>
                <div class="form-group"><label>Tipo de Proyecto<span class="required">*</span></label>
                    <select name="projectType" required>
                        <option value="">Seleccionar...</option>
                        ${TECH_PROJECT_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label>Metodología</label>
                    <select name="projectMethodology">
                        <option value="">Seleccionar...</option>
                        ${TECH_METHODOLOGIES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label>Plazo Estimado (semanas)</label>
                    <input type="number" name="projectDurationWeeks" min="1" placeholder="12"></div>
                <div class="form-group"><label>Inicio Estimado</label>
                    <input type="date" name="projectStartDate"></div>
                <div class="form-group full-width"><label>Descripción / Alcance del Proyecto<span class="required">*</span></label>
                    <textarea name="projectScope" required rows="4" placeholder="Describir el alcance funcional, técnico y los entregables esperados..."></textarea></div>
                <div class="form-group full-width"><label>Stack Tecnológico Propuesto</label>
                    <textarea name="projectStack" rows="2" placeholder="Ej: React + Node.js + PostgreSQL, deploy en AWS"></textarea></div>
                <div class="form-group full-width"><label>Entregables</label>
                    <textarea name="projectDeliverables" rows="3" placeholder="Listar entregables: código fuente, documentación, despliegue, capacitación, etc."></textarea></div>
                <div class="form-group full-width"><label>Lo que NO está Incluido (Exclusiones)</label>
                    <textarea name="projectExclusions" rows="2" placeholder="Aclarar qué queda fuera del alcance: hosting, dominios, costos de terceros, capacitación extendida, etc."></textarea></div>
                <div class="form-group full-width"><label>Supuestos / Asunciones</label>
                    <textarea name="projectAssumptions" rows="2" placeholder="Ej: el cliente proveerá los accesos a producción, el diseño UX está aprobado, etc."></textarea></div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Recursos Humanos / Horas de Desarrollo</h3>
            <div class="tech-rubro-card">
                <div class="tech-row">
                    <div class="form-group"><label>Rol</label>
                        <select id="techHourRole">
                            ${TECH_ROLES.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label>Seniority</label>
                        <select id="techHourSeniority">
                            ${TECH_SENIORITIES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label>Horas</label>
                        <input type="number" id="techHourQty" min="0" step="0.5" placeholder="40"></div>
                    <div class="form-group"><label>USD / hora</label>
                        <input type="number" id="techHourRate" min="0" step="0.01" placeholder="35"></div>
                    <button type="button" class="btn-add-item" onclick="addTechHour()">+ Agregar</button>
                </div>
            </div>
            <div class="tech-rubro-list" id="techHoursList"></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Infraestructura / Servicios Cloud</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Costos recurrentes por nube, bases de datos, CDN, almacenamiento, backups, etc.</p>
            <div class="tech-rubro-card">
                <div class="tech-row">
                    <div class="form-group"><label>Concepto</label>
                        <input type="text" id="techInfraConcept" placeholder="Ej: AWS RDS Postgres" list="techInfraPresets">
                        <datalist id="techInfraPresets">
                            ${TECH_INFRA_PRESETS.map(p => `<option value="${escapeHtml(p)}"></option>`).join('')}
                        </datalist></div>
                    <div class="form-group"><label>Modelo</label>
                        <select id="techInfraModel">
                            <option value="Mensual">Mensual</option>
                            <option value="Anual">Anual</option>
                            <option value="One-time">Pago único</option>
                            <option value="Por uso">Por uso (estimado)</option>
                        </select></div>
                    <div class="form-group"><label>Costo (USD)</label>
                        <input type="number" id="techInfraCost" min="0" step="0.01" placeholder="50"></div>
                    <div class="form-group"><label>Cantidad de períodos</label>
                        <input type="number" id="techInfraPeriods" min="1" step="1" placeholder="12" value="1"></div>
                    <button type="button" class="btn-add-item" onclick="addTechInfra()">+ Agregar</button>
                </div>
            </div>
            <div class="tech-rubro-list" id="techInfraList"></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Licencias y Suscripciones</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">APIs de terceros, herramientas SaaS, monitoring, analítica, pasarelas de pago, etc.</p>
            <div class="tech-rubro-card">
                <div class="tech-row">
                    <div class="form-group"><label>Servicio</label>
                        <input type="text" id="techLicenseService" placeholder="Ej: Sentry" list="techLicensePresets">
                        <datalist id="techLicensePresets">
                            ${TECH_LICENSE_PRESETS.map(p => `<option value="${escapeHtml(p)}"></option>`).join('')}
                        </datalist></div>
                    <div class="form-group"><label>Modelo</label>
                        <select id="techLicenseModel">
                            <option value="Mensual">Mensual</option>
                            <option value="Anual">Anual</option>
                            <option value="One-time">Pago único</option>
                            <option value="Por uso">Por uso (estimado)</option>
                        </select></div>
                    <div class="form-group"><label>Costo (USD)</label>
                        <input type="number" id="techLicenseCost" min="0" step="0.01" placeholder="29"></div>
                    <div class="form-group"><label>Cantidad de períodos</label>
                        <input type="number" id="techLicensePeriods" min="1" step="1" placeholder="12" value="1"></div>
                    <button type="button" class="btn-add-item" onclick="addTechLicense()">+ Agregar</button>
                </div>
            </div>
            <div class="tech-rubro-list" id="techLicensesList"></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Credenciales, Dominios y Certificados</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Dominios, SSL, cuentas de developer, firma de código, verificaciones, etc.</p>
            <div class="tech-rubro-card">
                <div class="tech-row" style="grid-template-columns: 3fr 1fr auto;">
                    <div class="form-group"><label>Concepto</label>
                        <input type="text" id="techCredConcept" placeholder="Ej: Apple Developer (anual)" list="techCredPresets">
                        <datalist id="techCredPresets">
                            ${TECH_CREDENTIAL_PRESETS.map(p => `<option value="${escapeHtml(p)}"></option>`).join('')}
                        </datalist></div>
                    <div class="form-group"><label>Costo (USD)</label>
                        <input type="number" id="techCredCost" min="0" step="0.01" placeholder="99"></div>
                    <button type="button" class="btn-add-item" onclick="addTechCredential()">+ Agregar</button>
                </div>
            </div>
            <div class="tech-rubro-list" id="techCredentialsList"></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Otros Conceptos</h3>
            <div class="tech-rubro-card">
                <div class="tech-row">
                    <div class="form-group"><label>Descripción</label>
                        <input type="text" id="techOtherDesc" placeholder="Ej: Capacitación, viajes, etc."></div>
                    <div class="form-group"><label>Cantidad</label>
                        <input type="number" id="techOtherQty" min="0" step="0.01" placeholder="1"></div>
                    <div class="form-group"><label>Precio Unit. (USD)</label>
                        <input type="number" id="techOtherPrice" min="0" step="0.01" placeholder="0"></div>
                    <div class="form-group"><label>Unidad</label>
                        <input type="text" id="techOtherUnit" placeholder="hora / unidad / día"></div>
                    <button type="button" class="btn-add-item" onclick="addTechOther()">+ Agregar</button>
                </div>
            </div>
            <div class="tech-rubro-list" id="techOthersList"></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Ajustes Financieros</h3>
            <div class="form-grid">
                <div class="form-group"><label>Moneda<span class="required">*</span></label>
                    <select name="currency" id="techCurrency" required onchange="updateTechTotals()">
                        <option value="USD" selected>USD - Dólar Estadounidense</option>
                        <option value="ARS">ARS - Peso Argentino</option>
                        <option value="EUR">EUR - Euro</option>
                    </select></div>
                <div class="form-group"><label>Tipo de Cambio (si aplica)</label>
                    <input type="number" name="exchangeRate" id="techFxRate" min="0" step="0.01" placeholder="1" value="1" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>Contingencia / Riesgo (%)</label>
                    <input type="number" name="contingencyPct" id="techContingency" min="0" max="100" step="0.1" value="10" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>Margen / Markup adicional (%)</label>
                    <input type="number" name="marginPct" id="techMargin" min="0" max="100" step="0.1" value="0" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>Descuento (%)</label>
                    <input type="number" name="discountPct" id="techDiscount" min="0" max="100" step="0.1" value="0" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>IVA (%)</label>
                    <input type="number" name="ivaPct" id="techIva" min="0" max="100" step="0.1" value="21" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>Otros Impuestos / Retenciones (%)</label>
                    <input type="number" name="otherTaxesPct" id="techOtherTaxes" min="0" max="100" step="0.1" value="0" onchange="updateTechTotals()"></div>
                <div class="form-group"><label>Aplica IVA a costos cloud/licencias?</label>
                    <select name="ivaScope" id="techIvaScope" onchange="updateTechTotals()">
                        <option value="all" selected>Sobre todo</option>
                        <option value="hours">Solo sobre horas</option>
                        <option value="none">No aplicar IVA</option>
                    </select></div>
            </div>
        </div>

        <div class="totals-summary" id="techTotalsSummary">
            <div class="total-line"><span class="label">Recursos Humanos / Horas</span><span class="value" id="techTotalHours">0,00</span></div>
            <div class="total-line"><span class="label">Infraestructura</span><span class="value" id="techTotalInfra">0,00</span></div>
            <div class="total-line"><span class="label">Licencias y Suscripciones</span><span class="value" id="techTotalLicenses">0,00</span></div>
            <div class="total-line"><span class="label">Credenciales / Dominios</span><span class="value" id="techTotalCredentials">0,00</span></div>
            <div class="total-line"><span class="label">Otros Conceptos</span><span class="value" id="techTotalOthers">0,00</span></div>
            <div class="total-line subtotal-block"><span class="label"><strong>Subtotal</strong></span><span class="value" id="techSubtotal">0,00</span></div>
            <div class="total-line"><span class="label">+ Contingencia</span><span class="value" id="techContingencyAmt">0,00</span></div>
            <div class="total-line"><span class="label">+ Margen</span><span class="value" id="techMarginAmt">0,00</span></div>
            <div class="total-line"><span class="label">- Descuento</span><span class="value" id="techDiscountAmt">0,00</span></div>
            <div class="total-line subtotal-block"><span class="label"><strong>Base imponible</strong></span><span class="value" id="techTaxableBase">0,00</span></div>
            <div class="total-line"><span class="label">IVA</span><span class="value" id="techIvaAmt">0,00</span></div>
            <div class="total-line"><span class="label">Otros Impuestos / Retenciones</span><span class="value" id="techOtherTaxesAmt">0,00</span></div>
            <div class="total-line grand"><span>TOTAL COTIZADO</span><span class="value" id="techGrandTotal">0,00</span></div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Condiciones Comerciales</h3>
            <div class="form-grid">
                <div class="form-group"><label>Esquema de Pago<span class="required">*</span></label>
                    <select name="paymentScheme" required>
                        ${TECH_PAYMENT_SCHEMES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label>Plazo de Entrega</label>
                    <input type="text" name="deliveryTerm" placeholder="Ej: 12 semanas a partir del anticipo" value="A confirmar"></div>
                <div class="form-group"><label>Garantía (días)</label>
                    <input type="number" name="warrantyDays" min="0" value="30"></div>
                <div class="form-group"><label>Soporte Post-Entrega (días)</label>
                    <input type="number" name="supportDays" min="0" value="30"></div>
                <div class="form-group full-width"><label>Forma de Pago<span class="required">*</span></label>
                    <div class="multiselect-grid">
                        ${['Transferencia Bancaria','Transferencia Internacional (Wire)','MercadoPago','Stripe','PayPal','Crypto (USDT/USDC)','Cheque','Efectivo','Factoring'].map(opt => `
                            <label class="multiselect-option">
                                <input type="checkbox" name="paymentTerms" value="${escapeHtml(opt)}" ${opt === 'Transferencia Bancaria' ? 'checked' : ''}>
                                <span>${escapeHtml(opt)}</span>
                            </label>
                        `).join('')}
                    </div>
                    <input type="hidden" id="paymentTerms-hidden" name="paymentTerms" value="Transferencia Bancaria">
                </div>
                <div class="form-group full-width"><label>Datos Bancarios (opcional)</label>
                    <textarea name="bankDetails" rows="2" placeholder="Banco, CBU, Alias, Titular, CUIT"></textarea></div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Términos y Condiciones Legales</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Texto legal por defecto editable. Se incluirá en el PDF.</p>
            <div class="form-grid">
                <div class="form-group full-width">
                    <textarea name="legalTerms" class="legal-textarea" rows="14">${escapeHtml(TECH_DEFAULT_TERMS)}</textarea>
                </div>
            </div>
        </div>

        <div class="form-section">
            <h3 class="section-title">Notas y Observaciones</h3>
            <div class="form-grid">
                <div class="form-group full-width">
                    <textarea name="notes" rows="3" placeholder="Notas adicionales para el cliente..."></textarea></div>
            </div>
        </div>

        <div class="button-group">
            <button type="button" class="btn btn-primary" onclick="downloadTechQuote()" style="grid-column: 1 / -1;">
                Descargar Cotización (PDF)
            </button>
        </div>
    </form>`;

    document.getElementById('content').innerHTML = html;

    setupMultiselect();
    updateTechTotals();
}

function addTechHour() {
    const role = document.getElementById('techHourRole').value;
    const seniority = document.getElementById('techHourSeniority').value;
    const hours = parseFloat(document.getElementById('techHourQty').value) || 0;
    const rate = parseFloat(document.getElementById('techHourRate').value) || 0;
    if (!hours || hours <= 0) { showMessage('Ingresá la cantidad de horas', 'error'); return; }
    if (!rate || rate <= 0) { showMessage('Ingresá la tarifa por hora', 'error'); return; }
    appState.tech.hours.push({ id: Date.now(), role, seniority, hours, rate });
    document.getElementById('techHourQty').value = '';
    document.getElementById('techHourRate').value = '';
    renderTechHoursList(); updateTechTotals();
}
function removeTechHour(id) {
    appState.tech.hours = appState.tech.hours.filter(h => h.id !== id);
    renderTechHoursList(); updateTechTotals();
}
function renderTechHoursList() {
    const el = document.getElementById('techHoursList');
    if (!el) return;
    el.innerHTML = appState.tech.hours.map(h => `
        <div class="row-display">
            <div><div class="desc">${escapeHtml(h.role)} <span style="font-weight:400;color:#7048B0;">· ${escapeHtml(h.seniority)}</span></div>
                 <div class="meta">${h.hours} hs × USD ${formatCurrency(h.rate)}/h</div></div>
            <div class="meta">${h.hours} hs</div>
            <div class="meta">USD ${formatCurrency(h.rate)}</div>
            <div class="subtotal">USD ${formatCurrency(h.hours * h.rate)}</div>
            <button type="button" class="remove-row" onclick="removeTechHour(${h.id})">Eliminar</button>
        </div>`).join('');
}

function addTechInfra() {
    const concept = (document.getElementById('techInfraConcept').value || '').trim();
    const model = document.getElementById('techInfraModel').value;
    const cost = parseFloat(document.getElementById('techInfraCost').value) || 0;
    const periods = parseInt(document.getElementById('techInfraPeriods').value) || 1;
    if (!concept) { showMessage('Ingresá el concepto', 'error'); return; }
    appState.tech.infra.push({ id: Date.now(), concept, model, cost, periods });
    document.getElementById('techInfraConcept').value = '';
    document.getElementById('techInfraCost').value = '';
    document.getElementById('techInfraPeriods').value = '1';
    renderTechInfraList(); updateTechTotals();
}
function removeTechInfra(id) {
    appState.tech.infra = appState.tech.infra.filter(x => x.id !== id);
    renderTechInfraList(); updateTechTotals();
}
function renderTechInfraList() {
    const el = document.getElementById('techInfraList');
    if (!el) return;
    el.innerHTML = appState.tech.infra.map(x => `
        <div class="row-display">
            <div><div class="desc">${escapeHtml(x.concept)}</div>
                 <div class="meta">${escapeHtml(x.model)} · ${x.periods} período${x.periods > 1 ? 's' : ''}</div></div>
            <div class="meta">${escapeHtml(x.model)}</div>
            <div class="meta">USD ${formatCurrency(x.cost)}</div>
            <div class="subtotal">USD ${formatCurrency(x.cost * x.periods)}</div>
            <button type="button" class="remove-row" onclick="removeTechInfra(${x.id})">Eliminar</button>
        </div>`).join('');
}

function addTechLicense() {
    const service = (document.getElementById('techLicenseService').value || '').trim();
    const model = document.getElementById('techLicenseModel').value;
    const cost = parseFloat(document.getElementById('techLicenseCost').value) || 0;
    const periods = parseInt(document.getElementById('techLicensePeriods').value) || 1;
    if (!service) { showMessage('Ingresá el servicio', 'error'); return; }
    appState.tech.licenses.push({ id: Date.now(), service, model, cost, periods });
    document.getElementById('techLicenseService').value = '';
    document.getElementById('techLicenseCost').value = '';
    document.getElementById('techLicensePeriods').value = '1';
    renderTechLicensesList(); updateTechTotals();
}
function removeTechLicense(id) {
    appState.tech.licenses = appState.tech.licenses.filter(x => x.id !== id);
    renderTechLicensesList(); updateTechTotals();
}
function renderTechLicensesList() {
    const el = document.getElementById('techLicensesList');
    if (!el) return;
    el.innerHTML = appState.tech.licenses.map(x => `
        <div class="row-display">
            <div><div class="desc">${escapeHtml(x.service)}</div>
                 <div class="meta">${escapeHtml(x.model)} · ${x.periods} período${x.periods > 1 ? 's' : ''}</div></div>
            <div class="meta">${escapeHtml(x.model)}</div>
            <div class="meta">USD ${formatCurrency(x.cost)}</div>
            <div class="subtotal">USD ${formatCurrency(x.cost * x.periods)}</div>
            <button type="button" class="remove-row" onclick="removeTechLicense(${x.id})">Eliminar</button>
        </div>`).join('');
}

function addTechCredential() {
    const concept = (document.getElementById('techCredConcept').value || '').trim();
    const cost = parseFloat(document.getElementById('techCredCost').value) || 0;
    if (!concept) { showMessage('Ingresá el concepto', 'error'); return; }
    appState.tech.credentials.push({ id: Date.now(), concept, cost });
    document.getElementById('techCredConcept').value = '';
    document.getElementById('techCredCost').value = '';
    renderTechCredentialsList(); updateTechTotals();
}
function removeTechCredential(id) {
    appState.tech.credentials = appState.tech.credentials.filter(x => x.id !== id);
    renderTechCredentialsList(); updateTechTotals();
}
function renderTechCredentialsList() {
    const el = document.getElementById('techCredentialsList');
    if (!el) return;
    el.innerHTML = appState.tech.credentials.map(x => `
        <div class="row-display" style="grid-template-columns: 3fr 1fr auto;">
            <div class="desc">${escapeHtml(x.concept)}</div>
            <div class="subtotal">USD ${formatCurrency(x.cost)}</div>
            <button type="button" class="remove-row" onclick="removeTechCredential(${x.id})">Eliminar</button>
        </div>`).join('');
}

function addTechOther() {
    const description = (document.getElementById('techOtherDesc').value || '').trim();
    const quantity = parseFloat(document.getElementById('techOtherQty').value) || 0;
    const price = parseFloat(document.getElementById('techOtherPrice').value) || 0;
    const unit = (document.getElementById('techOtherUnit').value || '').trim();
    if (!description) { showMessage('Ingresá la descripción', 'error'); return; }
    if (!quantity || quantity <= 0) { showMessage('Ingresá la cantidad', 'error'); return; }
    appState.tech.others.push({ id: Date.now(), description, quantity, price, unit });
    document.getElementById('techOtherDesc').value = '';
    document.getElementById('techOtherQty').value = '';
    document.getElementById('techOtherPrice').value = '';
    document.getElementById('techOtherUnit').value = '';
    renderTechOthersList(); updateTechTotals();
}
function removeTechOther(id) {
    appState.tech.others = appState.tech.others.filter(x => x.id !== id);
    renderTechOthersList(); updateTechTotals();
}
function renderTechOthersList() {
    const el = document.getElementById('techOthersList');
    if (!el) return;
    el.innerHTML = appState.tech.others.map(x => `
        <div class="row-display">
            <div><div class="desc">${escapeHtml(x.description)}</div>
                 <div class="meta">${x.quantity} ${escapeHtml(x.unit || '')}</div></div>
            <div class="meta">${x.quantity}</div>
            <div class="meta">USD ${formatCurrency(x.price)}</div>
            <div class="subtotal">USD ${formatCurrency(x.quantity * x.price)}</div>
            <button type="button" class="remove-row" onclick="removeTechOther(${x.id})">Eliminar</button>
        </div>`).join('');
}

function updateTechTotals() {
    const t = appState.tech;
    const sumHours = t.hours.reduce((s, h) => s + h.hours * h.rate, 0);
    const sumInfra = t.infra.reduce((s, x) => s + x.cost * x.periods, 0);
    const sumLicenses = t.licenses.reduce((s, x) => s + x.cost * x.periods, 0);
    const sumCredentials = t.credentials.reduce((s, x) => s + x.cost, 0);
    const sumOthers = t.others.reduce((s, x) => s + x.quantity * x.price, 0);
    const subtotal = sumHours + sumInfra + sumLicenses + sumCredentials + sumOthers;

    const contingency = parseFloat(document.getElementById('techContingency')?.value) || 0;
    const margin = parseFloat(document.getElementById('techMargin')?.value) || 0;
    const discount = parseFloat(document.getElementById('techDiscount')?.value) || 0;
    const iva = parseFloat(document.getElementById('techIva')?.value) || 0;
    const otherTaxes = parseFloat(document.getElementById('techOtherTaxes')?.value) || 0;
    const ivaScope = document.getElementById('techIvaScope')?.value || 'all';

    const contingencyAmt = subtotal * (contingency / 100);
    const marginAmt = subtotal * (margin / 100);
    const discountAmt = (subtotal + contingencyAmt + marginAmt) * (discount / 100);
    const taxableBase = subtotal + contingencyAmt + marginAmt - discountAmt;

    let ivaBase = taxableBase;
    if (ivaScope === 'hours') {
        const hoursPortion = subtotal > 0 ? sumHours / subtotal : 1;
        ivaBase = taxableBase * hoursPortion;
    } else if (ivaScope === 'none') {
        ivaBase = 0;
    }
    const ivaAmt = ivaBase * (iva / 100);
    const otherTaxesAmt = taxableBase * (otherTaxes / 100);
    const grand = taxableBase + ivaAmt + otherTaxesAmt;

    const setText = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = formatCurrency(val); };
    setText('techTotalHours', sumHours);
    setText('techTotalInfra', sumInfra);
    setText('techTotalLicenses', sumLicenses);
    setText('techTotalCredentials', sumCredentials);
    setText('techTotalOthers', sumOthers);
    setText('techSubtotal', subtotal);
    setText('techContingencyAmt', contingencyAmt);
    setText('techMarginAmt', marginAmt);
    setText('techDiscountAmt', discountAmt);
    setText('techTaxableBase', taxableBase);
    setText('techIvaAmt', ivaAmt);
    setText('techOtherTaxesAmt', otherTaxesAmt);
    setText('techGrandTotal', grand);

    appState.tech._totals = {
        sumHours, sumInfra, sumLicenses, sumCredentials, sumOthers,
        subtotal, contingencyAmt, marginAmt, discountAmt, taxableBase,
        ivaAmt, otherTaxesAmt, grand,
        contingencyPct: contingency, marginPct: margin, discountPct: discount,
        ivaPct: iva, otherTaxesPct: otherTaxes, ivaScope,
    };
}

async function downloadTechQuote() {
    try {
        const form = document.getElementById('documentForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        if (!appState.tech.hours.length && !appState.tech.infra.length && !appState.tech.licenses.length && !appState.tech.credentials.length && !appState.tech.others.length) {
            showMessage('Agregá al menos un ítem (horas, infra, licencias, credenciales u otros)', 'error');
            return;
        }

        showLoading(true);

        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => { data[key] = value; });

        const m = String(data.quoteNumber || '').match(/^CTZ-(\d{4})-(\d+)$/);
        if (m) {
            const counterKey = 'techQuoteCounter_' + m[1];
            const used = parseInt(m[2], 10);
            if (used > parseInt(localStorage.getItem(counterKey) || '0', 10)) {
                localStorage.setItem(counterKey, String(used));
            }
        }

        updateTechTotals();
        const totals = appState.tech._totals || {};

        const items = [
            ...appState.tech.hours.map(h => ({
                description: `${h.role} (${h.seniority}) — ${h.hours} hs`,
                quantity: h.hours, price: h.rate, _kind: 'hours', _meta: h
            })),
            ...appState.tech.infra.map(x => ({
                description: `${x.concept} — ${x.model}`,
                quantity: x.periods, price: x.cost, _kind: 'infra', _meta: x
            })),
            ...appState.tech.licenses.map(x => ({
                description: `${x.service} — ${x.model}`,
                quantity: x.periods, price: x.cost, _kind: 'license', _meta: x
            })),
            ...appState.tech.credentials.map(x => ({
                description: x.concept, quantity: 1, price: x.cost, _kind: 'credential', _meta: x
            })),
            ...appState.tech.others.map(x => ({
                description: `${x.description}${x.unit ? ' (' + x.unit + ')' : ''}`,
                quantity: x.quantity, price: x.price, _kind: 'other', _meta: x
            })),
        ];

        const techPayload = {
            ...data,
            items,
            currency: data.currency || 'USD',
            _docKind: 'quote-tech',
            techDetails: {
                hours: appState.tech.hours,
                infra: appState.tech.infra,
                licenses: appState.tech.licenses,
                credentials: appState.tech.credentials,
                others: appState.tech.others,
                totals,
                projectName: data.projectName,
                projectType: data.projectType,
                projectMethodology: data.projectMethodology,
                projectScope: data.projectScope,
                projectStack: data.projectStack,
                projectDeliverables: data.projectDeliverables,
                projectExclusions: data.projectExclusions,
                projectAssumptions: data.projectAssumptions,
                projectDurationWeeks: data.projectDurationWeeks,
                projectStartDate: data.projectStartDate,
                paymentScheme: data.paymentScheme,
                warrantyDays: data.warrantyDays,
                supportDays: data.supportDays,
                bankDetails: data.bankDetails,
                legalTerms: data.legalTerms,
                quoteValidUntil: data.quoteValidUntil,
                clientContactPerson: data.clientContactPerson,
                clientIVACondition: data.clientIVACondition,
                exchangeRate: data.exchangeRate,
            },
            ivaRate: (parseFloat(data.ivaPct) || 0) / 100,
            otherTaxes: totals.otherTaxesAmt || 0,
            discount: totals.discountAmt || 0,
            _precomputedTotal: totals.grand,
        };

        const assets = {};
        try {
            const logoResp = await fetch('/Logo%20Arman%20Solutions.png');
            if (logoResp.ok) {
                const logoBlob = await logoResp.blob();
                const logoDataUrl = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(r.result);
                    r.onerror = reject;
                    r.readAsDataURL(logoBlob);
                });
                assets.logo = logoDataUrl;
            }
        } catch (_) { /* fallback al SVG del template */ }

        const payload = { type: 'quote-tech', data: techPayload, assets };

        const response = await fetch('/api/documents/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error: ${response.statusText} - ${errorText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const clientName = String(data.clientName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
        const docNumber = String(data.quoteNumber || Date.now()).replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `Cotizacion_${clientName}_${docNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        showMessage('PDF descargado correctamente', 'success');

        const numEl = document.querySelector('input[name="quoteNumber"]');
        if (numEl) numEl.value = peekTechQuoteNumber();
    } catch (error) {
        console.error('Error:', error);
        showMessage(`Error al generar la cotización: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// =====                  ADMIN IA                         =====
// ============================================================
//
// Sube un comprobante (PDF o imagen) y muestra los campos extraídos
// en el ORDEN del libro IVA / "Mis Comprobantes" de AFIP.
// El backend prioriza QR de AFIP, luego texto del PDF, luego OCR.

const adminIaState = {
    schema: null,
    fields: null,
    raw: null,
    file: null,
    templates: [],
    selectedTemplateId: 'auto',  // 'auto' | 'none' | <number>
    selectedTipoDoc: '',          // '' = autodetectar
    catalogo: null,
};

async function renderAdminIaTab() {
    const container = document.getElementById('content');
    container.innerHTML = `
        <div class="message" id="message"></div>

        <div class="form-section">
            <h3 class="section-title">Pre-configuración (opcional)</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
                Indicá el template del proveedor y el tipo de comprobante para mejorar la extracción.
                Si dejás "Auto-detectar" en ambos, el sistema intenta identificarlo solo.
            </p>
            <div class="form-grid">
                <div class="form-group">
                    <label>Template / Proveedor</label>
                    <select id="iaTemplateSelect" onchange="adminIaState.selectedTemplateId = this.value;"></select>
                </div>
                <div class="form-group">
                    <label>Tipo de Comprobante</label>
                    <select id="iaTipoDocSelect" onchange="adminIaState.selectedTipoDoc = this.value;">
                        <option value="">Auto-detectar</option>
                    </select>
                </div>
            </div>
            <div style="margin-top: 10px;">
                <button type="button" class="btn btn-secondary" onclick="adminIaOpenTemplatesManager()" style="font-size: 13px; padding: 8px 14px;">
                    Gestionar templates
                </button>
                <button type="button" class="btn btn-secondary" onclick="adminIaToggleCatalogo()" style="font-size: 13px; padding: 8px 14px; margin-left: 8px;">
                    Ver catálogo ARCA
                </button>
            </div>
        </div>

        <div id="iaCatalogoBox" style="display:none;"></div>

        <div class="form-section">
            <h3 class="section-title">Cargar Comprobante</h3>
            <div id="iaDropzone" class="ia-dropzone" onclick="document.getElementById('iaFileInput').click()">
                <div><strong>Arrastrá un comprobante</strong> o hacé click para seleccionarlo</div>
                <div class="hint">Acepta PDF, JPG, PNG, WEBP - Factura A/B/C/E/M, NC, ND, Recibo, Tique, etc. (máx. 25 MB)</div>
                <input type="file" id="iaFileInput" accept="application/pdf,image/*" style="display:none;">
            </div>
            <div id="iaSelected" style="margin-top: 10px; font-size: 13px; color: #555;"></div>
            <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center;">
                <button type="button" class="btn btn-primary" id="iaExtractBtn" onclick="adminIaExtract()" disabled>Extraer Datos</button>
                <button type="button" class="btn btn-secondary" id="iaResetBtn" onclick="adminIaReset()" style="display:none;">Cargar Otro</button>
                <span id="iaStatus" style="font-size: 13px; color: #666;"></span>
            </div>
        </div>

        <div id="iaLoading" class="loading"><div class="spinner"></div><p>Procesando comprobante (QR -> texto PDF -> OCR)</p></div>

        <div id="iaResults" style="display:none;"></div>

        <div id="iaTemplatesModal" class="modal" style="display:none;">
            <div class="modal-content" style="max-width: 760px;">
                <div class="modal-header">
                    <h2>Gestionar Templates</h2>
                    <button class="modal-close" onclick="adminIaCloseTemplatesManager()">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 60vh; overflow-y: auto;" id="iaTemplatesList"></div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="adminIaCloseTemplatesManager()">Cerrar</button>
                </div>
            </div>
        </div>
    `;

    // Wire dropzone
    const dz = document.getElementById('iaDropzone');
    const input = document.getElementById('iaFileInput');
    ['dragenter', 'dragover'].forEach(evt => {
        dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
        dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) adminIaSetFile(f);
    });
    input.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) adminIaSetFile(f);
    });

    // Cargar schema, catálogo y templates en paralelo.
    await Promise.all([
        adminIaLoadSchema(),
        adminIaLoadCatalogo(),
        adminIaLoadTemplates(),
    ]);
}

async function adminIaLoadSchema() {
    if (adminIaState.schema) return;
    try {
        const r = await fetch('/api/admin-ia/schema');
        if (r.ok) {
            const j = await r.json();
            adminIaState.schema = j.schema;
        }
    } catch (_) { /* el response del extract trae el schema igual */ }
}

async function adminIaLoadCatalogo() {
    try {
        const r = await fetch('/api/admin-ia/catalogo-arca');
        if (r.ok) adminIaState.catalogo = await r.json();
    } catch (_) {}
    // Pueblar el select de Tipo de Comprobante.
    const sel = document.getElementById('iaTipoDocSelect');
    if (sel && adminIaState.catalogo && Array.isArray(adminIaState.catalogo.tiposComprobante)) {
        const cats = adminIaState.catalogo.tiposComprobante;
        sel.innerHTML = '<option value="">Auto-detectar</option>' +
            cats.map(t => `<option value="${escapeHtml(t.nombre)}">${escapeHtml(t.codigo)} - ${escapeHtml(t.nombre)}</option>`).join('');
        sel.value = adminIaState.selectedTipoDoc || '';
    }
}

async function adminIaLoadTemplates() {
    try {
        const r = await fetch('/api/admin-ia/templates');
        if (r.ok) {
            const j = await r.json();
            adminIaState.templates = Array.isArray(j.templates) ? j.templates : [];
        }
    } catch (_) { adminIaState.templates = []; }
    const sel = document.getElementById('iaTemplateSelect');
    if (sel) {
        const factory = adminIaState.templates.filter(t => t.is_factory);
        const custom = adminIaState.templates.filter(t => !t.is_factory);
        let html = '<option value="auto">Auto-detectar</option>';
        html += '<option value="none">No aplicar template (genérico puro)</option>';
        if (factory.length) {
            html += '<optgroup label="Templates de fábrica">';
            html += factory.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
            html += '</optgroup>';
        }
        if (custom.length) {
            html += '<optgroup label="Mis templates">';
            html += custom.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}${t.proveedor_cuit ? ' (' + escapeHtml(t.proveedor_cuit) + ')' : ''}</option>`).join('');
            html += '</optgroup>';
        }
        sel.innerHTML = html;
        sel.value = adminIaState.selectedTemplateId || 'auto';
    }
}

function adminIaSetFile(file) {
    if (file.size > 25 * 1024 * 1024) { showMessage('El archivo supera 25 MB', 'error'); return; }
    adminIaState.file = file;
    document.getElementById('iaSelected').innerHTML =
        `<strong>${escapeHtml(file.name)}</strong> · ${(file.size / 1024).toFixed(1)} KB · ${escapeHtml(file.type || 'desconocido')}`;
    document.getElementById('iaExtractBtn').disabled = false;
    document.getElementById('iaStatus').textContent = '';
}

function adminIaReset() {
    adminIaState.file = null;
    adminIaState.fields = null;
    adminIaState.raw = null;
    document.getElementById('iaSelected').innerHTML = '';
    document.getElementById('iaResults').style.display = 'none';
    document.getElementById('iaExtractBtn').disabled = true;
    document.getElementById('iaResetBtn').style.display = 'none';
    document.getElementById('iaStatus').textContent = '';
    document.getElementById('iaFileInput').value = '';
}

async function adminIaExtract() {
    const file = adminIaState.file;
    if (!file) { showMessage('Cargá un comprobante primero', 'error'); return; }

    const btn = document.getElementById('iaExtractBtn');
    btn.disabled = true;
    document.getElementById('iaLoading').classList.add('active');
    document.getElementById('iaStatus').textContent = 'Leyendo archivo…';

    try {
        const fileData = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });

        document.getElementById('iaStatus').textContent = 'Enviando al motor…';
        const resp = await fetch('/api/admin-ia/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: file.name,
                fileData,
                mimeType: file.type,
                templateId: adminIaState.selectedTemplateId || 'auto',
                tipoDocOverride: adminIaState.selectedTipoDoc || null,
            }),
        });
        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${t}`);
        }
        const data = await resp.json();
        adminIaState.fields = data.fields;
        adminIaState.raw = data;
        if (data.schema && data.schema.length) adminIaState.schema = data.schema;

        renderAdminIaResults(data);
        document.getElementById('iaStatus').textContent = `Procesado en ${data.ms} ms`;
        document.getElementById('iaResetBtn').style.display = 'inline-flex';
    } catch (err) {
        console.error(err);
        showMessage(`Error procesando comprobante: ${err.message}`, 'error');
        btn.disabled = false;
    } finally {
        document.getElementById('iaLoading').classList.remove('active');
    }
}

function renderAdminIaResults(data) {
    const schema = adminIaState.schema || data.schema || [];
    const fields = data.fields || {};
    const moneda = fields.moneda || 'ARS';

    // Agrupado lógico (manteniendo el ORDEN de schema dentro de cada grupo)
    const groupOf = (key) => {
        if (['fecha', 'tipo', 'puntoVenta', 'numeroDesde', 'numeroHasta', 'codAutorizacion'].includes(key)) return 'Comprobante';
        if (['tipoDocEmisor', 'nroDocEmisor', 'denominacionEmisor'].includes(key)) return 'Emisor';
        if (['tipoDocReceptor', 'nroDocReceptor', 'denominacionReceptor'].includes(key)) return 'Receptor';
        if (['tipoCambio', 'moneda'].includes(key)) return 'Moneda';
        if (key.startsWith('netoGravIva') || key.startsWith('iva')) return 'Discriminación de IVA';
        return 'Totales';
    };

    const order = ['Comprobante', 'Emisor', 'Receptor', 'Moneda', 'Discriminación de IVA', 'Totales'];
    const groups = {};
    schema.forEach(f => {
        const g = groupOf(f.key);
        if (!groups[g]) groups[g] = [];
        groups[g].push(f);
    });

    const fmtNum = (v) => {
        if (v == null || v === '') return '';
        const n = Number(v);
        if (isNaN(n)) return String(v);
        return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const buildField = (f) => {
        const v = fields[f.key];
        const isNumeric = f.type === 'number';
        const display = isNumeric ? fmtNum(v) : (v == null ? '' : v);
        const empty = (v == null || v === '');
        const cls = `ia-field ${empty ? 'empty' : ''}`;
        return `
            <div class="${cls}">
                <span class="lbl">${escapeHtml(f.label)}</span>
                <input type="text" class="${isNumeric ? 'numeric' : ''}" data-key="${f.key}" data-type="${f.type}" value="${escapeHtml(display)}" placeholder="—">
            </div>`;
    };

    const conf = (data.confidence || 'low').toLowerCase();
    const sources = (data.sources || []).map(s => `<span class="ia-pill src">${escapeHtml(s)}</span>`).join('');
    const templatePill = data.template
        ? `<span class="ia-pill src" title="Template aplicado">Template: ${escapeHtml(data.template.nombre)}${data.templateMatchedBy ? ' [' + escapeHtml(data.templateMatchedBy) + ']' : ''}</span>`
        : '';

    const groupHtml = order.map(g => {
        if (!groups[g] || !groups[g].length) return '';
        return `<div class="ia-section-head">${escapeHtml(g)}</div>
            <div class="ia-results-grid">${groups[g].map(buildField).join('')}</div>`;
    }).join('');

    const totalDisplay = fields.impTotal != null ? `${moneda} ${fmtNum(fields.impTotal)}` : '—';

    const out = `
        <div class="form-section">
            <h3 class="section-title" style="display:flex; align-items:center; gap:10px; flex-wrap: wrap;">
                Datos extraídos
                <span class="ia-pill ${conf}">Confianza: ${conf}</span>
                ${sources}
                ${templatePill}
            </h3>
            ${groupHtml}

            <div class="ia-summary-bar">
                <div>
                    <div class="label">Importe Total</div>
                    <div class="total">${escapeHtml(totalDisplay)}</div>
                </div>
                <div style="text-align: right;">
                    <div class="label">${escapeHtml(fields.tipo || 'Comprobante')}</div>
                    <div style="font-size: 14px; opacity: 0.95;">${escapeHtml((fields.puntoVenta || '') + (fields.numeroDesde ? ' - ' + fields.numeroDesde : ''))}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 14px;">
                <button type="button" class="btn btn-secondary" onclick="adminIaCopyRow()">Copiar fila (TSV)</button>
                <button type="button" class="btn btn-primary" onclick="adminIaDownloadCsv()">Descargar CSV (1 fila)</button>
                <button type="button" class="btn btn-secondary" onclick="adminIaSaveAsTemplate()">Guardar como template del proveedor</button>
            </div>
            <p style="font-size: 11px; color: #888; margin-top: 8px;">
                Próximamente: enviar a Google Sheets en un click. Por ahora podés copiar la fila o exportar CSV con el orden exacto de columnas del libro IVA.
            </p>
        </div>

        ${data.qrPayload ? `
        <div class="form-section">
            <h3 class="section-title">QR AFIP (payload firmado)</h3>
            <div class="ia-raw-block">${escapeHtml(JSON.stringify(data.qrPayload, null, 2))}</div>
        </div>
        ` : ''}

        ${data.rawTextSnippet ? `
        <div class="form-section">
            <h3 class="section-title">Texto leído del comprobante (debug)</h3>
            <div class="ia-raw-block">${escapeHtml(data.rawTextSnippet)}</div>
        </div>
        ` : ''}
    `;

    const wrap = document.getElementById('iaResults');
    wrap.innerHTML = out;
    wrap.style.display = 'block';

    // Permite editar in-place: las correcciones se reflejan en adminIaState.fields
    wrap.querySelectorAll('input[data-key]').forEach(inp => {
        inp.addEventListener('change', () => {
            const k = inp.dataset.key;
            const t = inp.dataset.type;
            let v = inp.value.trim();
            if (t === 'number') {
                const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
                v = isNaN(n) ? null : n;
            } else if (v === '') {
                v = null;
            }
            adminIaState.fields[k] = v;
        });
    });
}

// Devuelve la fila actual en el orden del schema
function adminIaCurrentRow() {
    const schema = adminIaState.schema || [];
    const f = adminIaState.fields || {};
    return schema.map(s => {
        const v = f[s.key];
        if (v == null) return '';
        if (s.type === 'number') return Number(v);
        return String(v);
    });
}

function adminIaCopyRow() {
    const row = adminIaCurrentRow();
    const tsv = row.map(v => (typeof v === 'number' ? String(v).replace('.', ',') : v)).join('\t');
    navigator.clipboard.writeText(tsv).then(() => {
        showMessage('Fila copiada al portapapeles. Pegala directo en Google Sheets.', 'success');
    });
}

function adminIaDownloadCsv() {
    const schema = adminIaState.schema || [];
    const headers = schema.map(s => s.label);
    const row = adminIaCurrentRow();
    const csvEscape = (v) => {
        const s = (typeof v === 'number') ? String(v).replace('.', ',') : (v == null ? '' : String(v));
        return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(csvEscape).join(';'), row.map(csvEscape).join(';')].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    a.download = `comprobante_${stamp}.csv`;
    document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
    showMessage('CSV descargado', 'success');
}

// ─── Guardar como template del proveedor ─────────────────────────────
async function adminIaSaveAsTemplate() {
    const f = adminIaState.fields || {};
    if (!f.nroDocEmisor && !f.denominacionEmisor) {
        showMessage('Antes de guardar el template, asegurate de tener al menos el CUIT o el nombre del emisor en los campos.', 'error');
        return;
    }
    const nombreSugerido = f.denominacionEmisor
        ? f.denominacionEmisor + (f.tipo ? ' - ' + f.tipo : '')
        : 'Proveedor ' + (f.nroDocEmisor || '');
    const nombre = prompt('Nombre del template:', nombreSugerido);
    if (!nombre) return;

    // Sugerimos fingerprints a partir del rawText: hasta 3 strings de 12-40 chars
    // que parezcan únicos del proveedor (encabezados, razón social, domicilio).
    const raw = (adminIaState.raw && adminIaState.raw.rawTextSnippet) || '';
    const candidates = [];
    if (f.denominacionEmisor) candidates.push(f.denominacionEmisor);
    raw.split(/\r?\n/).slice(0, 30).forEach(ln => {
        const t = ln.trim();
        if (t.length < 8 || t.length > 60) return;
        if (/^\d/.test(t)) return;
        if (/[:$€]/.test(t)) return;
        if (/^(fecha|cuit|domicilio|razón|razon|condición|condicion|punto|comp|cae|importe|subtotal)/i.test(t)) return;
        if (candidates.length < 5 && !candidates.includes(t)) candidates.push(t);
    });

    const fingerprintsRaw = prompt(
        'Fingerprints (uno por línea, son los textos que identifican a este proveedor en sus facturas):',
        candidates.slice(0, 4).join('\n')
    );
    if (fingerprintsRaw === null) return;
    const fingerprints = fingerprintsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    try {
        const r = await fetch('/api/admin-ia/learn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre,
                proveedorCuit: f.nroDocEmisor || null,
                tipoDocDefault: f.tipo || null,
                fingerprints,
                groundTruth: f,
                notas: 'Generado desde Admin IA tras corrección manual.',
            }),
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error(t || 'Error desconocido');
        }
        const j = await r.json();
        showMessage(`Template "${j.nombre}" guardado. Se aplicará automáticamente a futuros comprobantes de este proveedor.`, 'success');
        await adminIaLoadTemplates();
    } catch (err) {
        showMessage('Error guardando template: ' + err.message, 'error');
    }
}

// ─── Gestor de templates (modal) ─────────────────────────────────────
async function adminIaOpenTemplatesManager() {
    const modal = document.getElementById('iaTemplatesModal');
    if (!modal) return;
    modal.style.display = 'block';
    await adminIaLoadTemplates();
    adminIaRenderTemplatesList();
}

function adminIaCloseTemplatesManager() {
    const modal = document.getElementById('iaTemplatesModal');
    if (modal) modal.style.display = 'none';
}

function adminIaRenderTemplatesList() {
    const el = document.getElementById('iaTemplatesList');
    if (!el) return;
    if (!adminIaState.templates.length) {
        el.innerHTML = '<p style="color: #999; text-align: center;">No hay templates cargados.</p>';
        return;
    }
    el.innerHTML = adminIaState.templates.map(t => {
        const fps = Array.isArray(t.fingerprints) ? t.fingerprints : [];
        const fixed = t.fixed_fields && typeof t.fixed_fields === 'object' ? t.fixed_fields : {};
        const fixedKeys = Object.keys(fixed);
        return `
            <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px; margin-bottom: 10px; background: #fafafa;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 700; color: #7B2CBF; font-size: 14px;">${escapeHtml(t.nombre)}</div>
                        <div style="font-size: 12px; color: #555; margin-top: 2px;">
                            ${t.is_factory ? '<span class="ia-pill src">Fábrica</span>' : '<span class="ia-pill src">Custom</span>'}
                            ${t.proveedor_cuit ? '· CUIT ' + escapeHtml(t.proveedor_cuit) : ''}
                            ${t.tipo_doc_default ? '· ' + escapeHtml(t.tipo_doc_default) : ''}
                            · v${t.version}
                        </div>
                        ${t.notas ? `<div style="font-size: 11px; color: #777; margin-top: 6px; font-style: italic;">${escapeHtml(t.notas)}</div>` : ''}
                        ${fps.length ? `<div style="font-size: 11px; color: #555; margin-top: 6px;"><strong>Fingerprints:</strong> ${fps.map(f => `<code style="background:#f0e6ff; padding:1px 4px; border-radius:3px;">${escapeHtml(f)}</code>`).join(' ')}</div>` : ''}
                        ${fixedKeys.length ? `<div style="font-size: 11px; color: #555; margin-top: 4px;"><strong>Fixed:</strong> ${fixedKeys.map(k => k + '=' + JSON.stringify(fixed[k])).join(', ')}</div>` : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 10px;" onclick="adminIaCloneTemplate(${t.id})">Clonar</button>
                        ${t.is_factory ? '' : `<button class="btn btn-secondary" style="font-size: 11px; padding: 6px 10px; color: #c0392b; border-color: #c0392b;" onclick="adminIaDeleteTemplate(${t.id})">Eliminar</button>`}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function adminIaCloneTemplate(id) {
    try {
        const r = await fetch(`/api/admin-ia/templates/${id}/clone`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
        if (!r.ok) throw new Error(await r.text());
        showMessage('Template clonado. Editalo desde la lista.', 'success');
        await adminIaLoadTemplates();
        adminIaRenderTemplatesList();
    } catch (err) { showMessage('Error: ' + err.message, 'error'); }
}

async function adminIaDeleteTemplate(id) {
    if (!confirm('¿Eliminar este template?')) return;
    try {
        const r = await fetch(`/api/admin-ia/templates/${id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await r.text());
        showMessage('Template eliminado.', 'success');
        await adminIaLoadTemplates();
        adminIaRenderTemplatesList();
    } catch (err) { showMessage('Error: ' + err.message, 'error'); }
}

// ─── Catálogo ARCA viewer ─────────────────────────────────────────────
function adminIaToggleCatalogo() {
    const box = document.getElementById('iaCatalogoBox');
    if (!box) return;
    if (box.style.display === 'none' || !box.style.display) {
        adminIaRenderCatalogo();
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
}

function adminIaRenderCatalogo() {
    const box = document.getElementById('iaCatalogoBox');
    if (!box) return;
    const c = adminIaState.catalogo;
    if (!c) { box.innerHTML = '<p>Catálogo no disponible</p>'; return; }

    const tr = (cells, tag = 'td') => '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    const table = (headers, rows) =>
        `<table style="width:100%; border-collapse: collapse; font-size: 12px;">
            <thead style="background: #efe6ff; color: #7B2CBF; text-transform: uppercase; font-size: 11px;">
                ${tr(headers, 'th')}
            </thead>
            <tbody>${rows.map(r => tr(r)).join('')}</tbody>
        </table>`;

    const tipos = (c.tiposComprobante || []).map(t => [escapeHtml(t.codigo), escapeHtml(t.nombre), escapeHtml(t.emisor || ''), escapeHtml(t.receptor || '')]);
    const docs  = (c.tiposDocumento || []).map(t => [t.codigo, escapeHtml(t.nombre)]);
    const mons  = (c.monedas || []).map(m => [escapeHtml(m.codigo), escapeHtml(m.iso || ''), escapeHtml(m.nombre || '')]);
    const aliq  = (c.alicuotasIVA || []).map(a => [a.codigo, a.porcentaje + '%', escapeHtml(a.nombre || '')]);

    box.innerHTML = `
        <div class="form-section" style="border-left-color: #2980b9;">
            <h3 class="section-title" style="color: #2980b9;">
                Catálogo ARCA
                <span class="ia-pill src" style="background:#d6eaf8; color:#1a5276;">Versión ${escapeHtml(c.version || '?')}</span>
            </h3>
            <p style="font-size: 12px; color: #555;">
                <strong>Organismo:</strong> ${escapeHtml(c.organismo || '')}<br>
                <strong>Última revisión:</strong> ${escapeHtml(c.ultimaRevision || c.version || '')}<br>
                <strong>Fuentes:</strong>
                <ul style="margin: 6px 0 6px 18px; font-size: 11px;">
                    ${(c.fuentes || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}
                </ul>
            </p>

            <h4 style="font-size: 13px; color: #7B2CBF; margin-top: 14px;">Tipos de Comprobante</h4>
            ${table(['Código', 'Nombre', 'Emisor típico', 'Receptor'], tipos)}

            <h4 style="font-size: 13px; color: #7B2CBF; margin-top: 14px;">Tipos de Documento</h4>
            ${table(['Código', 'Nombre'], docs)}

            <h4 style="font-size: 13px; color: #7B2CBF; margin-top: 14px;">Monedas</h4>
            ${table(['Cód. ARCA', 'ISO', 'Nombre'], mons)}

            <h4 style="font-size: 13px; color: #7B2CBF; margin-top: 14px;">Alícuotas IVA</h4>
            ${table(['Código', 'Porcentaje', 'Nombre'], aliq)}

            ${c.notasRegulatorias && c.notasRegulatorias.length ? `
                <h4 style="font-size: 13px; color: #7B2CBF; margin-top: 14px;">Notas regulatorias</h4>
                <ul style="font-size: 11px; color: #555; margin-left: 18px;">
                    ${c.notasRegulatorias.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
                </ul>
            ` : ''}

            <p style="font-size: 11px; color: #888; margin-top: 16px; font-style: italic;">
                Esta información se actualiza manualmente. Si una RG nueva o un cambio fiscal afecta los campos, hay que regenerar este catálogo.
            </p>
        </div>
    `;
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