@echo off
REM Script para iniciar la aplicación Arman Travel en Windows

echo.
echo ===============================================
echo     Arman Travel - Sistema de Documentos
echo ===============================================
echo.

REM Navegar a la raiz del monorepo (dos niveles arriba de apps/business-docs)
cd /d "%~dp0..\.."

echo [*] Verificando dependencias...
if not exist "node_modules\" (
    echo [!] Instalando dependencias...
    call npm install
)

echo.
echo [+] Iniciando servidor en http://localhost:3001
echo [+] Presiona Ctrl+C para detener
echo.

npm run start:docs

pause
