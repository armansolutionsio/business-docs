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
      },
      {
        slug: 'tique-fiscal-ar',
        nombre: 'Tique Fiscal AR (impresora fiscal: Hasar/Epson/NCR/Bematech)',
        proveedor_cuit: null,
        tipo_doc_default: null,
        fingerprints: [
          'TIQUE FACTURA',
          'ALICUOTA',
          'IMPORTE TOTAL OTROS TRIBUTOS',
          'TOT:',
          'Tasa vial municipal',
          'Impuesto interno a nivel ítem',
          'Su Vuelto',
          'Ley 27743 Transparencia Fiscal',
          'EPEPAAO',
          'REGISTRO:'
        ],
        fixed_fields: {},
        extractors: {
          tipoNumero: { strategy: 'tique_factura_codigo' },
          ivaDiscriminado: { strategy: 'alicuota_pct_monto' },
          impTotal: { strategy: 'tot_con_coma_decimal' },
          ivaDerivado: { strategy: 'derivar_iva_si_solo_alicuota' }
        },
        notas: 'Comprobantes emitidos por impresoras fiscales argentinas (Hasar, Epson TM, NCR, Bematech, Neptuno, etc.). Discriminación de IVA en formato "ALICUOTA NN,NN% MONTO". Otros Tributos numerados (10 - Impuesto interno..., 03 - Tasa vial municipal...). Total como "TOT: NNNNN" + valor con coma decimal. CAEA en lugar de CAE. Cuando el OCR de un escaneo comió el monto del IVA y solo hay una alícuota mencionada, el extractor lo deriva por aritmética desde el Total y los Otros Tributos.'
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

    // ─── mail_templates: plantillas de mail editables ────────────────────
    await db.query(`
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
    `);

    const mailFactory = [
      { nombre: 'Bienvenida - Nuevo Lead', categoria: 'nuevo', audiencia: 'cliente', orden: 10,
        asunto: 'Bienvenido/a a Arman Travel - Tu proximo viaje empieza aca',
        cuerpo: 'Hola {{nombre}},\n\nGracias por tu interes en Arman Travel. Nos encanta que nos hayas elegido para planificar tu proximo viaje.\n\nSomos una agencia especializada en crear experiencias de viaje unicas y personalizadas. Nuestro equipo esta listo para ayudarte a encontrar el destino perfecto.\n\nTenes algun destino en mente o queres que te asesoremos? Respondé este mail y con gusto te ayudamos.\n\nSaludos cordiales,\nEquipo Arman Travel' },
      { nombre: 'Seguimiento - Contactado', categoria: 'contactado', audiencia: 'cliente', orden: 20,
        asunto: 'Seguimos pensando en tu viaje ideal',
        cuerpo: 'Hola {{nombre}},\n\nTe escribimos porque hace un tiempo nos contactaste interesado/a en un viaje y queriamos saber si seguis con la idea.\n\nTenemos nuevas opciones y promociones que podrian interesarte. Estamos para responder cualquier duda que tengas sobre destinos, fechas o presupuesto.\n\nTe gustaria que armemos una cotizacion sin compromiso? Solo respondé este mail con tus preferencias.\n\nQuedamos a tu disposicion,\nEquipo Arman Travel' },
      { nombre: 'Envio de Cotizacion', categoria: 'cotizado', audiencia: 'cliente', orden: 30,
        asunto: 'Tu cotizacion de viaje esta lista - Arman Travel',
        cuerpo: 'Hola {{nombre}},\n\nTe enviamos la cotizacion que preparamos especialmente para vos. Incluye todo lo que conversamos y algunas opciones adicionales que creemos te van a gustar.\n\nRecorda que esta cotizacion tiene una validez limitada, asi que te recomendamos revisarla pronto.\n\nSi tenes alguna pregunta, queres ajustar algo o necesitas mas opciones, no dudes en respondernos.\n\nEsperamos que te guste la propuesta,\nEquipo Arman Travel' },
      { nombre: 'Oferta Especial - Negociacion', categoria: 'negociacion', audiencia: 'cliente', orden: 40,
        asunto: 'Oferta especial para tu viaje - No te la pierdas',
        cuerpo: 'Hola {{nombre}},\n\nQueremos contarte que conseguimos condiciones especiales para el viaje que estas evaluando.\n\nSabemos que estas en proceso de decision y queremos ayudarte a concretarlo. Tenemos flexibilidad en formas de pago y podemos ajustar el itinerario segun tus necesidades.\n\nPodemos coordinar una llamada esta semana para cerrar los detalles? Respondé este mail y agendamos.\n\nSaludos,\nEquipo Arman Travel' },
      { nombre: 'Reserva Confirmada', categoria: 'ganado', audiencia: 'cliente', orden: 50,
        asunto: 'Tu reserva esta confirmada - Detalles y comprobantes',
        cuerpo: 'Hola {{nombre}},\n\nNos alegra confirmarte que tu reserva esta lista. Adjuntamos los comprobantes y vouchers correspondientes a tu viaje.\n\nGuardalos en tu telefono para tenerlos a mano durante el viaje. Cualquier consulta o cambio de ultimo momento, escribinos sin problema.\n\nQue lo disfrutes muchisimo!\nEquipo Arman Travel' },
      { nombre: 'Envio de Recibo', categoria: 'pago', audiencia: 'cliente', orden: 60,
        asunto: 'Comprobante de pago - Arman Travel',
        cuerpo: 'Hola {{nombre}},\n\nAdjuntamos el recibo correspondiente al pago recibido. Quedan registrados los datos para tu tranquilidad.\n\nSi necesitas alguna aclaracion sobre el comprobante o el saldo restante, no dudes en respondernos.\n\nGracias por confiar en nosotros,\nEquipo Arman Travel' },
      { nombre: 'Recordatorio de Pago', categoria: 'pago', audiencia: 'cliente', orden: 70,
        asunto: 'Recordatorio: vencimiento de pago proximo',
        cuerpo: 'Hola {{nombre}},\n\nTe escribimos para recordarte que se aproxima la fecha de vencimiento del pago de tu reserva.\n\nPara mantener las condiciones acordadas y asegurar la disponibilidad, te pedimos por favor regularizar el pago antes de la fecha indicada.\n\nSi necesitas coordinar el pago o tenes alguna consulta, respondé este mail y te ayudamos enseguida.\n\nSaludos,\nEquipo Arman Travel' },
      { nombre: 'Post-Venta - Agradecimiento', categoria: 'post_venta', audiencia: 'cliente', orden: 80,
        asunto: 'Como fue tu experiencia con nosotros?',
        cuerpo: 'Hola {{nombre}},\n\nEsperamos que hayas disfrutado mucho tu viaje. Para nosotros es muy importante saber como fue tu experiencia.\n\nNos podes contar como te fue? Cualquier comentario, sugerencia o foto que quieras compartirnos lo recibimos con muchas ganas.\n\nGracias por elegirnos. Esperamos que el proximo viaje tambien lo hagamos juntos.\n\nUn abrazo,\nEquipo Arman Travel' },
      { nombre: 'Reactivacion - Contacto Dormido', categoria: 'dormido', audiencia: 'cliente', orden: 90,
        asunto: 'Te extranamos! Nuevos destinos para vos - Arman Travel',
        cuerpo: 'Hola {{nombre}},\n\nHace un tiempo que no hablamos y queriamos saber como estas.\n\nEn Arman Travel seguimos sumando destinos y experiencias increibles. Tenemos novedades que seguro te van a interesar.\n\nSi en algun momento volves a pensar en un viaje, acordate que estamos aca para ayudarte. Solo respondé este mail y retomamos la conversacion donde la dejamos.\n\nTe mandamos un saludo grande,\nEquipo Arman Travel' },
      { nombre: 'Solicitud de Cotizacion a Proveedor', categoria: 'cotizacion', audiencia: 'proveedor', orden: 10,
        asunto: 'Solicitud de cotizacion - Arman Travel',
        cuerpo: 'Estimados,\n\nLes escribimos desde Arman Travel para solicitar una cotizacion con las siguientes condiciones:\n\n- Destino:\n- Fechas:\n- Cantidad de pasajeros:\n- Categoria / Tipo de servicio:\n\nAgradeceremos nos envien la propuesta a la brevedad junto con condiciones comerciales, formas de pago y politica de cancelacion.\n\nQuedamos a la espera de su respuesta.\n\nSaludos cordiales,\nEquipo Arman Travel' },
      { nombre: 'Confirmacion de Reserva a Proveedor', categoria: 'reserva', audiencia: 'proveedor', orden: 20,
        asunto: 'Confirmacion de reserva - Arman Travel',
        cuerpo: 'Estimados,\n\nConfirmamos la reserva de los servicios cotizados oportunamente, segun los siguientes datos:\n\n- Pasajeros:\n- Fechas:\n- Servicios:\n- Referencia / Localizador:\n\nAgradecemos confirmar recepcion y enviar los vouchers correspondientes.\n\nSaludos cordiales,\nEquipo Arman Travel' },
      { nombre: 'Consulta de Disponibilidad', categoria: 'consulta', audiencia: 'proveedor', orden: 30,
        asunto: 'Consulta de disponibilidad - Arman Travel',
        cuerpo: 'Estimados,\n\nQuisieramos consultar disponibilidad para los siguientes servicios:\n\n- Destino / Producto:\n- Fechas:\n- Pasajeros:\n\nSi tienen disponibilidad, agradeceremos nos confirmen tarifa neta y condiciones.\n\nMuchas gracias,\nEquipo Arman Travel' },
      { nombre: 'Reclamo / Seguimiento Pendiente', categoria: 'reclamo', audiencia: 'proveedor', orden: 40,
        asunto: 'Pendiente de respuesta - Arman Travel',
        cuerpo: 'Estimados,\n\nNos comunicamos para hacer seguimiento de un tema que quedo pendiente y necesitamos resolver:\n\n- Referencia:\n- Asunto:\n- Detalle:\n\nAgradecemos nos contacten a la brevedad para poder dar una respuesta a nuestro cliente.\n\nQuedamos a la espera,\nEquipo Arman Travel' },
    ];
    for (const t of mailFactory) {
      await db.query(
        `INSERT INTO mail_templates (nombre, asunto, cuerpo, categoria, audiencia, is_factory, orden, created_by)
         SELECT $1, $2, $3, $4, $5, TRUE, $6, 'system'
         WHERE NOT EXISTS (SELECT 1 FROM mail_templates WHERE nombre = $1 AND is_factory = TRUE)`,
        [t.nombre, t.asunto, t.cuerpo, t.categoria, t.audiencia, t.orden]
      );
    }
    console.log('[migrate] mail_templates ready (' + mailFactory.length + ' factory templates seeded)');

    // ─── pgcrypto (necesario para gen_random_uuid; tolerar fallo de permisos) ──
    try { await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`); }
    catch (e) { console.warn('[migrate] pgcrypto no disponible, customers_global UUID requerira otro mecanismo:', e.message); }

    // ─── Multi-vertical bootstrap (tech / paybridge / admin_core) ─────────
    try {
      const { bootstrapVerticalSchemas } = require('./schemas');
      await bootstrapVerticalSchemas();
    } catch (e) {
      console.error('[migrate] bootstrapVerticalSchemas FAILED:', e.message);
    }

    // ─── Identidad global de cliente cross-vertical ───────────────────────
    try {
      await db.query(`ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS global_customer_id UUID`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_public_contactos_global ON public.contactos(global_customer_id)`);
    } catch (e) { console.warn('[migrate] alter public.contactos:', e.message); }

    // ─── Seed admin inicial si no existe ningun usuario ──────────────────
    const bcrypt = require('bcryptjs');
    const { rows: userCount } = await db.query(`SELECT COUNT(*)::int AS n FROM admin_core.users`);
    if (userCount[0].n === 0) {
      const email = process.env.SEED_ADMIN_EMAIL || 'admin@arman.local';
      const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        `INSERT INTO admin_core.users (email, nombre, password_hash, rol, verticales, activo)
         VALUES ($1, 'Administrador', $2, 'admin', '["tech","travel","paybridge","admin"]'::jsonb, TRUE)
         ON CONFLICT (email) DO NOTHING`,
        [email, hash]
      );
      console.log(`[migrate] Admin sembrado: ${email} / password en SEED_ADMIN_PASSWORD (cambiar al primer login)`);
    }

  } catch (e) {
    console.error('[migrate] Error (non-fatal):', e.message);
  }
}

module.exports = { runMigrations };
