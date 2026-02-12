const playwright = require('playwright');
let browser = null;

/**
 * Convierte HTML a PDF usando Playwright
 */
class HTMLtoPDFRenderer {
  /**
   * Inicializa el navegador
   */
  static async initialize() {
    if (!browser) {
      browser = await playwright.chromium.launch({
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }
    return browser;
  }

  /**
   * Renderiza HTML a PDF
   */
  static async render(html, options = {}) {
    try {
      const { format = 'A4', landscape = false, margin = {} } = options;

      const defaultMargin = {
        top: '10mm',
        right: '15mm',
        bottom: '10mm',
        left: '15mm',
        ...margin
      };

      await this.initialize();

      const page = await browser.newPage();

      // Cargar CSS de impresión
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { size: ${format}${landscape ? ' landscape' : ''}; margin: ${defaultMargin.top} ${defaultMargin.right} ${defaultMargin.bottom} ${defaultMargin.left}; }
            @media print { body { margin: 0; padding: 0; } }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      await page.setContent(fullHtml, { waitUntil: 'networkidle' });

      const pdf = await page.pdf({
        format,
        landscape,
        margin: defaultMargin,
        printBackground: true,
        displayHeaderFooter: false
      });

      await page.close();

      return pdf;
    } catch (error) {
      throw new Error(`PDF rendering failed: ${error.message}`);
    }
  }

  /**
   * Cierra el navegador
   */
  static async close() {
    if (browser) {
      await browser.close();
      browser = null;
    }
  }
}

// Cerrar navegador al salir
process.on('exit', async () => {
  await HTMLtoPDFRenderer.close();
});

module.exports = HTMLtoPDFRenderer;
