-- Import CSV data into beta_contactos
-- Run after init.sql; expects /docker-entrypoint-initdb.d/data.csv mounted

CREATE TEMP TABLE csv_import (
    numero_envio       TEXT,
    telefonos_destinatario TEXT,
    provincia_destinatario TEXT,
    codigo_postal_destinatario TEXT,
    localidad_destinatario TEXT,
    domicilio_destinatario TEXT,
    nombre_destinatario TEXT,
    dni_destinatario    TEXT,
    email_destinatario  TEXT,
    latitud_domicilio   TEXT,
    longitud_domicilio  TEXT
);

COPY csv_import FROM '/docker-entrypoint-initdb.d/data.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO beta_contactos (telefono, provincia, codigo_postal, localidad, domicilio, nombre, dni, email, latitud, longitud, estado)
SELECT
    telefonos_destinatario,
    provincia_destinatario,
    codigo_postal_destinatario,
    localidad_destinatario,
    domicilio_destinatario,
    nombre_destinatario,
    NULLIF(dni_destinatario, 'null'),
    NULLIF(email_destinatario, 'null'),
    NULLIF(latitud_domicilio, 'null')::DOUBLE PRECISION,
    NULLIF(longitud_domicilio, 'null')::DOUBLE PRECISION,
    'contacto'
FROM csv_import;

DROP TABLE csv_import;
