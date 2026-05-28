const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const DataValidator = require('./dataValidator');
const AssetProcessor = require('./assetProcessor');
const HTMLtoPDFRenderer = require('./htmltoPdfRenderer');
const { branding } = require('@arman/sdk');

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

Handlebars.registerHelper('numberToText', function(num, optionsOrCurrency) {
  // Full number-to-Spanish-text conversion for Argentina, with decimals and currency
  const units = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function convertChunk(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    let text = '';
    if (n >= 100) {
      text += hundreds[Math.floor(n / 100)];
      n = n % 100;
      if (n > 0) text += ' ';
    }
    if (n >= 21 && n <= 29) {
      text += 'veinti' + units[n - 20];
    } else if (n >= 20) {
      text += tens[Math.floor(n / 10)];
      if (n % 10 > 0) text += ' y ' + units[n % 10];
    } else if (n >= 10) {
      text += teens[n - 10];
    } else if (n > 0) {
      text += units[n];
    }
    return text;
  }

  function integerToText(n) {
    if (n === 0) return 'cero';
    if (n < 0) return 'menos ' + integerToText(-n);
    let result = '';
    // Millones
    const millions = Math.floor(n / 1000000);
    if (millions > 0) {
      result += (millions === 1 ? 'un millón' : convertChunk(millions) + ' millones');
      n = n % 1000000;
      if (n > 0) result += ' ';
    }
    // Miles
    const thousands = Math.floor(n / 1000);
    if (thousands > 0) {
      result += (thousands === 1 ? 'mil' : convertChunk(thousands) + ' mil');
      n = n % 1000;
      if (n > 0) result += ' ';
    }
    // Unidades
    if (n > 0) {
      result += convertChunk(n);
    }
    return result;
  }

  if (!num && num !== 0) return '';
  const amount = parseFloat(num);
  const intPart = Math.floor(Math.abs(amount));
  const decPart = Math.round((Math.abs(amount) - intPart) * 100);

  let text = integerToText(intPart);
  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Determine currency from Handlebars context or explicit param
  let currency = '';
  if (typeof optionsOrCurrency === 'string') {
    currency = optionsOrCurrency;
  } else if (optionsOrCurrency && optionsOrCurrency.hash && optionsOrCurrency.hash.currency) {
    currency = optionsOrCurrency.hash.currency;
  }

  if (decPart > 0) {
    text += ' con ' + String(decPart).padStart(2, '0') + '/100';
  }

  return text;
});

Handlebars.registerHelper('add1', function(val) {
  return parseInt(val) + 1;
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
    this.templatesDir = path.join(__dirname, '..', '..', '..', 'templates');
    this.templates = {};
  }

  /**
   * Load and compile a template
   * @param {string} templateName - 'invoice', 'receipt', 'quote'
   * @returns {Function} Compiled Handlebars template function
   */
  loadTemplate(templateName) {
    const templatePath = path.join(this.templatesDir, `${templateName}.html`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    // SIEMPRE recargar template en desarrollo (no cachear)
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    this.templates[templateName] = Handlebars.compile(templateContent);
    console.log(`[DocumentRenderer] Template loaded: ${templateName} (${templatePath})`);

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
        console.log('[AssetProcessor] Processing travel images:', Object.keys(assets.images));

        if (assets.images.flight) {
          try {
            const flightBuffer = toBuffer(assets.images.flight);
            if (flightBuffer) {
              const processed_flight = await AssetProcessor.processPhoto(flightBuffer);
              processed.images.flight = AssetProcessor.bufferToDataUrl(processed_flight.buffer, processed_flight.format);
              console.log('[AssetProcessor] Flight image processed successfully');
            }
          } catch (err) {
            console.error('[AssetProcessor] Error processing flight image:', err.message);
          }
        }

        if (assets.images.hotel) {
          try {
            const hotelBuffer = toBuffer(assets.images.hotel);
            if (hotelBuffer) {
              const processed_hotel = await AssetProcessor.processPhoto(hotelBuffer);
              processed.images.hotel = AssetProcessor.bufferToDataUrl(processed_hotel.buffer, processed_hotel.format);
              console.log('[AssetProcessor] Hotel image processed successfully');
            }
          } catch (err) {
            console.error('[AssetProcessor] Error processing hotel image:', err.message);
          }
        }

        if (assets.images.transfer) {
          try {
            const transferBuffer = toBuffer(assets.images.transfer);
            if (transferBuffer) {
              const processed_transfer = await AssetProcessor.processPhoto(transferBuffer);
              processed.images.transfer = AssetProcessor.bufferToDataUrl(processed_transfer.buffer, processed_transfer.format);
              console.log('[AssetProcessor] Transfer image processed successfully');
            }
          } catch (err) {
            console.error('[AssetProcessor] Error processing transfer image:', err.message);
          }
        }
      }

      // Process category images (dynamic sections)
      if (assets.categoryImages && typeof assets.categoryImages === 'object') {
        processed.categoryImages = {};
        console.log('[AssetProcessor] Processing category images:', Object.keys(assets.categoryImages));

        for (const [slug, imgObj] of Object.entries(assets.categoryImages)) {
          try {
            const imgData = typeof imgObj === 'string' ? imgObj : imgObj.data;
            const imgSize = typeof imgObj === 'object' ? (imgObj.size || 'medium') : 'medium';
            const buffer = toBuffer(imgData);
            if (buffer) {
              const processedImg = await AssetProcessor.processPhoto(buffer);
              processed.categoryImages[slug] = {
                data: AssetProcessor.bufferToDataUrl(processedImg.buffer, processedImg.format),
                size: imgSize
              };
              console.log(`[AssetProcessor] Category image '${slug}' processed successfully`);
            }
          } catch (err) {
            console.error(`[AssetProcessor] Error processing category image '${slug}':`, err.message);
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
    if (!type || !['invoice', 'receipt', 'quote', 'quote-tech', 'voucher'].includes(type)) {
      throw new Error('Invalid document type. Must be: invoice, receipt, quote, quote-tech, voucher');
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

    // Inject processed images into multi-instance categoryDetails arrays for all categories
    if (renderData.categoryDetails && renderData.categoryImages) {
      const categorySlugs = ['aereos', 'hoteles', 'packs', 'vip', 'traslados', 'tours', 'seguros', 'otros'];
      categorySlugs.forEach(slug => {
        if (Array.isArray(renderData.categoryDetails[slug])) {
          renderData.categoryDetails[slug].forEach((entry, idx) => {
            const imgKey = slug + '_' + idx;
            // Imagen única
            if (renderData.categoryImages[imgKey]) {
              entry._image = renderData.categoryImages[imgKey];
            }
            // Múltiples imágenes (packs)
            const multiImages = [];
            for (let imgIdx = 0; imgIdx < 20; imgIdx++) {
              const mKey = imgKey + '_img_' + imgIdx;
              if (renderData.categoryImages[mKey]) {
                multiImages.push(renderData.categoryImages[mKey]);
              }
            }
            if (multiImages.length > 0) {
              entry._images = multiImages;
            }
          });
        }
      });
    }

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

    // Wrap rendered HTML with styles and CSS variables from branding package
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${type}</title>
        <style>
          :root {
            --brand-primary: ${branding.colors.primary};
            --brand-primary-dark: ${branding.colors.primaryDark};
          }
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
