-- ============================================================================
-- ARMAN CRM — Schema
-- Single master contactos table + all related tables
-- ============================================================================

-- 1. CONTACTOS (master table)
CREATE TABLE IF NOT EXISTS contactos (
    id                    SERIAL PRIMARY KEY,
    codigo                TEXT UNIQUE,  -- human-readable ID, auto-generated: C-0001
    tipo_registro         VARCHAR(20) DEFAULT 'persona',  -- persona / empresa
    rol_actual            VARCHAR(30) DEFAULT 'lead',     -- lead / contacto / cliente / pasajero / proveedor
    estado                VARCHAR(30) NOT NULL DEFAULT 'nuevo', -- nuevo / contactado / calificado / cotizado / negociacion / ganado / perdido / dormido / cliente_recurrente
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
    origen                TEXT,         -- web, whatsapp, referido, instagram, etc
    vendedor_asignado     VARCHAR(50),
    canal_preferido       VARCHAR(30),  -- whatsapp, email, telefono
    consentimiento_marketing BOOLEAN DEFAULT false,
    fecha_nacimiento      DATE,
    nacionalidad          TEXT,
    sexo                  VARCHAR(1),
    -- Interés comercial
    destino_interes       TEXT,
    tipo_viaje            VARCHAR(30),  -- individual / pareja / familia / grupo / empresa
    fecha_viaje_estimada  DATE,
    cantidad_pasajeros    INTEGER,
    presupuesto           NUMERIC(12,2),
    prioridad             VARCHAR(10) DEFAULT 'media', -- baja / media / alta / urgente
    probabilidad_cierre   INTEGER DEFAULT 0,
    ticket_estimado       NUMERIC(12,2),
    -- Seguimiento
    proxima_accion        TEXT,
    fecha_proxima_accion  DATE,
    motivo_perdida        TEXT,
    etiquetas             TEXT[] DEFAULT '{}',
    -- General
    observaciones         TEXT,
    consentimiento_whatsapp BOOLEAN DEFAULT true,
    consentimiento_email    BOOLEAN DEFAULT false,
    fecha_ultima_interaccion TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contactos_estado     ON contactos (estado);
CREATE INDEX IF NOT EXISTS idx_contactos_rol        ON contactos (rol_actual);
CREATE INDEX IF NOT EXISTS idx_contactos_provincia  ON contactos (provincia);
CREATE INDEX IF NOT EXISTS idx_contactos_localidad  ON contactos (localidad);
CREATE INDEX IF NOT EXISTS idx_contactos_telefono   ON contactos (telefono);
CREATE INDEX IF NOT EXISTS idx_contactos_email      ON contactos (email);
CREATE INDEX IF NOT EXISTS idx_contactos_dni        ON contactos (dni);

-- 2. CONVERSACIONES (WhatsApp, email, etc)
CREATE TABLE IF NOT EXISTS conversaciones (
    id                  SERIAL PRIMARY KEY,
    contacto_id         INTEGER NOT NULL REFERENCES contactos(id),
    canal               VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    tipo                VARCHAR(20) NOT NULL DEFAULT 'entrante', -- entrante / saliente / nota_interna
    contenido           TEXT,
    usuario_responsable VARCHAR(50),
    estado_conversacion VARCHAR(20) DEFAULT 'abierta', -- abierta / pendiente / cerrada / sin_responder
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
    estado_oportunidad    VARCHAR(30) NOT NULL DEFAULT 'nueva', -- nueva / cotizada / negociacion / ganada / perdida
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
    tipo_proveedor          VARCHAR(50),  -- aerolinea / hotel / excursion / seguro / transfer / receptivo
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
    estado           VARCHAR(20) DEFAULT 'borrador', -- borrador / enviada / aceptada / rechazada / vencida
    notas            TEXT,
    created_by       VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
    estado           VARCHAR(20) DEFAULT 'confirmada', -- confirmada / en_curso / completada / cancelada
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
    estado           VARCHAR(20) DEFAULT 'emitida', -- borrador / emitida / pagada / anulada
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

-- 11. TAREAS / SEGUIMIENTOS
CREATE TABLE IF NOT EXISTS tareas (
    id                 SERIAL PRIMARY KEY,
    contacto_id        INTEGER NOT NULL REFERENCES contactos(id),
    titulo             TEXT NOT NULL,
    descripcion        TEXT,
    fecha_vencimiento  DATE,
    prioridad          VARCHAR(10) DEFAULT 'media', -- baja / media / alta / urgente
    estado             VARCHAR(20) DEFAULT 'pendiente', -- pendiente / en_curso / completada
    asignado_a         VARCHAR(50),
    created_by         VARCHAR(50),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarea_contacto ON tareas (contacto_id);

-- 12. NOTAS INTERNAS
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
    destinatario      TEXT NOT NULL,        -- email al que se envió
    estado            VARCHAR(20) DEFAULT 'enviado',  -- enviado / entregado / leido / respondido / fallido / rebotado
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
    accion         VARCHAR(20) NOT NULL, -- INSERT / UPDATE / DELETE
    campo          TEXT,
    valor_anterior TEXT,
    valor_nuevo    TEXT,
    usuario        VARCHAR(50),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tabla ON audit_log (tabla, registro_id);

-- ============================================================================
-- Auto-generate codigo for contactos: C-0001, C-0002, etc.
-- ============================================================================
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

-- 15. CONVERSACION ARCHIVOS (WhatsApp files, Drive files, etc)
CREATE TABLE IF NOT EXISTS conversacion_archivos (
    id                SERIAL PRIMARY KEY,
    conversacion_id   INTEGER REFERENCES conversaciones(id),
    contacto_id       INTEGER NOT NULL REFERENCES contactos(id),
    nombre_archivo    TEXT,
    tipo_archivo      VARCHAR(50) DEFAULT 'otro', -- imagen, pdf, audio, video, otro
    url_drive         TEXT,
    url_local         TEXT,
    tamano_bytes      BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_arch_contacto ON conversacion_archivos (contacto_id);
CREATE INDEX IF NOT EXISTS idx_conv_arch_conv ON conversacion_archivos (conversacion_id);

-- 16. WHATSAPP SYNC LOG
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

-- ============================================================================
-- LEGACY: keep beta_contactos for backward compat (seed still uses it)
-- ============================================================================
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
