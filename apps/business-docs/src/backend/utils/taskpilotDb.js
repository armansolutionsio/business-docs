// Schema `taskpilot` (tablas de TaskPilot) y cuentas de Redmine.
//
// - ensureSchema() corre en el boot (migrate.js): crea el schema y las tablas si faltan y
//   siembra las cuentas de Redmine desde REDMINE_SEED_<ALIAS>_LOGIN / _API_KEY. Las keys se
//   guardan cifradas (utils/secrets.js); mientras la variable exista en el entorno, el entorno
//   manda y pisa lo que haya en la base.
// - task_state guarda la etapa del pipeline de TaskPilot, separada del estado de Redmine.

const db = require('./db');
const log = require('./logger');
const { encrypt, decrypt } = require('./secrets');

const ETAPAS = ['pendiente', 'analizando', 'en_ejecucion', 'pendiente_validacion', 'lista_registrar', 'registrada'];
const ETAPA_LABEL = {
  pendiente: 'Pendiente',
  analizando: 'Analizando con Claude',
  en_ejecucion: 'En ejecución',
  pendiente_validacion: 'Pendiente de validación',
  lista_registrar: 'Lista para registrar',
  registrada: 'Registrada',
};

const SQL = `
  CREATE SCHEMA IF NOT EXISTS taskpilot;

  CREATE TABLE IF NOT EXISTS taskpilot.redmine_accounts (
    alias            VARCHAR(40) PRIMARY KEY,
    login            VARCHAR(120) NOT NULL,
    redmine_user_id  INTEGER,
    nombre           VARCHAR(200),
    api_key_enc      TEXT NOT NULL,
    user_id          INTEGER REFERENCES admin_core.users(id) ON DELETE SET NULL,
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    last_ok_at       TIMESTAMPTZ,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS taskpilot.redmine_projects (
    id          INTEGER PRIMARY KEY,
    identifier  VARCHAR(120),
    name        VARCHAR(255) NOT NULL,
    parent_id   INTEGER,
    status      INTEGER,
    visible_to  JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw         JSONB,
    updated_on  TIMESTAMPTZ,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- tipo: status | tracker | priority | activity | user
  CREATE TABLE IF NOT EXISTS taskpilot.redmine_catalogs (
    tipo       VARCHAR(40) NOT NULL,
    id         INTEGER NOT NULL,
    nombre     VARCHAR(200) NOT NULL,
    extra      JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tipo, id)
  );

  CREATE TABLE IF NOT EXISTS taskpilot.issues (
    id               INTEGER PRIMARY KEY,
    project_id       INTEGER,
    project_name     VARCHAR(255),
    tracker_id       INTEGER,
    tracker          VARCHAR(120),
    status_id        INTEGER,
    status           VARCHAR(120),
    is_closed        BOOLEAN NOT NULL DEFAULT FALSE,
    priority_id      INTEGER,
    priority         VARCHAR(60),
    author_id        INTEGER,
    author           VARCHAR(200),
    assigned_to_id   INTEGER,
    assigned_to      VARCHAR(200),
    subject          TEXT NOT NULL,
    description      TEXT,
    start_date       DATE,
    due_date         DATE,
    done_ratio       INTEGER,
    estimated_hours  NUMERIC(8,2),
    spent_hours      NUMERIC(8,2),
    fixed_version    VARCHAR(200),
    parent_id        INTEGER,
    custom_fields    JSONB NOT NULL DEFAULT '[]'::jsonb,
    visible_to       JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw              JSONB,
    created_on       TIMESTAMPTZ,
    updated_on       TIMESTAMPTZ,
    closed_on        TIMESTAMPTZ,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_issues_assigned ON taskpilot.issues (assigned_to_id) WHERE NOT is_closed;
  CREATE INDEX IF NOT EXISTS idx_tp_issues_status   ON taskpilot.issues (status_id);
  CREATE INDEX IF NOT EXISTS idx_tp_issues_project  ON taskpilot.issues (project_id);
  CREATE INDEX IF NOT EXISTS idx_tp_issues_updated  ON taskpilot.issues (updated_on DESC);
  CREATE INDEX IF NOT EXISTS idx_tp_issues_visible  ON taskpilot.issues USING GIN (visible_to);

  CREATE TABLE IF NOT EXISTS taskpilot.issue_journals (
    id             INTEGER PRIMARY KEY,
    issue_id       INTEGER NOT NULL REFERENCES taskpilot.issues(id) ON DELETE CASCADE,
    user_id        INTEGER,
    user_name      VARCHAR(200),
    notes          TEXT,
    details        JSONB NOT NULL DEFAULT '[]'::jsonb,
    private_notes  BOOLEAN NOT NULL DEFAULT FALSE,
    created_on     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_tp_journals_issue ON taskpilot.issue_journals (issue_id, created_on);

  CREATE TABLE IF NOT EXISTS taskpilot.task_state (
    issue_id     INTEGER PRIMARY KEY REFERENCES taskpilot.issues(id) ON DELETE CASCADE,
    etapa        VARCHAR(40) NOT NULL DEFAULT 'pendiente'
                 CHECK (etapa IN ('pendiente','analizando','en_ejecucion','pendiente_validacion','lista_registrar','registrada')),
    owner_alias  VARCHAR(40),
    repo         VARCHAR(200),
    model        VARCHAR(80),
    notas        TEXT,
    updated_by   VARCHAR(120),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_task_state_etapa ON taskpilot.task_state (etapa);

  -- Contexto que el equipo carga para Claude: 'global' (todas las tareas) y 'repo:<nombre>'.
  CREATE TABLE IF NOT EXISTS taskpilot.contexts (
    key         VARCHAR(160) PRIMARY KEY,
    contenido   TEXT NOT NULL DEFAULT '',
    updated_by  VARCHAR(120),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Horas cargadas en Redmine por cada cuenta del equipo (time entries, solo lectura).
  CREATE TABLE IF NOT EXISTS taskpilot.time_entries (
    id            INTEGER PRIMARY KEY,
    alias         VARCHAR(40) NOT NULL,
    user_id       INTEGER,
    user_name     VARCHAR(200),
    issue_id      INTEGER,
    project_id    INTEGER,
    project_name  VARCHAR(255),
    activity_id   INTEGER,
    activity      VARCHAR(120),
    hours         NUMERIC(8,2) NOT NULL DEFAULT 0,
    comments      TEXT,
    spent_on      DATE,
    created_on    TIMESTAMPTZ,
    updated_on    TIMESTAMPTZ,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_te_alias_date ON taskpilot.time_entries (alias, spent_on);
  CREATE INDEX IF NOT EXISTS idx_tp_te_issue ON taskpilot.time_entries (issue_id);

  CREATE TABLE IF NOT EXISTS taskpilot.sync_log (
    id             SERIAL PRIMARY KEY,
    trigger        VARCHAR(20) NOT NULL,
    inicio         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fin            TIMESTAMPTZ,
    ok             BOOLEAN,
    full_sync      BOOLEAN NOT NULL DEFAULT FALSE,
    issues_upsert  INTEGER NOT NULL DEFAULT 0,
    detalle        JSONB NOT NULL DEFAULT '{}'::jsonb,
    error          TEXT
  );

  -- ── Fase 2: ejecucion con Claude (runner en la PC de cada dev) ──────────────

  -- Un runner por maquina. Se autentica con un token (hash aca, el token se muestra una vez).
  CREATE TABLE IF NOT EXISTS taskpilot.runners (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(120) NOT NULL,
    alias         VARCHAR(40),
    token_hash    TEXT NOT NULL UNIQUE,
    host          VARCHAR(200),
    version       VARCHAR(40),
    repos         JSONB NOT NULL DEFAULT '[]'::jsonb,
    models        JSONB NOT NULL DEFAULT '[]'::jsonb,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at  TIMESTAMPTZ,
    created_by    VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Limites de uso del plan de Claude que reporta cada runner (ventanas de 5 horas y 7 dias).
  ALTER TABLE taskpilot.runners ADD COLUMN IF NOT EXISTS limits JSONB;
  ALTER TABLE taskpilot.runners ADD COLUMN IF NOT EXISTS limits_at TIMESTAMPTZ;
  ALTER TABLE taskpilot.runners ADD COLUMN IF NOT EXISTS account JSONB;

  -- Una sesion = un chat persistente de una tarea con Claude en un runner.
  CREATE TABLE IF NOT EXISTS taskpilot.sessions (
    id                SERIAL PRIMARY KEY,
    issue_id          INTEGER NOT NULL REFERENCES taskpilot.issues(id) ON DELETE CASCADE,
    alias             VARCHAR(40),
    runner_id         INTEGER REFERENCES taskpilot.runners(id) ON DELETE SET NULL,
    repo              VARCHAR(200),
    model             VARCHAR(80),
    estado            VARCHAR(30) NOT NULL DEFAULT 'esperando_runner'
                      CHECK (estado IN ('esperando_runner','trabajando','esperando_usuario','finalizada','error','cancelada')),
    fase              VARCHAR(20) NOT NULL DEFAULT 'plan' CHECK (fase IN ('plan','ejecucion','informe')),
    sdk_session_id    VARCHAR(120),
    plan_aprobado_at  TIMESTAMPTZ,
    plan_aprobado_por VARCHAR(120),
    costo_usd         NUMERIC(10,4) NOT NULL DEFAULT 0,
    duracion_ms       BIGINT NOT NULL DEFAULT 0,
    turnos            INTEGER NOT NULL DEFAULT 0,
    tokens_in         BIGINT NOT NULL DEFAULT 0,
    tokens_out        BIGINT NOT NULL DEFAULT 0,
    ultimo_error      TEXT,
    created_by        VARCHAR(120),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_tp_sessions_issue ON taskpilot.sessions (issue_id, id DESC);
  -- auth: suscripcion (login de Claude Code, sin costo aparte) | api_key (se factura por token)
  ALTER TABLE taskpilot.sessions ADD COLUMN IF NOT EXISTS auth VARCHAR(20);

  -- rol: user | assistant | tool | system | approval | result | error
  CREATE TABLE IF NOT EXISTS taskpilot.messages (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES taskpilot.sessions(id) ON DELETE CASCADE,
    rol         VARCHAR(20) NOT NULL,
    contenido   TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_messages_session ON taskpilot.messages (session_id, id);

  -- tipo: plan (aprobar el plan propuesto) | tool (una operacion sensible durante la ejecucion)
  CREATE TABLE IF NOT EXISTS taskpilot.approvals (
    id           SERIAL PRIMARY KEY,
    session_id   INTEGER NOT NULL REFERENCES taskpilot.sessions(id) ON DELETE CASCADE,
    tipo         VARCHAR(20) NOT NULL DEFAULT 'tool',
    tool         VARCHAR(80),
    input        JSONB,
    descripcion  TEXT,
    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','aprobado','rechazado','expirado')),
    motivo       TEXT,
    decidido_por VARCHAR(120),
    decidido_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_approvals_session ON taskpilot.approvals (session_id, estado, id);

  CREATE TABLE IF NOT EXISTS taskpilot.reports (
    id                    SERIAL PRIMARY KEY,
    session_id            INTEGER NOT NULL REFERENCES taskpilot.sessions(id) ON DELETE CASCADE,
    resumen               TEXT,
    resultado             TEXT,
    archivos              JSONB NOT NULL DEFAULT '[]'::jsonb,
    pruebas_automaticas   TEXT,
    testing_manual        TEXT,
    errores_pendientes    TEXT,
    comentario_propuesto  TEXT,
    minutos_estimados     INTEGER,
    requiere_testing      BOOLEAN,
    commit_message        TEXT,
    tipo_actividad        VARCHAR(80),
    raw                   JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tp_reports_session ON taskpilot.reports (session_id, id DESC);

  -- Cola de trabajo para los runners (long polling). tipo: start | message | approve_plan | cancel
  CREATE TABLE IF NOT EXISTS taskpilot.jobs (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES taskpilot.sessions(id) ON DELETE CASCADE,
    runner_id   INTEGER NOT NULL REFERENCES taskpilot.runners(id) ON DELETE CASCADE,
    tipo        VARCHAR(20) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','tomado','hecho','error')),
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    taken_at    TIMESTAMPTZ,
    done_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_tp_jobs_runner ON taskpilot.jobs (runner_id, estado, id);
  -- Jobs del runner sin sesion (por ej. "limits": consultar los limites del plan).
  ALTER TABLE taskpilot.jobs ALTER COLUMN session_id DROP NOT NULL;
`;

function envAccounts() {
  const out = [];
  for (const [k, v] of Object.entries(process.env)) {
    const m = k.match(/^REDMINE_SEED_([A-Z0-9_]+)_API_KEY$/);
    if (!m || !v || !v.trim()) continue;
    const alias = m[1].toLowerCase();
    out.push({ alias, login: (process.env[`REDMINE_SEED_${m[1]}_LOGIN`] || alias).trim(), apiKey: v.trim() });
  }
  return out;
}

async function seedAccountsFromEnv() {
  const accounts = envAccounts();
  for (const a of accounts) {
    await db.query(
      `INSERT INTO taskpilot.redmine_accounts (alias, login, api_key_enc)
       VALUES ($1, $2, $3)
       ON CONFLICT (alias) DO UPDATE SET login = EXCLUDED.login, api_key_enc = EXCLUDED.api_key_enc, updated_at = NOW()`,
      [a.alias, a.login, encrypt(a.apiKey)]
    );
  }
  if (accounts.length) log.debug('taskpilot_accounts_seeded', { aliases: accounts.map((a) => a.alias) });
}

async function ensureSchema() {
  await db.query(SQL);
  await seedAccountsFromEnv();
}

// Cuentas sin la key (para la UI) o con la key descifrada (para llamar a Redmine).
async function getAccounts({ withKeys = false, onlyActive = true } = {}) {
  const { rows } = await db.query(
    `SELECT alias, login, redmine_user_id, nombre, user_id, activo, last_ok_at, last_error, api_key_enc
       FROM taskpilot.redmine_accounts ${onlyActive ? 'WHERE activo' : ''} ORDER BY alias`
  );
  return rows.map(({ api_key_enc, ...rest }) => (withKeys ? { ...rest, apiKey: decrypt(api_key_enc) } : rest));
}

async function updateAccount(alias, fields) {
  const sets = [];
  const params = [];
  for (const k of ['redmine_user_id', 'nombre', 'user_id', 'activo', 'last_ok_at', 'last_error']) {
    if (fields[k] === undefined) continue;
    params.push(fields[k]);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) return;
  params.push(alias);
  await db.query(`UPDATE taskpilot.redmine_accounts SET ${sets.join(', ')}, updated_at = NOW() WHERE alias = $${params.length}`, params);
}

module.exports = { ETAPAS, ETAPA_LABEL, ensureSchema, getAccounts, updateAccount };
