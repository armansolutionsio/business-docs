# Arman Travel - Sistema de Gestión de Documentos

Sistema web para generar documentos comerciales profesionales con el branding de **Arman Travel** (Arman Solutions S.R.L).

## 📋 Documentos Soportados

- ✅ **FACTURA** - Facturas de venta
- ✅ **RECIBO** - Recibos de pago
- ✅ **REMITO** - Notas de entrega
- ✅ **COTIZACIÓN** - Cotizaciones de precios
- ✅ **PRESUPUESTO** - Presupuestos de proyectos
- ✅ **PROPUESTA** - Propuestas comerciales

## 🎨 Características

- **Branding Consistente**: Todos los documentos usan los colores y estilos de Arman Travel
- **Interfaz Intuitiva**: Pestañas para acceder a cada tipo de documento
- **Generación Rápida**: Crea documentos en segundos
- **Exportación Dual**: Descarga en PDF o Word (.docx)
- **Responsive Design**: Funciona en desktop, tablet y móvil
- **Items Dinámicos**: Agrega múltiples artículos/servicios con cálculo automático de totales

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js 14+ instalado
- npm (incluido con Node.js)

### Pasos de Instalación

1. **Navega a la carpeta del proyecto**
```bash
cd "c:\Users\sanag\Downloads\arman\Github arman\business-docs"
```

2. **Instala las dependencias** (si ya no las instalaste)
```bash
npm install
```

3. **Inicia el servidor**
```bash
npm start
```

4. **Abre tu navegador**
```
http://localhost:3001
```

¡Listo! La aplicación está ejecutándose.

## 📝 Cómo Usar

### Crear un Documento

1. Selecciona el tipo de documento en la pestaña superior
2. Completa los campos requeridos (marcados con *)
3. Si es un documento con items (Factura, Remito, Cotización, Presupuesto):
   - Ingresa la descripción, cantidad y precio
   - Haz clic en "+ Agregar"
   - El total se calcula automáticamente
4. Descarga en tu formato preferido:
   - **PDF**: Para imprimir o compartir digitalmente
   - **Word**: Para editar después si lo necesitas

### Campos por Documento

**FACTURA**
- Número de factura
- Fecha
- Datos del cliente (nombre, DNI/CUIT, teléfono)
- Items con descripción, cantidad y precio

**RECIBO**
- Número de recibo
- Fecha
- Nombre de quien paga
- Concepto de pago
- Monto total

**REMITO**
- Número de remito
- Fecha
- Destinatario
- Items con descripción y cantidad
- Observaciones opcionales

**COTIZACIÓN**
- Número de cotización
- Fecha
- Solicitante
- Vigencia
- Items con descripción y precio

**PRESUPUESTO**
- Número de presupuesto
- Fecha
- Cliente
- Descripción del proyecto
- Items con detalles

**PROPUESTA**
- Número de propuesta
- Fecha
- Cliente (Para)
- Resumen ejecutivo
- Solución propuesta
- Inversión total

## 🎨 Colores de la Marca

- **Azul Principal**: #4B6B9B
- **Turquesa Secundario**: #1FA3B0
- **Turquesa Oscuro**: #2D8A99

## 📦 Tecnologías Utilizadas

- **Backend**: Node.js con Express.js
- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Generación PDF**: PDFKit
- **Generación Word**: docx
- **Otros**: CORS, dotenv

## 🔧 Estructura de Carpetas

```
business-docs/
├── src/
│   ├── server.js           # Servidor Express
│   ├── routes/
│   │   └── documents.js    # Rutas de documentos
│   └── utils/
│       └── documentGenerator.js  # Generador de PDF/Word
├── public/
│   ├── index.html          # Interfaz web
│   ├── app.js              # Lógica de frontend
│   └── logo.png            # Logo de Arman Travel
├── package.json
├── .env                    # Variables de entorno
└── README.md              # Este archivo
```

## 🐛 Solución de Problemas

### Puerto 3001 ya está en uso
Si el puerto 3001 está ocupado, puedes cambiar el puerto en el archivo `.env`:
```
PORT=3002
```

### Los documentos no se descargan
- Verifica que el navegador no esté bloqueando descargas
- Revisa la consola del navegador (F12) para ver errores

### Error al generar PDF
- Asegúrate de que Node.js está correctamente instalado
- Intenta desinstalar y reinstalar las dependencias:
```bash
npm install
```

## 📞 Soporte

Para problemas o sugerencias, contacta al equipo de Arman Solutions.

## 📄 Licencia

Desarrollado para Arman Solutions S.R.L - 2026

---

**¡Disfruta generando tus documentos profesionales con Arman Travel!** 🚀
