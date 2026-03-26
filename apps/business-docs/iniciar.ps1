#!/usr/bin/env pwsh
# Script para iniciar la aplicación Arman Travel en Windows

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "     Arman Travel - Sistema de Documentos" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Navegar a la raiz del monorepo (dos niveles arriba de apps/business-docs)
$scriptPath = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$monorepoRoot = Split-Path -Parent -Path (Split-Path -Parent -Path $scriptPath)
Set-Location $monorepoRoot

Write-Host "[*] Verificando dependencias..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "[!] Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "[+] Iniciando servidor en http://localhost:3001" -ForegroundColor Green
Write-Host "[+] Presiona Ctrl+C para detener" -ForegroundColor Green
Write-Host ""

npm run start:docs
