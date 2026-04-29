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

    // ─── Admin IA: templates de extracción de comprobantes ───────────────
    await db.query(`
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
    `);

    // Seed factory templates (idempotente: ON CONFLICT DO NOTHING por slug)
    const factory = [
      {
        slug: 'afip-estandar',
        nombre: 'ARCA / AFIP Estándar',
        proveedor_cuit: null,
        tipo_doc_default: null,
        fingerprints: [
          'Régimen de Transparencia Fiscal',
          'Comprobante Autorizado',
          'Domicilio Comercial:',
          'Apellido y Nombre / Razón Social:',
          'Punto de Venta: Comp. Nro:',
          'CAE N°:',
          'IVA Contenido:'
        ],
        fixed_fields: {},
        extractors: {
          puntoVentaNumero: { strategy: 'afip_pv_nro_layout' },
          cae: { strategy: 'afip_cae_separado' },
          totales: { strategy: 'afip_layout_totals' },
          ivaContenido: { strategy: 'ley_27743' },
          receptor: { strategy: 'afip_apellido_razon_social' }
        },
        notas: 'PDF descargado del portal de Comprobantes en Línea de ARCA/AFIP. Layout con labels en columna izquierda y valores en columna derecha; pdf-parse linealiza ambas columnas por separado.'
      },
      {
        slug: 'software-turismo',
        nombre: 'Software de Turismo (FAC + DETALLE COMPUTO DE IVA)',
        proveedor_cuit: null,
        tipo_doc_default: null,
        fingerprints: [
          'DETALLE COMPUTO DE IVA',
          'SR/ES:',
          'Cond.de Venta:',
          'I.V.A. RESPONSABLE INSCRIPTO CUIT:',
          'TURISMO NACIONAL',
          'TURISMO INTERNACIONAL',
          'Concepto facturado por cta y orden de terceros'
        ],
        fixed_fields: {},
        extractors: {
          tipoNumero: { strategy: 'turismo_fac_letra' },
          ivaDiscriminado: { strategy: 'detalle_computo_iva' },
          receptor: { strategy: 'sr_es_block' },
          otrosTributos: { strategy: 'concepto_terceros_dnt' },
          pieColumnas: { strategy: 'pes_caret_columns' }
        },
        notas: 'PDF emitido por software de gestión de agencias de viaje (típico de mayoristas/operadores). Discriminación de IVA en el formato "X% sobre N = IVA". Campo "Concepto facturado por cuenta y orden de terceros" identifica DNT/percepciones.'
      }
    ];
    for (const t of factory) {
      await db.query(
        `INSERT INTO admin_ia_templates
           (slug, nombre, proveedor_cuit, tipo_doc_default, fingerprints, fixed_fields, extractors, is_factory, notas, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, TRUE, $8, 'system')
         ON CONFLICT (slug) DO NOTHING`,
        [t.slug, t.nombre, t.proveedor_cuit, t.tipo_doc_default,
         JSON.stringify(t.fingerprints), JSON.stringify(t.fixed_fields),
         JSON.stringify(t.extractors), t.notas]
      );
    }
    console.log('[migrate] admin_ia_templates ready (' + factory.length + ' factory templates seeded)');

  } catch (e) {
    console.error('[migrate] Error (non-fatal):', e.message);
  }
}

module.exports = { runMigrations };
