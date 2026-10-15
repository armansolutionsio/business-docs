-- ============================================================================
-- ARMAN — Schema completo (Coolify-ready, idempotente)
-- Combina: infra/init.sql + apps/business-docs/src/backend/utils/migrate.js +
--          apps/business-docs/src/backend/utils/schemas.js
-- Solo usa CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT
-- DO NOTHING. Seguro de re-ejecutar.
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PUBLIC SCHEMA (CRM Travel)
-- ============================================================================

-- 1. CONTACTOS (master)
CREATE TABLE IF NOT EXISTS contactos (
    id                    SERIAL PRIMARY KEY,
    codigo                TEXT UNIQUE,
    tipo_registro         VARCHAR(20) DEFAULT 'persona',
    rol_actual            VARCHAR(30) DEFAULT 'lead',
    estado                VARCHAR(30) NOT NULL DEFAULT 'nuevo',
    nombre                TEXT,
    apellido              TEXT,
    razon_social          TEXT,
    dni                   TEXT,
    cuit                  TEXT,
    telefono              TEXT,
    telefono_secundario   TEXT,
    email                 TEXT,
    email_secundario      TEXT,
    domicilio             TEXT,
    localidad             TEXT,
    provincia             TEXT,
    codigo_postal         TEXT,
    pais                  TEXT DEFAULT 'Argentina',
    latitud               DOUBLE PRECISION,
    longitud              DOUBLE PRECISION,
    origen                TEXT,
    vendedor_asignado     VARCHAR(50),
    canal_preferido       VARCHAR(30),
    consentimiento_marketing BOOLEAN DEFAULT false,
    fecha_nacimiento      DATE,
    nacionalidad          TEXT,
    sexo                  VARCHAR(1),
    destino_interes       TEXT,
    tipo_viaje            VARCHAR(30),
    fecha_viaje_estimada  DATE,
    cantidad_pasajeros    INTEGER,
    presupuesto           NUMERIC(12,2),
    prioridad             VARCHAR(10) DEFAULT 'media',
    probabilidad_cierre   INTEGER DEFAULT 0,
    ticket_estimado       NUMERIC(12,2),
    proxima_accion        TEXT,
    fecha_proxima_accion  DATE,
    motivo_perdida        TEXT,
    etiquetas             TEXT[] DEFAULT '{}',
    observaciones         TEXT,
    consentimiento_whatsapp BOOLEAN DEFAULT true,
    consentimiento_email    BOOLEAN DEFAULT false,
    fecha_ultima_interaccion TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS global_customer_id   UUID;
-- WhatsApp import / campaign tracking (usadas por /api/wa-import en server.js)
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS campana_publicitaria TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS campana_source_url   TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS campana_tipo         VARCHAR(40);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS wa_message_id        TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS wa_first_message     TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS wa_forwarded         BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_contactos_estado     ON contactos (estado);
CREATE INDEX IF NOT EXISTS idx_contactos_rol        ON contactos (rol_actual);
CREATE INDEX IF NOT EXISTS idx_contactos_provincia  ON contactos (provincia);
CREATE INDEX IF NOT EXISTS idx_contactos_localidad  ON contactos (localidad);
CREATE INDEX IF NOT EXISTS idx_contactos_telefono   ON contactos (telefono);
CREATE INDEX IF NOT EXISTS idx_contactos_email      ON contactos (email);
CREATE INDEX IF NOT EXISTS idx_contactos_dni        ON contactos (dni);
CREATE INDEX IF NOT EXISTS idx_public_contactos_global ON contactos(global_customer_id);

-- Trigger auto-codigo C-00001
CREATE OR REPLACE FUNCTION generate_contacto_codigo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'C-' || LPAD(NEW.id::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacto_codigo ON contactos;
CREATE TRIGGER trg_contacto_codigo
  BEFORE INSERT ON contactos
  FOR EACH ROW EXECUTE FUNCTION generate_contacto_codigo();

-- 2. CONVERSACIONES
CREATE TABLE IF NOT EXISTS conversaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER NOT NULL REFERENCES contactos(id),
    canal               VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    tipo                VARCHAR(20) NOT NULL DEFAULT 'entrante',
    contenido           TEXT,
    usuario_responsable VARCHAR(50),
    estado_conversacion VARCHAR(20) DEFAULT 'abierta',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_contacto ON conversaciones (contacto_id);

-- 3. OPORTUNIDADES
CREATE TABLE IF NOT EXISTS oportunidades (
    id                    SERIAL PRIMARY KEY,
    contacto_id           INTEGER NOT NULL REFERENCES contactos(id),
    titulo                TEXT NOT NULL,
    destino               TEXT,
    producto              TEXT,
    cantidad_pasajeros    INTEGER DEFAULT 1,
    fecha_salida          DATE,
    fecha_regreso         DATE,
    presupuesto_estimado  NUMERIC(12,2),
    probabilidad_cierre   INTEGER DEFAULT 0,
    estado_oportunidad    VARCHAR(30) NOT NULL DEFAULT 'nueva',
    vendedor              VARCHAR(50),
    origen                TEXT,
    motivo_perdida        TEXT,
    fecha_cierre          DATE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oport_contacto ON oportunidades (contacto_id);

-- 4. PROVEEDORES
CREATE TABLE IF NOT EXISTS proveedores (
    id                      SERIAL PRIMARY KEY,
    razon_social            TEXT NOT NULL,
    nombre_comercial        TEXT,
    cuit                    TEXT,
    contacto_principal      TEXT,
    telefono                TEXT,
    email                   TEXT,
    direccion               TEXT,
    localidad               TEXT,
    provincia               TEXT,
    pais                    TEXT DEFAULT 'Argentina',
    web                     TEXT,
    tipo_proveedor          VARCHAR(50),
    servicios_que_ofrece    TEXT,
    destinos_que_opera      TEXT,
    medios_de_pago          TEXT,
    condiciones_comerciales TEXT,
    plazos_de_pago          TEXT,
    ejecutivo_de_cuenta     TEXT,
    estado                  VARCHAR(20) DEFAULT 'activo',
    observaciones           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PRODUCTOS / SERVICIOS DEL PROVEEDOR
CREATE TABLE IF NOT EXISTS productos_proveedor (
    id                    SERIAL PRIMARY KEY,
    proveedor_id          INTEGER NOT NULL REFERENCES proveedores(id),
    categoria             VARCHAR(50),
    descripcion           TEXT NOT NULL,
    destino               TEXT,
    tarifa_base           NUMERIC(12,2),
    moneda                VARCHAR(3) DEFAULT 'USD',
    vigencia              TEXT,
    comision              NUMERIC(5,2),
    politica_cancelacion  TEXT,
    forma_confirmacion    TEXT,
    notas                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_prov ON productos_proveedor (proveedor_id);

-- 6. COTIZACIONES
CREATE TABLE IF NOT EXISTS cotizaciones (
    id               SERIAL PRIMARY KEY,
    contacto_id      INTEGER NOT NULL REFERENCES contactos(id),
    oportunidad_id   INTEGER REFERENCES oportunidades(id),
    numero           VARCHAR(30) UNIQUE,
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    validez_dias     INTEGER DEFAULT 15,
    moneda           VARCHAR(3) DEFAULT 'USD',
    subtotal         NUMERIC(12,2) DEFAULT 0,
    impuestos        NUMERIC(12,2) DEFAULT 0,
    total            NUMERIC(12,2) DEFAULT 0,
    estado           VARCHAR(20) DEFAULT 'borrador',
    notas            TEXT,
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS anulado_por VARCHAR(50);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS detalle_categorias JSONB;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cliente_snapshot JSONB;
CREATE INDEX IF NOT EXISTS idx_cot_contacto ON cotizaciones (contacto_id);

CREATE TABLE IF NOT EXISTS cotizacion_items (
    id                    SERIAL PRIMARY KEY,
    cotizacion_id         INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    descripcion           TEXT NOT NULL,
    cantidad              INTEGER DEFAULT 1,
    precio_unitario       NUMERIC(12,2) NOT NULL,
    subtotal              NUMERIC(12,2) NOT NULL,
    proveedor_id          INTEGER REFERENCES proveedores(id),
    producto_proveedor_id INTEGER REFERENCES productos_proveedor(id)
);

-- 7. VENTAS / RESERVAS
CREATE TABLE IF NOT EXISTS ventas (
    id               SERIAL PRIMARY KEY,
    contacto_id      INTEGER NOT NULL REFERENCES contactos(id),
    oportunidad_id   INTEGER REFERENCES oportunidades(id),
    cotizacion_id    INTEGER REFERENCES cotizaciones(id),
    numero           VARCHAR(30) UNIQUE,
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    moneda           VARCHAR(3) DEFAULT 'USD',
    subtotal         NUMERIC(12,2) DEFAULT 0,
    impuestos        NUMERIC(12,2) DEFAULT 0,
    total            NUMERIC(12,2) DEFAULT 0,
    estado           VARCHAR(20) DEFAULT 'confirmada',
    notas            TEXT,
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venta_contacto ON ventas (contacto_id);

CREATE TABLE IF NOT EXISTS venta_items (
    id                    SERIAL PRIMARY KEY,
    venta_id              INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    descripcion           TEXT NOT NULL,
    cantidad              INTEGER DEFAULT 1,
    precio_unitario       NUMERIC(12,2) NOT NULL,
    subtotal              NUMERIC(12,2) NOT NULL,
    proveedor_id          INTEGER REFERENCES proveedores(id),
    producto_proveedor_id INTEGER REFERENCES productos_proveedor(id)
);

-- 8. FACTURAS
CREATE TABLE IF NOT EXISTS facturas (
    id               SERIAL PRIMARY KEY,
    contacto_id      INTEGER NOT NULL REFERENCES contactos(id),
    venta_id         INTEGER REFERENCES ventas(id),
    numero           VARCHAR(30) UNIQUE,
    tipo             VARCHAR(5) DEFAULT 'B',
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    moneda           VARCHAR(3) DEFAULT 'ARS',
    subtotal         NUMERIC(12,2) DEFAULT 0,
    iva              NUMERIC(12,2) DEFAULT 0,
    total            NUMERIC(12,2) DEFAULT 0,
    estado           VARCHAR(20) DEFAULT 'emitida',
    cae              TEXT,
    cae_vencimiento  DATE,
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fact_contacto ON facturas (contacto_id);

CREATE TABLE IF NOT EXISTS factura_items (
    id               SERIAL PRIMARY KEY,
    factura_id       INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    descripcion      TEXT NOT NULL,
    cantidad         INTEGER DEFAULT 1,
    precio_unitario  NUMERIC(12,2) NOT NULL,
    subtotal         NUMERIC(12,2) NOT NULL
);

-- 9. RECIBOS
CREATE TABLE IF NOT EXISTS recibos (
    id               SERIAL PRIMARY KEY,
    contacto_id      INTEGER NOT NULL REFERENCES contactos(id),
    factura_id       INTEGER REFERENCES facturas(id),
    numero           VARCHAR(30) UNIQUE,
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    monto            NUMERIC(12,2) NOT NULL,
    medio_pago       VARCHAR(30),
    referencia       TEXT,
    notas            TEXT,
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ;
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS anulado_por VARCHAR(50);
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'ARS';
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS concepto TEXT;
ALTER TABLE recibos ADD COLUMN IF NOT EXISTS cliente_snapshot JSONB;
CREATE INDEX IF NOT EXISTS idx_recibo_contacto ON recibos (contacto_id);

-- 10. PAGOS
CREATE TABLE IF NOT EXISTS pagos (
    id               SERIAL PRIMARY KEY,
    contacto_id      INTEGER NOT NULL REFERENCES contactos(id),
    venta_id         INTEGER REFERENCES ventas(id),
    factura_id       INTEGER REFERENCES facturas(id),
    monto            NUMERIC(12,2) NOT NULL,
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    medio            VARCHAR(30),
    referencia       TEXT,
    estado           VARCHAR(20) DEFAULT 'confirmado',
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pago_contacto ON pagos (contacto_id);

-- 11. TAREAS
CREATE TABLE IF NOT EXISTS tareas (
    id                 SERIAL PRIMARY KEY,
    contacto_id        INTEGER NOT NULL REFERENCES contactos(id),
    titulo             TEXT NOT NULL,
    descripcion        TEXT,
    fecha_vencimiento  DATE,
    prioridad          VARCHAR(10) DEFAULT 'media',
    estado             VARCHAR(20) DEFAULT 'pendiente',
    asignado_a         VARCHAR(50),
    created_by         VARCHAR(50),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarea_contacto ON tareas (contacto_id);

-- 12. NOTAS
CREATE TABLE IF NOT EXISTS notas (
    id           SERIAL PRIMARY KEY,
    contacto_id  INTEGER NOT NULL REFERENCES contactos(id),
    contenido    TEXT NOT NULL,
    created_by   VARCHAR(50),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nota_contacto ON notas (contacto_id);

-- 13. CAMPAÑAS DE MAIL
CREATE TABLE IF NOT EXISTS campania_mail (
    id                SERIAL PRIMARY KEY,
    contacto_id       INTEGER NOT NULL REFERENCES contactos(id),
    asunto            TEXT NOT NULL,
    cuerpo            TEXT NOT NULL,
    destinatario      TEXT NOT NULL,
    estado            VARCHAR(20) DEFAULT 'enviado',
    enviado_por       VARCHAR(50),
    enviado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    respuesta         TEXT,
    respondido_at     TIMESTAMPTZ,
    notas             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_camp_mail_contacto ON campania_mail (contacto_id);
CREATE INDEX IF NOT EXISTS idx_camp_mail_estado   ON campania_mail (estado);

-- 14. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
    id             SERIAL PRIMARY KEY,
    tabla          TEXT NOT NULL,
    registro_id    INTEGER NOT NULL,
    accion         VARCHAR(20) NOT NULL,
    campo          TEXT,
    valor_anterior TEXT,
    valor_nuevo    TEXT,
    usuario        VARCHAR(50),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tabla ON audit_log (tabla, registro_id);

-- 15. CONVERSACION_ARCHIVOS
CREATE TABLE IF NOT EXISTS conversacion_archivos (
    id                SERIAL PRIMARY KEY,
    conversacion_id   INTEGER REFERENCES conversaciones(id),
    contacto_id       INTEGER NOT NULL REFERENCES contactos(id),
    nombre_archivo    TEXT,
    tipo_archivo      VARCHAR(50) DEFAULT 'otro',
    url_drive         TEXT,
    url_local         TEXT,
    tamano_bytes      BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_arch_contacto ON conversacion_archivos (contacto_id);
CREATE INDEX IF NOT EXISTS idx_conv_arch_conv     ON conversacion_archivos (conversacion_id);

-- 16. WHATSAPP_SYNC_LOG
CREATE TABLE IF NOT EXISTS whatsapp_sync_log (
    id                    SERIAL PRIMARY KEY,
    source                VARCHAR(50) DEFAULT 'google_sheets',
    registros_procesados  INTEGER DEFAULT 0,
    contactos_creados     INTEGER DEFAULT 0,
    mensajes_importados   INTEGER DEFAULT 0,
    errores               INTEGER DEFAULT 0,
    detalle               TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. BETA_CONTACTOS (legacy)
CREATE TABLE IF NOT EXISTS beta_contactos (
    id            SERIAL PRIMARY KEY,
    telefono      TEXT,
    provincia     TEXT,
    codigo_postal TEXT,
    localidad     TEXT,
    domicilio     TEXT,
    nombre        TEXT,
    dni           TEXT,
    email         TEXT,
    latitud       DOUBLE PRECISION,
    longitud      DOUBLE PRECISION,
    estado        VARCHAR(30) NOT NULL DEFAULT 'contacto',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. DOCUMENTOS_BORRADOS (soft-delete history)
CREATE TABLE IF NOT EXISTS documentos_borrados (
    id             SERIAL PRIMARY KEY,
    tipo           VARCHAR(20) NOT NULL,
    doc_id         INTEGER NOT NULL,
    contacto_id    INTEGER REFERENCES contactos(id),
    numero         VARCHAR(30),
    motivo         TEXT,
    usuario        VARCHAR(50),
    payload        JSONB,
    borrado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docborr_tipo_doc  ON documentos_borrados (tipo, doc_id);
CREATE INDEX IF NOT EXISTS idx_docborr_contacto  ON documentos_borrados (contacto_id);

-- 19. ADMIN_IA_TEMPLATES (extracción de comprobantes)
CREATE TABLE IF NOT EXISTS admin_ia_templates (
    id                SERIAL PRIMARY KEY,
    slug              VARCHAR(80) UNIQUE NOT NULL,
    nombre            VARCHAR(200) NOT NULL,
    proveedor_cuit    VARCHAR(20),
    tipo_doc_default  VARCHAR(60),
    fingerprints      JSONB DEFAULT '[]'::jsonb,
    fixed_fields      JSONB DEFAULT '{}'::jsonb,
    extractors        JSONB DEFAULT '{}'::jsonb,
    is_factory        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    version           INTEGER NOT NULL DEFAULT 1,
    notas             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(80),
    updated_by        VARCHAR(80)
);
CREATE INDEX IF NOT EXISTS idx_aia_tpl_active ON admin_ia_templates (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_aia_tpl_cuit   ON admin_ia_templates (proveedor_cuit) WHERE proveedor_cuit IS NOT NULL;

-- 20. MAIL_TEMPLATES
CREATE TABLE IF NOT EXISTS mail_templates (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(120) NOT NULL,
    asunto        TEXT NOT NULL,
    cuerpo        TEXT NOT NULL,
    categoria     VARCHAR(40),
    audiencia     VARCHAR(20) NOT NULL DEFAULT 'cliente',
    is_factory    BOOLEAN NOT NULL DEFAULT FALSE,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    orden         INTEGER NOT NULL DEFAULT 100,
    notas         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    VARCHAR(80)
);
CREATE INDEX IF NOT EXISTS idx_mail_tpl_audiencia ON mail_templates (audiencia) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_mail_tpl_categoria ON mail_templates (categoria) WHERE activo = TRUE;

-- ============================================================================
-- VERTICALES: tech / paybridge / admin_core (cada uno en su schema)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tech;
CREATE SCHEMA IF NOT EXISTS paybridge;
CREATE SCHEMA IF NOT EXISTS admin_core;

-- ─── Tablas comunes en CADA vertical (tech / paybridge / admin_core) ────────
-- Macro: lo mismo se aplica a los 3 schemas. Para no repetir, abajo el script
-- expandido para cada uno.

-- ============ TECH ============
CREATE TABLE IF NOT EXISTS tech.contactos (
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
ALTER TABLE tech.contactos ADD COLUMN IF NOT EXISTS global_customer_id UUID;
CREATE INDEX IF NOT EXISTS idx_tech_contactos_email  ON tech.contactos(email);
CREATE INDEX IF NOT EXISTS idx_tech_contactos_cuit   ON tech.contactos(cuit);
CREATE INDEX IF NOT EXISTS idx_tech_contactos_global ON tech.contactos(global_customer_id);

CREATE TABLE IF NOT EXISTS tech.cotizaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS tech.cotizacion_items (
    id              SERIAL PRIMARY KEY,
    cotizacion_id   INTEGER NOT NULL REFERENCES tech.cotizaciones(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    categoria       VARCHAR(60),
    cantidad        NUMERIC(12,3) DEFAULT 1,
    unidad          VARCHAR(40),
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0,
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tech.facturas (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS tech.factura_items (
    id              SERIAL PRIMARY KEY,
    factura_id      INTEGER NOT NULL REFERENCES tech.facturas(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(12,3) DEFAULT 1,
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tech.recibos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS tech.pagos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES tech.contactos(id) ON DELETE SET NULL,
    factura_id      INTEGER REFERENCES tech.facturas(id) ON DELETE SET NULL,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(3) DEFAULT 'ARS',
    metodo          VARCHAR(40),
    referencia      VARCHAR(80),
    estado          VARCHAR(20) DEFAULT 'activo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tech.notas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES tech.contactos(id) ON DELETE CASCADE,
    contenido     TEXT NOT NULL,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tech_notas_contacto ON tech.notas(contacto_id);

CREATE TABLE IF NOT EXISTS tech.tareas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER REFERENCES tech.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_tech_tareas_contacto ON tech.tareas(contacto_id);
CREATE INDEX IF NOT EXISTS idx_tech_tareas_estado   ON tech.tareas(estado);

CREATE TABLE IF NOT EXISTS tech.oportunidades (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES tech.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_tech_opps_contacto ON tech.oportunidades(contacto_id);

CREATE TABLE IF NOT EXISTS tech.timeline (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES tech.contactos(id) ON DELETE CASCADE,
    tipo          VARCHAR(40) NOT NULL,
    titulo        VARCHAR(200),
    descripcion   TEXT,
    metadata      JSONB DEFAULT '{}'::jsonb,
    usuario       VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tech_timeline_contacto ON tech.timeline(contacto_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tech.audit_log (
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

-- TECH EXTRA: proyectos, hitos, time_entries, retainers
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

-- ============ PAYBRIDGE ============
CREATE TABLE IF NOT EXISTS paybridge.contactos (
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
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS global_customer_id UUID;
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_alias VARCHAR(120);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_email VARCHAR(200);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_estado VARCHAR(40) DEFAULT 'sin_onboardear';
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_onboarding_at TIMESTAMPTZ;
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_notas TEXT;
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_cvu             VARCHAR(40);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_cbu             VARCHAR(40);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_numero_cuenta   VARCHAR(60);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS dolarapp_titular         VARCHAR(200);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS apellido        VARCHAR(120);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS origen          VARCHAR(40);
ALTER TABLE paybridge.contactos ADD COLUMN IF NOT EXISTS product_key     VARCHAR(200);
CREATE INDEX IF NOT EXISTS idx_paybridge_contactos_email  ON paybridge.contactos(email);
CREATE INDEX IF NOT EXISTS idx_paybridge_contactos_cuit   ON paybridge.contactos(cuit);
CREATE INDEX IF NOT EXISTS idx_paybridge_contactos_global ON paybridge.contactos(global_customer_id);
CREATE INDEX IF NOT EXISTS idx_paybridge_contactos_pkey   ON paybridge.contactos(product_key);

CREATE TABLE IF NOT EXISTS paybridge.cotizaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS paybridge.cotizacion_items (
    id              SERIAL PRIMARY KEY,
    cotizacion_id   INTEGER NOT NULL REFERENCES paybridge.cotizaciones(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    categoria       VARCHAR(60),
    cantidad        NUMERIC(12,3) DEFAULT 1,
    unidad          VARCHAR(40),
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0,
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS paybridge.facturas (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS paybridge.factura_items (
    id              SERIAL PRIMARY KEY,
    factura_id      INTEGER NOT NULL REFERENCES paybridge.facturas(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(12,3) DEFAULT 1,
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paybridge.recibos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS paybridge.pagos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES paybridge.contactos(id) ON DELETE SET NULL,
    factura_id      INTEGER REFERENCES paybridge.facturas(id) ON DELETE SET NULL,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(3) DEFAULT 'ARS',
    metodo          VARCHAR(40),
    referencia      VARCHAR(80),
    estado          VARCHAR(20) DEFAULT 'activo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paybridge.notas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES paybridge.contactos(id) ON DELETE CASCADE,
    contenido     TEXT NOT NULL,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paybridge_notas_contacto ON paybridge.notas(contacto_id);

CREATE TABLE IF NOT EXISTS paybridge.tareas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER REFERENCES paybridge.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_paybridge_tareas_contacto ON paybridge.tareas(contacto_id);
CREATE INDEX IF NOT EXISTS idx_paybridge_tareas_estado   ON paybridge.tareas(estado);

CREATE TABLE IF NOT EXISTS paybridge.oportunidades (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES paybridge.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_paybridge_opps_contacto ON paybridge.oportunidades(contacto_id);

CREATE TABLE IF NOT EXISTS paybridge.timeline (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES paybridge.contactos(id) ON DELETE CASCADE,
    tipo          VARCHAR(40) NOT NULL,
    titulo        VARCHAR(200),
    descripcion   TEXT,
    metadata      JSONB DEFAULT '{}'::jsonb,
    usuario       VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paybridge_timeline_contacto ON paybridge.timeline(contacto_id, created_at DESC);

CREATE TABLE IF NOT EXISTS paybridge.audit_log (
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

-- PAYBRIDGE EXTRA
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
ALTER TABLE paybridge.payment_links ADD COLUMN IF NOT EXISTS external_id     VARCHAR(120);
ALTER TABLE paybridge.payment_links ADD COLUMN IF NOT EXISTS url             TEXT;
ALTER TABLE paybridge.payment_links ADD COLUMN IF NOT EXISTS source          VARCHAR(40) DEFAULT 'manual';
ALTER TABLE paybridge.payment_links ADD COLUMN IF NOT EXISTS raw_row         JSONB;
CREATE INDEX IF NOT EXISTS idx_paybridge_links_estado ON paybridge.payment_links(estado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_paybridge_links_external_id
    ON paybridge.payment_links(external_id) WHERE external_id IS NOT NULL;

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
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS source           VARCHAR(40) DEFAULT 'manual';
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS available_on_at  TIMESTAMPTZ;
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS country          VARCHAR(80);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS product_id_ext   VARCHAR(120);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS product_names    VARCHAR(200);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS exchange_rate    NUMERIC(18,8);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_address_line1       VARCHAR(200);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_address_postal_code VARCHAR(40);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_address_country     VARCHAR(80);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_brand       VARCHAR(40);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_funding     VARCHAR(40);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS card_country     VARCHAR(80);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS statement_descriptor VARCHAR(200);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS payment_intent_id    VARCHAR(120);
ALTER TABLE paybridge.transactions ADD COLUMN IF NOT EXISTS raw_row          JSONB;
CREATE INDEX IF NOT EXISTS idx_paybridge_tx_estado   ON paybridge.transactions(estado);
CREATE INDEX IF NOT EXISTS idx_paybridge_tx_link     ON paybridge.transactions(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_paybridge_tx_contacto ON paybridge.transactions(contacto_id, completado_at DESC);
CREATE INDEX IF NOT EXISTS idx_paybridge_tx_source   ON paybridge.transactions(source);
CREATE UNIQUE INDEX IF NOT EXISTS uq_paybridge_tx_external_ref
    ON paybridge.transactions(external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_paybridge_tx_payment_intent
    ON paybridge.transactions(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS paybridge.stripe_imports (
    id                SERIAL PRIMARY KEY,
    file_name         VARCHAR(200),
    rows_total        INTEGER DEFAULT 0,
    rows_imported     INTEGER DEFAULT 0,
    rows_duplicated   INTEGER DEFAULT 0,
    rows_skipped      INTEGER DEFAULT 0,
    contactos_creados INTEGER DEFAULT 0,
    period_from       TIMESTAMPTZ,
    period_to         TIMESTAMPTZ,
    summary           JSONB,
    usuario           VARCHAR(120),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paybridge.stripe_links_imports (
    id                SERIAL PRIMARY KEY,
    file_name         VARCHAR(200),
    rows_total        INTEGER DEFAULT 0,
    rows_imported     INTEGER DEFAULT 0,
    rows_updated      INTEGER DEFAULT 0,
    rows_skipped      INTEGER DEFAULT 0,
    contactos_creados INTEGER DEFAULT 0,
    summary           JSONB,
    usuario           VARCHAR(120),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed monedas (idempotente)
INSERT INTO paybridge.monedas (code, nombre, simbolo, es_cripto) VALUES
    ('ARS', 'Peso Argentino', '$', FALSE),
    ('USD', 'Dolar Estadounidense', 'US$', FALSE),
    ('EUR', 'Euro', '€', FALSE),
    ('BRL', 'Real Brasileno', 'R$', FALSE),
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

-- ============ ADMIN_CORE ============
CREATE TABLE IF NOT EXISTS admin_core.contactos (
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
ALTER TABLE admin_core.contactos ADD COLUMN IF NOT EXISTS global_customer_id UUID;
CREATE INDEX IF NOT EXISTS idx_admin_core_contactos_email  ON admin_core.contactos(email);
CREATE INDEX IF NOT EXISTS idx_admin_core_contactos_cuit   ON admin_core.contactos(cuit);
CREATE INDEX IF NOT EXISTS idx_admin_core_contactos_global ON admin_core.contactos(global_customer_id);

CREATE TABLE IF NOT EXISTS admin_core.cotizaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER REFERENCES admin_core.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS admin_core.cotizacion_items (
    id              SERIAL PRIMARY KEY,
    cotizacion_id   INTEGER NOT NULL REFERENCES admin_core.cotizaciones(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    categoria       VARCHAR(60),
    cantidad        NUMERIC(12,3) DEFAULT 1,
    unidad          VARCHAR(40),
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0,
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS admin_core.facturas (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES admin_core.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS admin_core.factura_items (
    id              SERIAL PRIMARY KEY,
    factura_id      INTEGER NOT NULL REFERENCES admin_core.facturas(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(12,3) DEFAULT 1,
    precio_unitario NUMERIC(14,2) DEFAULT 0,
    iva_pct         NUMERIC(5,2) DEFAULT 21,
    total           NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_core.recibos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES admin_core.contactos(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS admin_core.pagos (
    id              SERIAL PRIMARY KEY,
    contacto_id     INTEGER REFERENCES admin_core.contactos(id) ON DELETE SET NULL,
    factura_id      INTEGER REFERENCES admin_core.facturas(id) ON DELETE SET NULL,
    monto           NUMERIC(14,2) NOT NULL,
    moneda          VARCHAR(3) DEFAULT 'ARS',
    metodo          VARCHAR(40),
    referencia      VARCHAR(80),
    estado          VARCHAR(20) DEFAULT 'activo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_core.notas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES admin_core.contactos(id) ON DELETE CASCADE,
    contenido     TEXT NOT NULL,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_core_notas_contacto ON admin_core.notas(contacto_id);

CREATE TABLE IF NOT EXISTS admin_core.tareas (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER REFERENCES admin_core.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_admin_core_tareas_contacto ON admin_core.tareas(contacto_id);
CREATE INDEX IF NOT EXISTS idx_admin_core_tareas_estado   ON admin_core.tareas(estado);

CREATE TABLE IF NOT EXISTS admin_core.oportunidades (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES admin_core.contactos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_admin_core_opps_contacto ON admin_core.oportunidades(contacto_id);

CREATE TABLE IF NOT EXISTS admin_core.timeline (
    id            SERIAL PRIMARY KEY,
    contacto_id   INTEGER NOT NULL REFERENCES admin_core.contactos(id) ON DELETE CASCADE,
    tipo          VARCHAR(40) NOT NULL,
    titulo        VARCHAR(200),
    descripcion   TEXT,
    metadata      JSONB DEFAULT '{}'::jsonb,
    usuario       VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_core_timeline_contacto ON admin_core.timeline(contacto_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_core.audit_log (
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

-- ADMIN_CORE EXTRA
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

-- Seed prompts y tenants (idempotente)
INSERT INTO admin_core.ia_prompts (slug, titulo, prompt, categoria, vertical) VALUES
    ('resumen-cliente',    'Resumen de cliente',      'Resumi en 5 bullets quien es este cliente y que oportunidades tenemos.', 'crm', null),
    ('redactar-propuesta', 'Redactar propuesta tech', 'Redacta una propuesta consultora para el siguiente brief, con scope, timeline y precio.', 'ventas', 'tech'),
    ('explicar-factura',   'Explicar factura',        'Explica esta factura como si se la mostraras a un cliente no tecnico.', 'docs', null),
    ('analizar-pagos',     'Analizar flujo de pagos', 'Analiza los ultimos 30 dias de payment links y dame insights.', 'finanzas', 'paybridge')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO admin_core.tenants (slug, nombre, schema_name) VALUES
    ('travel',    'Arman Travel', 'public'),
    ('tech',      'Arman Tech',   'tech'),
    ('paybridge', 'PayBridge',    'paybridge'),
    ('admin',     'Arman Admin',  'admin_core')
ON CONFLICT (slug) DO NOTHING;
