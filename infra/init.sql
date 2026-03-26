-- beta_contactos: imported from CSV (without numero_envio, without "destinatario" prefix)
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

-- Index for common filters
CREATE INDEX IF NOT EXISTS idx_contactos_estado    ON beta_contactos (estado);
CREATE INDEX IF NOT EXISTS idx_contactos_provincia ON beta_contactos (provincia);
CREATE INDEX IF NOT EXISTS idx_contactos_localidad ON beta_contactos (localidad);
