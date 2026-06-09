// Render de PDFs profesionales para cotizaciones/facturas/recibos.
// Stack: Handlebars (template) + Playwright (Chromium headless → PDF).
// Lazy-load de Playwright para no bloquear el boot si Chromium no esta disponible.

const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const log = require('../utils/logger');

// Logo PayBridge cargado una sola vez como data URI para embeber en el PDF.
let _logoPayBridge = '';
try {
  // __dirname = .../apps/business-docs/src/backend/services → subir 3 a apps/business-docs/
  const logoPath = path.join(__dirname, '../../../public/Logo PayBridge.png');
  _logoPayBridge = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  log.debug('paybridge_logo_loaded', { kb: Math.round(_logoPayBridge.length / 1024) });
} catch (e) {
  log.warn('paybridge_logo_load_failed', { error: e.message });
}

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

Handlebars.registerHelper('fmtDate', (val) => {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('es-AR'); } catch { return String(val); }
});

Handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));
Handlebars.registerHelper('eq', (a, b) => a === b);

const statementTpl = Handlebars.compile(`
<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}
  .header { padding-bottom: 14px; }
  /* +0.5cm de alto (~19px) y +1cm de ancho (~38px) respecto al tamaño anterior. */
  .header .brand img { height: 111px; min-width: 285px; width: auto; display: block; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .stat { background: #f5f7fb; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #1c2c52; }
  .stat .lbl { font-size: 9px; color: #8ea0c2; text-transform: uppercase; letter-spacing: 1.1px; }
  .stat .val { font-size: 14px; font-weight: 700; color: #1c2c52; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .stat .sub { font-size: 9px; color: #6e82a9; margin-top: 2px; }
  .by-cur { margin-bottom: 18px; }
  .by-cur h4 { font-size: 11px; color: #6e82a9; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
  .small-tbl th { font-size: 9px; padding: 6px 8px; }
  .small-tbl td { font-size: 10px; padding: 5px 8px; }
  .dolarapp-box { background: #f5f7fb; border-radius: 8px; padding: 14px 18px; margin-top: 14px; border-left: 4px solid #10b981; }
  .dolarapp-box .row-line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .dolarapp-box .row-line.deduction { color: #b91c1c; }
  .dolarapp-box .row-line.total { font-weight: 700; font-size: 14px; border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 8px; color: #065f46; }
  .insight-box { background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-top: 12px; }
  .insight-box h4 { font-size: 11px; color: #1c2c52; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .insight-box .delta-pos { color: #065f46; }
  .insight-box .delta-neg { color: #b91c1c; }
</style></head><body>
  <div class="header">
    <div class="brand">
      {{#if logoPayBridge}}<img src="{{logoPayBridge}}" alt="PayBridge"/>{{/if}}
    </div>
    <div class="doc-meta">
      <div class="doc-type">Estado de cuenta</div>
      <div class="doc-num">#{{cliente.id}}</div>
      <div class="doc-date">Emitido: {{fecha}}</div>
      <div class="doc-date">Período: {{periodo.desde}} → {{periodo.hasta}}</div>
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
        {{#if cliente.pais}}{{cliente.pais}}{{/if}}
      </div>
    </div>
    <div class="party">
      <div class="label">DolarApp / ARQ</div>
      <div class="data">
        {{#if dolarapp_info.has_data}}
          {{#if dolarapp_info.titular}}Titular: <b>{{dolarapp_info.titular}}</b><br>{{/if}}
          {{#if dolarapp_info.alias}}Alias: <b>{{dolarapp_info.alias}}</b><br>{{/if}}
          {{#if dolarapp_info.cvu}}CVU: <code>{{dolarapp_info.cvu}}</code><br>{{/if}}
          {{#if dolarapp_info.cbu}}CBU: <code>{{dolarapp_info.cbu}}</code><br>{{/if}}
          {{#if dolarapp_info.numero_cuenta}}Nº cuenta: <code>{{dolarapp_info.numero_cuenta}}</code><br>{{/if}}
          {{#if dolarapp_info.email}}{{dolarapp_info.email}}{{/if}}
        {{else}}
          <span style="color:#94a3b8;font-style:italic">Sin info</span>
        {{/if}}
      </div>
    </div>
  </div>

  <h3 style="font-size:13px;color:#1c2c52;margin-bottom:8px">Resumen del período</h3>
  <div class="stat-grid">
    <div class="stat"><div class="lbl">Transacciones</div><div class="val">{{totales.cantidad}}</div></div>
    <div class="stat"><div class="lbl">Monedas</div><div class="val">{{totales.monedas}}</div></div>
    <div class="stat"><div class="lbl">Países pagadores</div><div class="val">{{totales.paises}}</div></div>
    {{#if kpis.avg}}
      <div class="stat"><div class="lbl">Promedio bruto</div>
        <div class="val">{{kpis.avg.str}}</div>
        <div class="sub">moneda principal: {{kpis.avg.moneda}}</div></div>
    {{/if}}
    {{#if kpis.topCurrency}}
      <div class="stat"><div class="lbl">Moneda principal</div>
        <div class="val">{{kpis.topCurrency.moneda}}</div>
        <div class="sub">{{kpis.topCurrency.pct}}% del bruto · {{kpis.topCurrency.cantidad}} tx</div></div>
    {{/if}}
    {{#if kpis.topCountry}}
      <div class="stat"><div class="lbl">País dominante</div>
        <div class="val">{{kpis.topCountry.pais}}</div>
        <div class="sub">{{kpis.topCountry.cantidad}} cobros ({{kpis.topCountry.pct}}%)</div></div>
    {{/if}}
    {{#if kpis.peakMonth}}
      <div class="stat"><div class="lbl">Mes pico</div>
        <div class="val">{{kpis.peakMonth.mes}}</div>
        <div class="sub">{{kpis.peakMonth.bruto_str}}</div></div>
    {{/if}}
    {{#if kpis.trend}}
      <div class="stat"><div class="lbl">Variación vs período previo</div>
        <div class="val {{#if kpis.trend.positive}}delta-pos{{else}}delta-neg{{/if}}">{{kpis.trend.signo}}{{kpis.trend.pct}}%</div>
        <div class="sub">{{kpis.trend.previo_str}} → {{kpis.trend.actual_str}}</div></div>
    {{/if}}
    {{#if kpis.dailyAvg}}
      <div class="stat"><div class="lbl">Promedio diario</div>
        <div class="val">{{kpis.dailyAvg.str}}</div>
        <div class="sub">{{kpis.dailyAvg.dias}} días con cobro</div></div>
    {{/if}}
  </div>

  <div class="by-cur">
    <h4>Totales por moneda</h4>
    <table class="small-tbl">
      <thead><tr><th>Moneda</th><th class="num">Cant.</th><th class="num">Bruto</th>
        <th class="num">Fee Stripe</th><th class="num">% Fee</th><th class="num">Subtotal</th></tr></thead>
      <tbody>
        {{#each por_moneda}}
        <tr><td><b>{{moneda}}</b></td>
          <td class="num">{{cantidad}}</td>
          <td class="num">{{fmtMoney bruto moneda}}</td>
          <td class="num">{{fmtMoney fee moneda}}</td>
          <td class="num">{{fee_pct}}%</td>
          <td class="num"><b>{{fmtMoney neto moneda}}</b></td></tr>
        {{/each}}
        {{#unless por_moneda}}
          <tr><td colspan="6" style="text-align:center;color:#8ea0c2;padding:14px">Sin transacciones en el período</td></tr>
        {{/unless}}
      </tbody>
    </table>
    <div style="font-size:10px;color:#6e82a9;margin-top:4px">
      Subtotal = Bruto − Fee Stripe. El % Fee es el efectivo (Fee Stripe / Bruto), promediado sobre los cobros del período.
    </div>
  </div>

  {{#if liquidacion}}
  <div class="dolarapp-box">
    <div style="font-size:10px;color:#065f46;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px"><b>Liquidación final · DolarApp / ARQ</b></div>

    {{#each liquidacion.por_moneda}}
      <div class="row-line"><span>Subtotal {{moneda}}</span><span><b>{{fmtMoney subtotal moneda}}</b></span></div>
      {{#if ../liquidacion.mostrar_paybridge_fee}}
        <div class="row-line {{#if (gt fee_paybridge 0)}}deduction{{/if}}">
          <span>Fee PayBridge ({{../liquidacion.paybridge_fee_pct}}%)</span>
          <span>{{#if (gt fee_paybridge 0)}}− {{/if}}{{fmtMoney fee_paybridge moneda}}</span>
        </div>
      {{/if}}
      {{#if (gt fee_dolarapp 0)}}
        <div class="row-line deduction">
          <span>Fee DolarApp (fijo por liquidación)</span>
          <span>− {{fmtMoney fee_dolarapp moneda}}</span>
        </div>
      {{/if}}
      <div class="row-line total"><span>Neto {{moneda}} a recibir</span><span>{{fmtMoney neto_final moneda}}</span></div>
      <div style="height:8px"></div>
    {{/each}}

    <div style="font-size:10px;color:#475569;margin-top:6px;border-top:1px dashed #cbd5e1;padding-top:6px">
      DolarApp descuenta USD 3,00 por liquidación al depositar en tu cuenta ARQ.
      Fee PayBridge ({{liquidacion.paybridge_fee_pct}}%) calculado sobre el subtotal de cada moneda{{#unless (gt liquidacion.paybridge_fee_pct 0)}} — sin cargo en este período{{/unless}}.
    </div>
  </div>
  {{/if}}

  {{#if insights.top3}}
  <div class="insight-box">
    <h4>Top 3 cobros del período</h4>
    <table class="small-tbl" style="margin-bottom:0">
      <thead><tr><th>Fecha</th><th>Moneda</th><th class="num">Bruto</th><th>País</th></tr></thead>
      <tbody>{{#each insights.top3}}<tr>
        <td>{{fmtDate fecha}}</td><td>{{moneda}}</td>
        <td class="num"><b>{{fmtMoney bruto moneda}}</b></td>
        <td>{{pais}}</td>
      </tr>{{/each}}</tbody>
    </table>
  </div>
  {{/if}}

  {{#if insights.cardBrand}}
  <div class="insight-box">
    <h4>Distribución por marca de tarjeta</h4>
    <table class="small-tbl" style="margin-bottom:0">
      <thead><tr><th>Marca</th><th class="num">Cobros</th><th class="num">% del total</th></tr></thead>
      <tbody>{{#each insights.cardBrand}}<tr>
        <td>{{brand}}</td><td class="num">{{cantidad}}</td><td class="num">{{pct}}%</td>
      </tr>{{/each}}</tbody>
    </table>
  </div>
  {{/if}}

  {{#if insights.weekday}}
  <div class="insight-box">
    <h4>Cobros por día de la semana</h4>
    <table class="small-tbl" style="margin-bottom:0">
      <thead><tr><th>Día</th><th class="num">Cobros</th><th class="num">Bruto (USD)</th></tr></thead>
      <tbody>{{#each insights.weekday}}<tr>
        <td>{{dia}}</td><td class="num">{{cantidad}}</td>
        <td class="num">{{fmtMoney bruto_usd 'USD'}}</td>
      </tr>{{/each}}</tbody>
    </table>
  </div>
  {{/if}}

  {{#if insights.avgPerCurrency}}
  <div class="insight-box">
    <h4>Promedio por moneda</h4>
    <table class="small-tbl" style="margin-bottom:0">
      <thead><tr><th>Moneda</th><th class="num">Cobros</th><th class="num">Promedio</th><th class="num">Mediana aprox.</th></tr></thead>
      <tbody>{{#each insights.avgPerCurrency}}<tr>
        <td><b>{{moneda}}</b></td><td class="num">{{cantidad}}</td>
        <td class="num">{{fmtMoney promedio moneda}}</td>
        <td class="num">{{fmtMoney mediana moneda}}</td>
      </tr>{{/each}}</tbody>
    </table>
  </div>
  {{/if}}

  {{#if links}}
  <div class="insight-box">
    <h4>{{links.titulo}}</h4>
    <table class="small-tbl" style="margin-bottom:6px">
      <thead><tr><th>Link</th><th>Descripción</th><th class="num">Monto</th>
        <th>Estado</th><th class="num">Cobros</th><th class="num">Bruto acumulado</th></tr></thead>
      <tbody>{{#each links.rows}}<tr>
        <td><a href="{{url}}" style="color:#1c2c52;text-decoration:none;font-weight:600">{{label}}</a></td>
        <td>{{descripcion}}{{#if multi_uso}} <span style="font-size:9px;color:#6e82a9">[multi]</span>{{/if}}</td>
        <td class="num"><b>{{fmtMoney monto moneda}}</b></td>
        <td>{{#if activo}}<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#065f46">activo</span>{{else}}<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#991b1b">{{estado}}</span>{{/if}}</td>
        <td class="num">{{cobros_completados}}</td>
        <td class="num">{{fmtMoney bruto_acumulado moneda}}</td>
      </tr>{{/each}}
      {{#unless links.rows}}
        <tr><td colspan="6" style="text-align:center;color:#8ea0c2;padding:14px">Sin links que coincidan con el filtro</td></tr>
      {{/unless}}
      </tbody>
    </table>
    {{#if links.rows}}
    <div style="font-size:10px;color:#1c2c52;margin-top:6px;border-top:1px solid #e2e8f0;padding-top:6px">
      <b>URLs:</b> hacé click para abrir, o click derecho → <i>Copy link address</i> para copiar.
      <ul style="list-style:none;padding:0;margin:6px 0 0">
      {{#each links.rows}}
        <li style="padding:3px 0;font-family:'Courier New', monospace;font-size:10px">
          <span style="color:#6e82a9">{{label}}:</span>
          <a href="{{url}}" style="color:#1c2c52;text-decoration:underline;word-break:break-all">{{url}}</a>
        </li>
      {{/each}}
      </ul>
    </div>
    {{/if}}
  </div>
  {{/if}}

  <h3 style="font-size:13px;color:#1c2c52;margin:18px 0 6px">Detalle de transacciones</h3>
  <table class="small-tbl">
    <thead><tr><th>Fecha</th><th>Disp.</th><th>Moneda</th>
      <th class="num">Bruto</th><th class="num">Fee</th><th class="num">% Fee</th>
      <th class="num">Neto</th><th>País tarjeta</th></tr></thead>
    <tbody>
      {{#each transactions}}
      <tr>
        <td>{{fmtDate completado_at}}</td>
        <td>{{fmtDate available_on_at}}</td>
        <td>{{moneda}}</td>
        <td class="num">{{fmtMoney monto_bruto moneda}}</td>
        <td class="num">{{fmtMoney fee moneda}}</td>
        <td class="num">{{fee_pct}}%</td>
        <td class="num">{{fmtMoney monto_neto moneda}}</td>
        <td>{{card_address_country}}</td>
      </tr>
      {{/each}}
      {{#unless transactions}}
        <tr><td colspan="8" style="text-align:center;color:#8ea0c2;padding:14px">Sin movimientos</td></tr>
      {{/unless}}
    </tbody>
  </table>

  <div class="footer">
    <div>Estado de cuenta generado el {{fecha}}.</div>
    <div>Las comisiones reflejan lo retenido por Stripe. DolarApp aplica un descuento fijo de USD 3 por liquidación al depositar en la cuenta ARQ.</div>
  </div>
</body></html>
`);

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

async function renderStatement(data) {
  const html = statementTpl({
    empresa: EMPRESA_DEFAULT,
    logoPayBridge: _logoPayBridge,
    ...data,
  });
  return renderHtmlToPdf(html);
}

module.exports = { renderCotizacion, renderFactura, renderRecibo, renderStatement, renderHtmlToPdf };
