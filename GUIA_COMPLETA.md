# 📖 Guía Completa de Uso - Arman Travel

## Tabla de Contenidos
1. [Inicio Rápido](#inicio-rápido)
2. [Interfaz de Usuario](#interfaz-de-usuario)
3. [Guía Detallada por Documento](#guía-detallada-por-documento)
4. [Preguntas Frecuentes](#preguntas-frecuentes)
5. [Solución de Problemas](#solución-de-problemas)

---

## 🚀 Inicio Rápido

### Para Usuarios de Windows

**Opción 1: Doble clic (más simple)**
```
Haz doble clic en: iniciar.bat
```

**Opción 2: Línea de comandos**
```powershell
cd "c:\Users\sanag\Downloads\arman\Github arman\business-docs"
npm start
```

### Abrir la Aplicación

Una vez que veas el mensaje:
```
✓ Servidor corriendo en http://localhost:3001
✓ Aplicación Arman Travel iniciada
```

Abre tu navegador e ingresa: **http://localhost:3001**

---

## 🎨 Interfaz de Usuario

### Estructura Principal

```
┌─────────────────────────────────────────────────┐
│  Arman Travel                                   │
│  Sistema de Gestión de Documentos               │
├─────────────────────────────────────────────────┤
│ [FACTURA] [RECIBO] [REMITO] [COTIZACIÓN] [...] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Formulario dinámico según documento            │
│                                                 │
│  [📄 Descargar PDF] [📋 Descargar Word]        │
└─────────────────────────────────────────────────┘
```

### Colores de la Marca
- 🟦 **Azul Primario**: #4B6B9B (encabezados)
- 🟩 **Turquesa**: #1FA3B0 (acentos y botones)
- Estos colores aparecen en todos los documentos

---

## 📋 Guía Detallada por Documento

### FACTURA

**¿Para qué se usa?**
Documento oficial de venta que acredita la transacción comercial.

**Campos Requeridos (*):**
- ✅ Número de Factura*
- ✅ Fecha*
- ✅ Nombre del Cliente*
- ❌ DNI/CUIT del Cliente
- ❌ Teléfono del Cliente

**Sección de Items:**
- Descripción del producto/servicio*
- Cantidad (por defecto 1)
- Precio*

**Ejemplo de Factura:**
```
Factura Nº: F-2026-001
Fecha: 12/02/2026
Cliente: Juan García - DNI: 30-12345678-5
Teléfono: +54 9 11 1234-5678

Items:
- Asesoramiento: 1 × $500.00 = $500.00
- Consultoría: 3 × $250.00 = $750.00

Total: $1250.00
```

**Consejo:** Usa números secuenciales para las facturas.

---

### RECIBO

**¿Para qué se usa?**
Comprobante de pago recibido por la empresa.

**Campos Requeridos (*):**
- ✅ Número de Recibo*
- ✅ Fecha*
- ✅ Recibimos de (nombre de quien paga)*
- ✅ Concepto de Pago*
- ✅ Monto*

**No tiene items** - Es un documento simple.

**Ejemplo de Recibo:**
```
Recibo Nº: R-2026-001
Fecha: 12/02/2026

Recibimos de: Empresa ABC S.A.
Concepto: Pago por servicios de consultoría
Monto: $2000.00
```

**Consejo:** Mantén una secuencia de números para control.

---

### REMITO

**¿Para qué se usa?**
Nota de entrega de productos o servicios.

**Campos Requeridos (*):**
- ✅ Número de Remito*
- ✅ Fecha*
- ✅ Destinatario*
- ❌ Observaciones

**Sección de Items:**
- Descripción*
- Cantidad*

**Ejemplo de Remito:**
```
Remito Nº: REM-2026-001
Fecha: 12/02/2026
Destinatario: Centro de Distribución Norte

Items:
- Documentación Comercial: 50
- Manual de Procedimientos: 25

Observaciones: Conforme a orden de compra.
```

**Consejo:** Usa para controlar entregas y stock.

---

### COTIZACIÓN

**¿Para qué se usa?**
Oferta de precios para un cliente interesado.

**Campos Requeridos (*):**
- ✅ Número de Cotización*
- ✅ Fecha*
- ✅ Solicitante*
- ❌ Vigencia (ej: 30 días)

**Sección de Items:**
- Descripción del servicio*
- Precio*

**Ejemplo de Cotización:**
```
Cotización Nº: COT-2026-001
Fecha: 12/02/2026
Vigencia: 30 días
Solicitante: María López

Items:
- Paquete Viaje a Córdoba: $8500.00
- Paquete Viaje a Salta: $9200.00

Total: $17700.00
```

**Consejo:** Incluye vigencia para que el cliente sepa cuánto tiempo es válida.

---

### PRESUPUESTO

**¿Para qué se usa?**
Plan detallado de costos para un proyecto o servicio.

**Campos Requeridos (*):**
- ✅ Número de Presupuesto*
- ✅ Fecha*
- ✅ Cliente*
- ❌ Descripción del Proyecto

**Sección de Items:**
- Descripción del rubro*
- Precio*

**Ejemplo de Presupuesto:**
```
Presupuesto Nº: PRES-2026-001
Fecha: 12/02/2026
Cliente: Empresa Turística del Sur

Proyecto: Desarrollo plataforma web

Items:
- Desarrollo del Sistema: $15000.00
- Diseño de Interfaz: $5000.00
- Testing: $3000.00

Presupuesto Total: $23000.00
```

**Consejo:** Desglosa los costos por rubros para claridad.

---

### PROPUESTA

**¿Para qué se usa?**
Presentación formal de una solución a un problema del cliente.

**Campos Requeridos (*):**
- ✅ Número de Propuesta*
- ✅ Fecha*
- ✅ Para (cliente)*
- ❌ Resumen Ejecutivo
- ❌ Solución Propuesta
- ❌ Inversión

**No tiene items** - Campos de texto extenso.

**Ejemplo de Propuesta:**
```
Propuesta Nº: PROP-2026-001
Fecha: 12/02/2026
Para: Grupo de Turismo Patagónico

Resumen: Transformación digital para mejorar 
experiencia del cliente.

Solución: Sistema integral de gestión de viajes 
con reservas online, panel administrativo e 
integración con proveedores.

Inversión: $35000.00
```

**Consejo:** Haz el resumen atractivo y claro.

---

## ❓ Preguntas Frecuentes

### P: ¿Cómo agrego mi logo a los documentos?
**R:** 
1. Guarda tu logo (PNG o JPG) como `logo.png`
2. Colócalo en la carpeta `public/`
3. El logo aparecerá en los próximos documentos generados

### P: ¿Puedo editar los documentos después de descargarlos?
**R:** 
- **PDF**: Se puede ver pero es difícil editar. Diseñado para imprimir/compartir.
- **Word**: Sí, puedes editar en Microsoft Word, Google Docs, etc.

### P: ¿Los documentos se guardan en la nube?
**R:** No, todo se genera localmente. Los documentos se descargan a tu computadora. Nada se guarda en servidores.

### P: ¿Puedo cambiar los colores de la marca?
**R:** Sí, puedes editar el archivo `src/utils/documentGenerator.js` línea 10-17 con tus colores.

### P: ¿Necesito internet para usar la aplicación?
**R:** No, funciona completamente offline en tu computadora local.

### P: ¿Puedo agregar más tipos de documentos?
**R:** Sí, el sistema es extensible. Contacta al equipo de desarrollo.

---

## 🔧 Solución de Problemas

### El servidor no inicia
**Solución:**
```powershell
# 1. Verifica que Node.js está instalado
node --version

# 2. Reinstala las dependencias
npm install

# 3. Intenta iniciar nuevamente
npm start
```

### Puerto 3001 ya está en uso
**Solución:**

Opción A: Cambiar puerto en `.env`:
```
PORT=3002
```

Opción B: Terminar proceso en el puerto:
```powershell
# Buscar proceso
netstat -ano | findstr :3001

# Terminar proceso (reemplaza PID)
taskkill /PID [PID] /F
```

### Los documentos no se descargan
**Solución:**
1. Revisa la consola del navegador (F12)
2. Verifica que todos los campos requeridos estén completos
3. Intenta en otro navegador (Chrome, Edge, Firefox)

### El logo no aparece en los documentos
**Solución:**
1. Verifica que `logo.png` esté en la carpeta `public/`
2. Reinicia el servidor
3. Limpia el caché del navegador (Ctrl+Shift+Del)

### Error: "Cannot find module"
**Solución:**
```powershell
# Reinstalar todas las dependencias
npm install --force
```

---

## 📞 Soporte

Para más información o soporte técnico, contacta a:
- **Equipo**: Arman Solutions S.R.L
- **Marca**: Arman Travel

---

**¡Gracias por usar Arman Travel!** ✈️
