-- Crea la base de datos de tests si no existe
SELECT 'CREATE DATABASE arman_core_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'arman_core_test')\gexec
