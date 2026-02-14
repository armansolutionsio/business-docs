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
      const launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      };

      // Solo usar executablePath si está configurado (para Docker/Linux)
      // Si no está configurado, Playwright usará su bundled chromium (portable)
      if (process.env.CHROMIUM_PATH) {
        launchOptions.executablePath = process.env.CHROMIUM_PATH;
      }

      browser = await playwright.chromium.launch(launchOptions);
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
