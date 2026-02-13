const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const DataValidator = require('./dataValidator');
const AssetProcessor = require('./assetProcessor');
const HTMLtoPDFRenderer = require('./htmltoPdfRenderer');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', function(value) {
  if (!value && value !== 0) return '0,00';
  const num = parseFloat(value);
  const formatted = num.toFixed(2);
  const parts = formatted.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + parts[1];
});

Handlebars.registerHelper('multiply', function(a, b) {
  return parseFloat(a) * parseFloat(b);
});

Handlebars.registerHelper('sum', function(values) {
  if (!Array.isArray(values)) return 0;
  return values.reduce((acc, val) => acc + parseFloat(val || 0), 0);
});

Handlebars.registerHelper('dateFormat', function(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
});

Handlebars.registerHelper('numberToText', function(num) {
  // Basic number to text conversion for Argentina
  const units = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const scales = ['', 'mil', 'millón', 'mil millones'];
  
  if (!num && num !== 0) return '';
  const n = Math.floor(num);
  if (n === 0) return units[0];
  
  let result = '';
  let scaleIdx = 0;
  let remaining = n;
  
  while (remaining > 0 && scaleIdx < scales.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      let chunkText = '';
      if (chunk >= 100) {
        const hundreds = Math.floor(chunk / 100);
        chunkText += hundreds === 1 ? 'ciento' : units[hundreds] + 'cientos';
        remaining = chunk % 100;
        if (remaining > 0) chunkText += ' ';
      } else {
        remaining = chunk;
      }
      
      if (remaining >= 20) {
        const tensDigit = Math.floor(remaining / 10);
        const onesDigit = remaining % 10;
        chunkText += tens[tensDigit];
        if (onesDigit > 0) chunkText += ' y ' + units[onesDigit];
      } else if (remaining >= 10) {
        chunkText += teens[remaining - 10];
      } else if (remaining > 0) {
        chunkText += units[remaining];
      }
      
      if (scales[scaleIdx]) chunkText += ' ' + scales[scaleIdx];
      result = chunkText + (result ? ' ' + result : '');
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }
  
  return result.trim();
});

Handlebars.registerHelper('if_eq', function(a, b, options) {
  if (a === b) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

Handlebars.registerHelper('if_gt', function(a, b, options) {
  if (parseFloat(a) > parseFloat(b)) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

Handlebars.registerHelper('imageWidth', function(size) {
  const sizes = {
    'small': '300px',
    'medium': '500px',
    'large': '700px'
  };
  return sizes[size] || sizes['medium'];
});

/**
 * DocumentRenderer - Central orchestration for document generation
 * Validates data → Processes assets → Renders template → Generates PDF/Word
 */
class DocumentRenderer {
  constructor() {
    this.templatesDir = path.join(__dirname, '..', '..', 'templates');
    this.templates = {};
  }

  /**
   * Load and compile a template
   * @param {string} templateName - 'invoice', 'receipt', 'quote'
   * @returns {Function} Compiled Handlebars template function
   */
  loadTemplate(templateName) {
    if (!this.templates[templateName]) {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
      }
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      this.templates[templateName] = Handlebars.compile(templateContent);
    }
    return this.templates[templateName];
  }

  /**
   * Process assets and convert them to data URLs for embedding in HTML
   * @param {Object} assets - { logo, signature, qr, photo } as data URLs or Buffers
   * @returns {Object} Processed assets with data URLs
   */
  async processAssets(assets = {}) {
    const processed = {};

    // Helper to convert input (Buffer, data URL, or base64) to Buffer
    const toBuffer = (input) => {
      if (Buffer.isBuffer(input)) return input;
      if (typeof input === 'string') {
        // If it's a data URL, extract base64 part
        if (input.startsWith('data:')) {
          const base64 = input.split(',')[1];
          return Buffer.from(base64, 'base64');
        }
        // If it's raw base64
        return Buffer.from(input, 'base64');
      }
      return null;
    };

    try {
      if (assets.logo) {
        const logoBuffer = toBuffer(assets.logo);
        if (logoBuffer) {
          const processed_logo = await AssetProcessor.processLogo(logoBuffer);
          processed.logo = {
            dataUrl: AssetProcessor.bufferToDataUrl(processed_logo.buffer, processed_logo.format),
            width: processed_logo.width,
            height: processed_logo.height,
          };
        }
      }

      if (assets.signature) {
        const sigBuffer = toBuffer(assets.signature);
        if (sigBuffer) {
          const processed_sig = await AssetProcessor.processSignature(sigBuffer);
          processed.signature = {
            dataUrl: AssetProcessor.bufferToDataUrl(processed_sig.buffer, processed_sig.format),
            width: processed_sig.width,
            height: processed_sig.height,
          };
        }
      }

      if (assets.qr) {
        const qrBuffer = toBuffer(assets.qr);
        if (qrBuffer) {
          const processed_qr = await AssetProcessor.processQR(qrBuffer);
          processed.qr = {
            dataUrl: AssetProcessor.bufferToDataUrl(processed_qr.buffer, processed_qr.format),
            width: processed_qr.width,
            height: processed_qr.height,
          };
        }
      }

      if (assets.photo) {
        const photoBuffer = toBuffer(assets.photo);
        if (photoBuffer) {
          const processed_photo = await AssetProcessor.processPhoto(photoBuffer);
          processed.photo = {
            dataUrl: AssetProcessor.bufferToDataUrl(processed_photo.buffer, processed_photo.format),
            width: processed_photo.width,
            height: processed_photo.height,
          };
        }
      }

      // Process travel images (flight, hotel, transfer)
      if (assets.images && typeof assets.images === 'object') {
        processed.images = {};
        
        if (assets.images.flight) {
          const flightBuffer = toBuffer(assets.images.flight);
          if (flightBuffer) {
            const processed_flight = await AssetProcessor.processPhoto(flightBuffer);
            processed.images.flight = AssetProcessor.bufferToDataUrl(processed_flight.buffer, processed_flight.format);
          }
        }
        
        if (assets.images.hotel) {
          const hotelBuffer = toBuffer(assets.images.hotel);
          if (hotelBuffer) {
            const processed_hotel = await AssetProcessor.processPhoto(hotelBuffer);
            processed.images.hotel = AssetProcessor.bufferToDataUrl(processed_hotel.buffer, processed_hotel.format);
          }
        }
        
        if (assets.images.transfer) {
          const transferBuffer = toBuffer(assets.images.transfer);
          if (transferBuffer) {
            const processed_transfer = await AssetProcessor.processPhoto(transferBuffer);
            processed.images.transfer = AssetProcessor.bufferToDataUrl(processed_transfer.buffer, processed_transfer.format);
          }
        }
      }
    } catch (error) {
      console.error('Error processing assets:', error);
      // Continue without the problematic asset
    }

    return processed;
  }

  /**
   * Main render method - orchestrates entire document generation pipeline
   * @param {Object} options - { type, format, data, assets, landscape }
   *   - type: 'invoice', 'receipt', 'quote'
   *   - format: 'pdf' or 'word'
   *   - data: document data object
   *   - assets: { logo, signature, qr, photo } - optional, as Buffers or { buffer, name }
   *   - landscape: boolean - for PDF only, default false
   * @returns {Buffer} PDF or Word document buffer
   */
  async render(options = {}) {
    const { type, format = 'pdf', data = {}, assets = {}, landscape = false } = options;

    // Validation
    if (!type || !['invoice', 'receipt', 'quote'].includes(type)) {
      throw new Error('Invalid document type. Must be: invoice, receipt, quote');
    }

    if (!['pdf', 'word'].includes(format)) {
      throw new Error('Invalid format. Must be: pdf or word');
    }

    // Validate data
    const validation = DataValidator.validate(type, data);
    if (!validation.ok) {
      throw new Error(`Data validation failed: ${validation.errors.join('; ')}`);
    }

    // Sanitize data
    const sanitized = DataValidator.sanitize(data);

    // Process assets
    const processedAssets = await this.processAssets(assets);

    // Merge data with processed assets
    const renderData = {
      ...sanitized,
      ...processedAssets,
    };

    if (format === 'pdf') {
      return await this.renderPDF(type, renderData, landscape);
    } else if (format === 'word') {
      return await this.renderWord(type, renderData);
    }
  }

  /**
   * Render to PDF using Playwright
   * @private
   */
  async renderPDF(type, data, landscape = false) {
    const template = this.loadTemplate(type);
    const templateHtml = template(data);

    // Load base CSS
    const csPath = path.join(this.templatesDir, 'styles.css');
    const baseStyles = fs.readFileSync(csPath, 'utf-8');

    // Wrap rendered HTML with styles
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${type}</title>
        <style>
          ${baseStyles}
        </style>
      </head>
      <body>
        ${templateHtml}
      </body>
      </html>
    `;

    // Render to PDF
    const pdfBuffer = await HTMLtoPDFRenderer.render(fullHtml, {
      format: 'A4',
      landscape: landscape,
      margin: {
        top: 10,
        right: 15,
        bottom: 10,
        left: 15,
      },
    });

    return pdfBuffer;
  }

  /**
   * Render to Word using docxtemplater
   * @private
   */
  async renderWord(type, data) {
    // Fallback: generar como PDF si se solicita Word
    // (La implementación completa de Word requiere plantillas .docx diseñadas)
    console.warn('Word generation not fully implemented, generating PDF instead');
    return await this.renderPDF(type, data, false);
  }
}

module.exports = new DocumentRenderer();
