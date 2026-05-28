// Multi-vertical schema bootstrap.
// Cada vertical vive en un schema Postgres independiente: IDs propios,
// secuencias propias, aislamiento lógico. Comparten cluster y conexión.

const db = require('./db');

const VERTICALS = ['tech', 'paybridge', 'admin_core'];

const COMMON_DOC_TABLES = (schema) => `
  CREATE SCHEMA IF NOT EXISTS ${schema};

  CREATE TABLE IF NOT EXISTS ${schema}.contactos (
    id              SERIAL PRIMARY KEY,
    global_customer_id UUID,
    nombre          VARCHAR(200) NOT NULL,
    razon_social    VARCHAR(200),
    cuit            VARCHAR(20),
    email           VARCHAR(200),
    telefono        VARCHAR(50),
    direccion       TEXT,
    ciudad          VARCHAR(120),
    pais            VARCHAR(80) DEFAULT 'Argentina',
    condicion_iva   VARCHAR(60),
    estado          VARCHAR(40) DEFAULT 'nuevo',
    rol             VARCHAR(40) DEFAULT 'lead',
    etiquetas       JSONB DEFAULT '[]'::jsonb,
    notas           TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE ${schema}.contactos ADD COLUMN IF NOT EXISTS global_customer_id UUID;
  CREATE INDEX IF NOT EXISTS idx_${schema}_contactos_email ON ${schema}.contactos(email);
  CREATE INDEX IF NOT EXISTS idx_${schema}_contactos_cuit  ON ${schema}.contactos(cuit);
  CREATE INDEX IF NOT EXISTS idx_${schema}_contactos_global ON ${schema}.contactos(global_customer_id);

  CREATE TABLE IF NOT EXISTS ${schema}.cotizaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER REFERENCES ${schema}.contactos(id) ON DELETE SET NULL,
    numero              VARCHAR(40) UNIQUE,
    seq                 INTEGER,
    estado              VARCHAR(20) DEFAULT 'borrador',
    moneda              VARCHAR(3) DEFAULT 'ARS',
    subtotal            NUMERIC(14,2) DEFAULT 0,
    iva                 NUMERIC(14,2) DEFAULT 0,
    total               NUMERIC(14,2) DEFAULT 0,
    validez_dias        INTEGER DEFAULT 15,
    detalle_categorias  JSONB,
    cliente_snapshot    JSONB,
    metadata            JSONB DEFAULT '{}'::jsonb,
    anulado_at          TIMESTAMPTZ,
    anulado_por         VARCHAR(80),
    motivo_anulacion    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ${schema}.cotizacion_items (
    id              SERIAL PRIMARY KEY,
    cotizacion_id   INTEGER NOT NULL REFERENCES ${schema}.cotizaciones(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    categoria       VARCHAR(60),
    cantidad        NUMERIC(12,3) DEFAULT 1,
    unidad          VARCHAR(40),
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0,
    metadata        JSONB DEFAULT '{}'::jsonb
  );

  CREATE TABLE IF NOT EXISTS ${schema}.facturas (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES ${schema}.contactos(id) ON DELETE SET NULL,
    numero          VARCHAR(40) UNIQUE,
    seq             INTEGER,
    tipo            VARCHAR(10) DEFAULT 'A',
    punto_venta     INTEGER DEFAULT 1,
    estado          VARCHAR(20) DEFAULT 'borrador',
    moneda          VARCHAR(3) DEFAULT 'ARS',
    subtotal        NUMERIC(14,2) DEFAULT 0,
    iva             NUMERIC(14,2) DEFAULT 0,
    total           NUMERIC(14,2) DEFAULT 0,
    cae             VARCHAR(20),
    cae_vencimiento DATE,
    cae_solicitado_at TIMESTAMPTZ,
    arca_response   JSONB,
    cliente_snapshot JSONB,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ${schema}.factura_items (
    id              SERIAL PRIMARY KEY,
    factura_id      INTEGER NOT NULL REFERENCES ${schema}.facturas(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(12,3) DEFAULT 1,
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ${schema}.recibos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES ${schema}.contactos(id) ON DELETE SET NULL,
    numero          VARCHAR(40) UNIQUE,
    seq             INTEGER,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(3) DEFAULT 'ARS',
    metodo          VARCHAR(40),
    concepto        TEXT,
    estado          VARCHAR(20) DEFAULT 'activo',
    cliente_snapshot JSONB,
    anulado_at      TIMESTAMPTZ,
    anulado_por     VARCHAR(80),
    motivo_anulacion TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ${schema}.pagos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES ${schema}.contactos(id) ON DELETE SET NULL,
    factura_id      INTEGER REFERENCES ${schema}.facturas(id) ON DELETE SET NULL,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(3) DEFAULT 'ARS',
    metodo          VARCHAR(40),
    referencia      VARCHAR(80),
    estado          VARCHAR(20) DEFAULT 'activo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ${schema}.notas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES ${schema}.contactos(id) ON DELETE CASCADE,
    contenido     TEXT NOT NULL,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_${schema}_notas_contacto ON ${schema}.notas(contacto_id);

  CREATE TABLE IF NOT EXISTS ${schema}.tareas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER REFERENCES ${schema}.contactos(id) ON DELETE CASCADE,
    titulo        VARCHAR(200) NOT NULL,
    descripcion   TEXT,
    estado        VARCHAR(20) DEFAULT 'pendiente',
    prioridad     VARCHAR(20) DEFAULT 'normal',
    asignado_a    VARCHAR(120),
    fecha_limite  DATE,
    completado_at TIMESTAMPTZ,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_${schema}_tareas_contacto ON ${schema}.tareas(contacto_id);
  CREATE INDEX IF NOT EXISTS idx_${schema}_tareas_estado   ON ${schema}.tareas(estado);

  CREATE TABLE IF NOT EXISTS ${schema}.oportunidades (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES ${schema}.contactos(id) ON DELETE CASCADE,
    titulo        VARCHAR(200) NOT NULL,
    descripcion   TEXT,
    valor_estim   NUMERIC(14,2),
    moneda        VARCHAR(3) DEFAULT 'USD',
    etapa         VARCHAR(40) DEFAULT 'descubrimiento',
    probabilidad  INTEGER DEFAULT 0,
    fecha_cierre  DATE,
    estado_oportunidad VARCHAR(20) DEFAULT 'abierta',
    vendedor      VARCHAR(120),
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_${schema}_opps_contacto ON ${schema}.oportunidades(contacto_id);

  CREATE TABLE IF NOT EXISTS ${schema}.timeline (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES ${schema}.contactos(id) ON DELETE CASCADE,
    tipo          VARCHAR(40) NOT NULL,
    titulo        VARCHAR(200),
    descripcion   TEXT,
    metadata      JSONB DEFAULT '{}'::jsonb,
    usuario       VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_${schema}_timeline_contacto ON ${schema}.timeline(contacto_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS ${schema}.audit_log (
    id          SERIAL PRIMARY KEY,
    tabla       VARCHAR(80),
    registro_id INTEGER,
    accion      VARCHAR(40),
    campo       VARCHAR(80),
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario     VARCHAR(80),
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const TECH_EXTRA = `
  CREATE TABLE IF NOT EXISTS tech.proyectos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
    nombre          VARCHAR(200) NOT NULL,
    tipo            VARCHAR(40) DEFAULT 'desarrollo',
    estado          VARCHAR(40) DEFAULT 'descubrimiento',
    modalidad       VARCHAR(40) DEFAULT 'fixed_price',
    hourly_rate     NUMERIC(12,2),
    moneda          VARCHAR(3) DEFAULT 'USD',
    presupuesto     NUMERIC(14,2),
    fecha_inicio    DATE,
    fecha_fin_estim DATE,
    repo_url        TEXT,
    stack           JSONB DEFAULT '[]'::jsonb,
    descripcion     TEXT,
    nda_firmado     BOOLEAN DEFAULT FALSE,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tech.hitos (
    id          SERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES tech.proyectos(id) ON DELETE CASCADE,
    titulo      VARCHAR(200) NOT NULL,
    descripcion TEXT,
    monto       NUMERIC(14,2),
    moneda      VARCHAR(3),
    fecha_objetivo DATE,
    fecha_entrega  DATE,
    estado      VARCHAR(30) DEFAULT 'pendiente',
    orden       INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tech.time_entries (
    id          SERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES tech.proyectos(id) ON DELETE CASCADE,
    fecha       DATE NOT NULL,
    horas       NUMERIC(6,2) NOT NULL,
    descripcion TEXT,
    facturable  BOOLEAN DEFAULT TRUE,
    facturado   BOOLEAN DEFAULT FALSE,
    usuario     VARCHAR(80),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tech.retainers (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
    nombre          VARCHAR(200),
    horas_mes       NUMERIC(6,2),
    monto_mes       NUMERIC(14,2),
    moneda          VARCHAR(3) DEFAULT 'USD',
    inicio          DATE,
    fin             DATE,
    estado          VARCHAR(20) DEFAULT 'activo'
  );
`;

const PAYBRIDGE_EXTRA = `
  ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_alias VARCHAR(120);
  ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_email VARCHAR(200);
  ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_estado VARCHAR(40) DEFAULT 'sin_onboardear';
  ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_onboarding_at TIMESTAMPTZ;
  ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_notas TEXT;

  CREATE TABLE IF NOT EXISTS paybridge.monedas (
    code        VARCHAR(8) PRIMARY KEY,
    nombre      VARCHAR(80) NOT NULL,
    simbolo     VARCHAR(8),
    es_cripto   BOOLEAN DEFAULT FALSE,
    activa      BOOLEAN DEFAULT TRUE
  );

  CREATE TABLE IF NOT EXISTS paybridge.fee_rules (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120) NOT NULL,
    moneda          VARCHAR(8) REFERENCES paybridge.monedas(code),
    fee_pct         NUMERIC(6,3) DEFAULT 0,
    fee_fijo        NUMERIC(14,2) DEFAULT 0,
    minimo          NUMERIC(14,2),
    maximo          NUMERIC(14,2),
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS paybridge.payment_links (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
    slug            VARCHAR(40) UNIQUE NOT NULL,
    descripcion     TEXT,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(8) NOT NULL REFERENCES paybridge.monedas(code),
    fee_rule_id     INTEGER REFERENCES paybridge.fee_rules(id),
    fee_calculado   NUMERIC(14,2) DEFAULT 0,
    monto_neto      NUMERIC(14,2) DEFAULT 0,
    estado          VARCHAR(20) DEFAULT 'activo',
    expira_at       TIMESTAMPTZ,
    multi_uso       BOOLEAN DEFAULT FALSE,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_paybridge_links_estado ON paybridge.payment_links(estado);

  CREATE TABLE IF NOT EXISTS paybridge.transactions (
    id              SERIAL PRIMARY KEY,
    payment_link_id INTEGER REFERENCES paybridge.payment_links(id) ON DELETE SET NULL,
    contacto_id     INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
    external_ref    VARCHAR(120),
    monto_bruto     NUMERIC(14,2) NOT NULL,
    fee             NUMERIC(14,2) DEFAULT 0,
    monto_neto      NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(8) NOT NULL,
    estado          VARCHAR(20) DEFAULT 'pendiente',
    payer_email     VARCHAR(200),
    payer_nombre    VARCHAR(200),
    raw_payload     JSONB,
    completado_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_paybridge_tx_estado ON paybridge.transactions(estado);
  CREATE INDEX IF NOT EXISTS idx_paybridge_tx_link ON paybridge.transactions(payment_link_id);

  INSERT INTO paybridge.monedas (code, nombre, simbolo, es_cripto) VALUES
    ('ARS', 'Peso Argentino', '$', FALSE),
    ('USD', 'Dólar Estadounidense', 'US$', FALSE),
    ('EUR', 'Euro', '€', FALSE),
    ('BRL', 'Real Brasileño', 'R$', FALSE),
    ('GBP', 'Libra Esterlina', '£', FALSE),
    ('CLP', 'Peso Chileno', 'CLP$', FALSE),
    ('UYU', 'Peso Uruguayo', '$U', FALSE),
    ('USDT', 'Tether', '₮', TRUE),
    ('USDC', 'USD Coin', 'USDC', TRUE),
    ('BTC', 'Bitcoin', '₿', TRUE)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO paybridge.fee_rules (nombre, moneda, fee_pct, fee_fijo) VALUES
    ('Default ARS', 'ARS', 3.5, 0),
    ('Default USD', 'USD', 2.9, 0.30),
    ('Default Cripto', 'USDT', 1.0, 0)
  ON CONFLICT DO NOTHING;
`;

const ADMIN_EXTRA = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS admin_core.customers_global (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(200) NOT NULL,
    razon_social    VARCHAR(200),
    cuit            VARCHAR(20),
    email           VARCHAR(200),
    telefono        VARCHAR(50),
    pais            VARCHAR(80),
    verticales      JSONB DEFAULT '[]'::jsonb,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_cg_email ON admin_core.customers_global(email);
  CREATE INDEX IF NOT EXISTS idx_cg_cuit  ON admin_core.customers_global(cuit);

  CREATE TABLE IF NOT EXISTS admin_core.users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(200) UNIQUE NOT NULL,
    nombre          VARCHAR(200),
    password_hash   TEXT,
    rol             VARCHAR(40) DEFAULT 'operador',
    verticales      JSONB DEFAULT '["tech","travel","paybridge"]'::jsonb,
    activo          BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS admin_core.tenants (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(40) UNIQUE NOT NULL,
    nombre      VARCHAR(200) NOT NULL,
    schema_name VARCHAR(40) NOT NULL,
    activo      BOOLEAN DEFAULT TRUE,
    config      JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS admin_core.audit_global (
    id          SERIAL PRIMARY KEY,
    vertical    VARCHAR(40),
    usuario     VARCHAR(120),
    accion      VARCHAR(80),
    recurso     VARCHAR(80),
    recurso_id  VARCHAR(80),
    payload     JSONB,
    ip          VARCHAR(60),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_audit_vertical ON admin_core.audit_global(vertical, created_at DESC);

  CREATE TABLE IF NOT EXISTS admin_core.ia_sessions (
    id          SERIAL PRIMARY KEY,
    usuario     VARCHAR(120),
    titulo      VARCHAR(200),
    vertical    VARCHAR(40),
    contexto    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS admin_core.ia_messages (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES admin_core.ia_sessions(id) ON DELETE CASCADE,
    rol         VARCHAR(20) NOT NULL,
    contenido   TEXT NOT NULL,
    tokens_in   INTEGER,
    tokens_out  INTEGER,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_ia_msg_session ON admin_core.ia_messages(session_id, created_at);

  CREATE TABLE IF NOT EXISTS admin_core.ia_prompts (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(80) UNIQUE NOT NULL,
    titulo      VARCHAR(200) NOT NULL,
    prompt      TEXT NOT NULL,
    categoria   VARCHAR(60),
    vertical    VARCHAR(40),
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS admin_core.ia_acciones (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER REFERENCES admin_core.ia_sessions(id) ON DELETE SET NULL,
    tipo        VARCHAR(60) NOT NULL,
    payload     JSONB,
    resultado   JSONB,
    estado      VARCHAR(20) DEFAULT 'ok',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO admin_core.ia_prompts (slug, titulo, prompt, categoria, vertical) VALUES
    ('resumen-cliente',     'Resumen de cliente',           'Resumí en 5 bullets quién es este cliente y qué oportunidades tenemos.', 'crm',     null),
    ('redactar-propuesta',  'Redactar propuesta tech',      'Redactá una propuesta consultora para el siguiente brief, con scope, timeline y precio.', 'ventas', 'tech'),
    ('explicar-factura',    'Explicar factura',             'Explicá esta factura como si se la mostraras a un cliente no técnico.', 'docs',   null),
    ('analizar-pagos',      'Analizar flujo de pagos',      'Analizá los últimos 30 días de payment links y dame insights.', 'finanzas', 'paybridge')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO admin_core.tenants (slug, nombre, schema_name) VALUES
    ('travel',    'Arman Travel',    'public'),
    ('tech',      'Arman Tech',      'tech'),
    ('paybridge', 'PayBridge',       'paybridge'),
    ('admin',     'Arman Admin',     'admin_core')
  ON CONFLICT (slug) DO NOTHING;
`;

async function bootstrapVerticalSchemas() {
  for (const v of VERTICALS) {
    try { await db.query(COMMON_DOC_TABLES(v)); }
    catch (e) { console.error(`[schemas] common ${v} FAILED:`, e.message); }
  }
  try { await db.query(TECH_EXTRA); }
  catch (e) { console.error('[schemas] TECH_EXTRA FAILED:', e.message); }
  try { await db.query(PAYBRIDGE_EXTRA); }
  catch (e) { console.error('[schemas] PAYBRIDGE_EXTRA FAILED:', e.message); }
  try { await db.query(ADMIN_EXTRA); }
  catch (e) { console.error('[schemas] ADMIN_EXTRA FAILED:', e.message); }
  console.log('[schemas] verticals ready: tech, paybridge, admin_core (travel = public)');
}

module.exports = { bootstrapVerticalSchemas, VERTICALS };
