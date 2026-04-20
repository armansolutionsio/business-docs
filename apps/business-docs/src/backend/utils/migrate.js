const db = require('./db');

async function runMigrations() {
  try {
    await db.query(`
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
      CREATE INDEX IF NOT EXISTS idx_conv_arch_conv ON conversacion_archivos (conversacion_id);

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
    `);
    console.log('[migrate] New tables ready');

    // Add estado to recibos if missing
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo'`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS anulado_por VARCHAR(50)`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT`);

    // Add anulacion fields to cotizaciones if missing
    await db.query(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS anulado_por VARCHAR(50)`);
    await db.query(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT`);

    // Persist full category details + raw client snapshot for cotizaciones / recibos
    await db.query(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS detalle_categorias JSONB`);
    await db.query(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cliente_snapshot JSONB`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'ARS'`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS concepto TEXT`);
    await db.query(`ALTER TABLE recibos ADD COLUMN IF NOT EXISTS cliente_snapshot JSONB`);

    // Soft-delete history: record docs removed by mistake while preserving correlatividad
    await db.query(`
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
      CREATE INDEX IF NOT EXISTS idx_docborr_tipo_doc ON documentos_borrados (tipo, doc_id);
      CREATE INDEX IF NOT EXISTS idx_docborr_contacto ON documentos_borrados (contacto_id);
    `);

    console.log('[migrate] Anulacion + JSONB + historial columns ready');
  } catch (e) {
    console.error('[migrate] Error (non-fatal):', e.message);
  }
}

module.exports = { runMigrations };
