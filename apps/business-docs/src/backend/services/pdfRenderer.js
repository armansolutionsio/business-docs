// Render de PDFs profesionales para cotizaciones/facturas/recibos.
// Stack: Handlebars (template) + Playwright (Chromium headless → PDF).
// Lazy-load de Playwright para no bloquear el boot si Chromium no esta disponible.

const Handlebars = require('handlebars');

let _browserPromise = null;
async function getBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const { chromium } = require('playwright');
    return chromium.launch({ args: ['--no-sandbox'] });
  })();
  return _browserPromise;
}

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #1a1a2e; font-size: 12px; padding: 36px 42px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1c2c52; padding-bottom: 16px; margin-bottom: 24px; }
  .header .brand h1 { font-size: 22px; color: #1c2c52; margin-bottom: 4px; }
  .header .brand p { color: #6e82a9; font-size: 11px; }
  .header .doc-meta { text-align: right; }
  .header .doc-meta .doc-type { background: #1c2c52; color: white; padding: 4px 14px; border-radius: 4px; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; display: inline-block; margin-bottom: 8px; }
  .header .doc-meta .doc-num { font-size: 18px; font-weight: 600; color: #1c2c52; }
  .header .doc-meta .doc-date { color: #6e82a9; font-size: 11px; margin-top: 2px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 22px; }
  .party { background: #f5f7fb; padding: 14px; border-radius: 6px; border-left: 3px solid #1c2c52; }
  .party .label { font-size: 9px; color: #8ea0c2; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; }
  .party .name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .party .data { color: #555; font-size: 11px; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th { background: #1c2c52; color: white; padding: 9px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  td { padding: 8px 10px; border-bottom: 1px solid #eaeaf0; font-size: 12px; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 320px; margin-top: 10px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 10px; }
  .totals .row.grand { background: #1c2c52; color: white; font-size: 14px; font-weight: 700; border-radius: 4px; margin-top: 6px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eaeaf0; color: #8ea0c2; font-size: 10px; text-align: center; }
  .footer .cae { margin-top: 6px; font-family: 'Courier New', monospace; color: #1c2c52; }
  .badge-cae { display: inline-block; background: #163a2a; color: #7fe6b1; padding: 3px 10px; border-radius: 4px; font-size: 10px; margin-top: 4px; }
`;

const cotizacionTpl = Handlebars.compile(`
<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
  <div class="header">
    <div class="brand">
      <h1>{{empresa.nombre}}</h1>
      <p>{{empresa.tagline}}</p>
      <p>CUIT: {{empresa.cuit}} · {{empresa.direccion}}</p>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Cotización</div>
      <div class="doc-num">{{numero}}</div>
      <div class="doc-date">Emitida: {{fecha}}</div>
      {{#if validez_dias}}<div class="doc-date">Válida por: {{validez_dias}} días</div>{{/if}}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Cliente</div>
      <div class="name">{{cliente.nombre}}</div>
      <div class="data">
        {{#if cliente.razon_social}}{{cliente.razon_social}}<br>{{/if}}
        {{#if cliente.cuit}}CUIT: {{cliente.cuit}}<br>{{/if}}
        {{#if cliente.email}}{{cliente.email}}<br>{{/if}}
        {{#if cliente.direccion}}{{cliente.direccion}}{{/if}}
      </div>
    </div>
    <div class="party">
      <div class="label">Modalidad</div>
      <div class="name">{{moneda}}</div>
      <div class="data">Estado: {{estado}}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Descripción</th><th>Cant.</th><th>P.unitario</th><th>IVA%</th><th class="num">Total</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{descripcion}}{{#if categoria}} <span style="color:#8ea0c2;font-size:10px">[{{categoria}}]</span>{{/if}}</td>
        <td class="num">{{cantidad}}</td>
        <td class="num">{{fmtMoney precio_unitario ../moneda}}</td>
        <td class="num">{{iva_pct}}%</td>
        <td class="num">{{fmtMoney total ../moneda}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>{{fmtMoney subtotal moneda}}</span></div>
    <div class="row"><span>IVA</span><span>{{fmtMoney iva moneda}}</span></div>
    <div class="row grand"><span>TOTAL</span><span>{{fmtMoney total moneda}}</span></div>
  </div>

  <div class="footer">
    <div>Documento generado por {{empresa.nombre}} · {{fecha}}</div>
    <div>Esta cotización no constituye factura.</div>
  </div>
</body></html>
`);

const facturaTpl = Handlebars.compile(`
<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
  <div class="header">
    <div class="brand">
      <h1>{{empresa.nombre}}</h1>
      <p>{{empresa.tagline}}</p>
      <p>CUIT: {{empresa.cuit}} · IVA: {{empresa.condicion_iva}}</p>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Factura {{tipo}}</div>
      <div class="doc-num">{{punto_venta_str}}-{{numero}}</div>
      <div class="doc-date">Fecha: {{fecha}}</div>
      {{#if cae}}<span class="badge-cae">CAE autorizado</span>{{/if}}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Receptor</div>
      <div class="name">{{cliente.nombre}}</div>
      <div class="data">
        {{#if cliente.razon_social}}{{cliente.razon_social}}<br>{{/if}}
        {{#if cliente.cuit}}CUIT: {{cliente.cuit}}<br>{{/if}}
        {{#if cliente.condicion_iva}}{{cliente.condicion_iva}}{{/if}}
      </div>
    </div>
    <div class="party">
      <div class="label">Datos AFIP/ARCA</div>
      <div class="data">
        Tipo: {{tipo}} · PV: {{punto_venta}}<br>
        Estado: {{estado}}<br>
        {{#if cae}}CAE: {{cae}}<br>Vto CAE: {{cae_vencimiento}}{{/if}}
      </div>
    </div>
  </div>

  <table>
    <thead><tr><th>Descripción</th><th>Cant.</th><th>P.unitario</th><th>IVA%</th><th class="num">Total</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{descripcion}}</td>
        <td class="num">{{cantidad}}</td>
        <td class="num">{{fmtMoney precio_unitario ../moneda}}</td>
        <td class="num">{{iva_pct}}%</td>
        <td class="num">{{fmtMoney total ../moneda}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>{{fmtMoney subtotal moneda}}</span></div>
    <div class="row"><span>IVA</span><span>{{fmtMoney iva moneda}}</span></div>
    <div class="row grand"><span>TOTAL</span><span>{{fmtMoney total moneda}}</span></div>
  </div>

  <div class="footer">
    {{#if cae}}<div class="cae">CAE: {{cae}} · Vencimiento: {{cae_vencimiento}}</div>{{/if}}
    <div>Comprobante autorizado por AFIP/ARCA</div>
  </div>
</body></html>
`);

const reciboTpl = Handlebars.compile(`
<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
  <div class="header">
    <div class="brand">
      <h1>{{empresa.nombre}}</h1>
      <p>{{empresa.tagline}}</p>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Recibo</div>
      <div class="doc-num">{{numero}}</div>
      <div class="doc-date">{{fecha}}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party" style="grid-column: 1 / -1">
      <div class="label">Recibimos de</div>
      <div class="name">{{cliente.nombre}}</div>
      <div class="data">{{#if cliente.cuit}}CUIT: {{cliente.cuit}}{{/if}}</div>
    </div>
  </div>

  <div style="background:#f5f7fb;padding:18px;border-radius:6px;margin-bottom:18px">
    <div style="font-size:10px;color:#8ea0c2;text-transform:uppercase;letter-spacing:1.5px">Concepto</div>
    <div style="margin-top:6px;font-size:13px">{{concepto}}</div>
  </div>

  <div style="background:#1c2c52;color:white;padding:18px 22px;border-radius:6px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8">Importe recibido</div>
      <div style="font-size:11px;opacity:.7;margin-top:2px">Método: {{metodo}}</div>
    </div>
    <div style="font-size:24px;font-weight:700">{{fmtMoney monto moneda}}</div>
  </div>

  <div class="footer">
    <div>Documento generado por {{empresa.nombre}}</div>
  </div>
</body></html>
`);

Handlebars.registerHelper('fmtMoney', (val, currency) => {
  const c = currency || 'ARS';
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c }).format(Number(val || 0)); }
  catch { return `${c} ${Number(val || 0).toFixed(2)}`; }
});

const EMPRESA_DEFAULT = {
  nombre: process.env.EMPRESA_NOMBRE || 'Arman Solutions',
  tagline: process.env.EMPRESA_TAGLINE || 'Consultora de software',
  cuit: process.env.ARCA_CUIT || '20999999991',
  direccion: process.env.EMPRESA_DIRECCION || '',
  condicion_iva: process.env.EMPRESA_IVA || 'Responsable Inscripto',
};

async function renderHtmlToPdf(html) {
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await ctx.close();
  return pdf;
}

async function renderCotizacion(data) {
  const html = cotizacionTpl({ empresa: EMPRESA_DEFAULT, ...data });
  return renderHtmlToPdf(html);
}

async function renderFactura(data) {
  const pv = String(data.punto_venta || 1).padStart(5, '0');
  const html = facturaTpl({ empresa: EMPRESA_DEFAULT, punto_venta_str: pv, ...data });
  return renderHtmlToPdf(html);
}

async function renderRecibo(data) {
  const html = reciboTpl({ empresa: EMPRESA_DEFAULT, ...data });
  return renderHtmlToPdf(html);
}

module.exports = { renderCotizacion, renderFactura, renderRecibo, renderHtmlToPdf };
