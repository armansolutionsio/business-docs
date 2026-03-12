import { useState } from 'react';
import { generateQuotePdf } from '../api.js';

export default function QuoteModal({ lead, party, onClose, onSuccess }) {
  const [form, setForm] = useState({
    clientName: party?.full_name || '',
    clientCUIT: party?.doc_number_normalized || '',
    clientEmail: party?.email || '',
    clientPhone: party?.phone || '',
    destination: lead?.destination || '',
    quoteNumber: '',
    validUntil: '',
    currency: 'ARS',
    notes: '',
    items: [{ description: '', quantity: 1, price: '' }],
    discount: '',
    ivaRate: '0',
    otherTaxes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setItem(index, field, value) {
    setForm(f => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      return { ...f, items };
    });
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, price: '' }] }));
  }

  function removeItem(index) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const idempotencyKey = `quote-${lead.id}-${Date.now()}`;
      const payload = {
        type: 'quote',
        data: {
          ...form,
          items: form.items.map(it => ({
            ...it,
            quantity: Number(it.quantity),
            price: Number(it.price),
          })),
          discount: Number(form.discount || 0),
          ivaRate: Number(form.ivaRate || 0) / 100,
          otherTaxes: Number(form.otherTaxes || 0),
          leadId: lead.id,
        },
      };

      const { blob, docRefId } = await generateQuotePdf(payload, idempotencyKey);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion_${form.quoteNumber || Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      onSuccess({ docRefId });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const subtotal = form.items.reduce((s, it) => s + (Number(it.quantity || 1) * Number(it.price || 0)), 0);
  const discount = Number(form.discount || 0);
  const taxableBase = subtotal - discount;
  const iva = Math.round(taxableBase * (Number(form.ivaRate || 0) / 100) * 100) / 100;
  const otherTaxes = Number(form.otherTaxes || 0);
  const total = taxableBase + iva + otherTaxes;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generar Cotización</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form modal-form-scroll">
          <h3 className="form-section-title">Cliente</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Nombre</label>
              <input value={form.clientName} onChange={e => setField('clientName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>CUIT / DNI</label>
              <input value={form.clientCUIT} onChange={e => setField('clientCUIT', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.clientEmail} onChange={e => setField('clientEmail', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input value={form.clientPhone} onChange={e => setField('clientPhone', e.target.value)} />
            </div>
          </div>

          <h3 className="form-section-title">Cotización</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Nro. Cotización</label>
              <input value={form.quoteNumber} onChange={e => setField('quoteNumber', e.target.value)} placeholder="Se asigna automáticamente" />
            </div>
            <div className="form-group">
              <label>Válida hasta</label>
              <input type="date" value={form.validUntil} onChange={e => setField('validUntil', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Moneda</label>
              <select value={form.currency} onChange={e => setField('currency', e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Destino</label>
            <input value={form.destination} onChange={e => setField('destination', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Notas / Condiciones</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
          </div>

          <h3 className="form-section-title">Ítems</h3>
          {form.items.map((item, i) => (
            <div key={i} className="item-row">
              <div className="form-group form-group-flex">
                <label>Descripción</label>
                <input
                  required
                  value={item.description}
                  onChange={e => setItem(i, 'description', e.target.value)}
                  placeholder="ej. Vuelo BUE-CUN"
                />
              </div>
              <div className="form-group form-group-sm">
                <label>Cant.</label>
                <input
                  type="number" min="1"
                  value={item.quantity}
                  onChange={e => setItem(i, 'quantity', e.target.value)}
                />
              </div>
              <div className="form-group form-group-sm">
                <label>Precio</label>
                <input
                  type="number" min="0" step="0.01"
                  value={item.price}
                  onChange={e => setItem(i, 'price', e.target.value)}
                />
              </div>
              {form.items.length > 1 && (
                <button type="button" className="btn-icon" onClick={() => removeItem(i)}>🗑</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>+ Ítem</button>

          <h3 className="form-section-title">Impuestos</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Descuento</label>
              <input type="number" min="0" step="0.01" value={form.discount} onChange={e => setField('discount', e.target.value)} />
            </div>
            <div className="form-group">
              <label>IVA %</label>
              <input type="number" min="0" max="100" step="0.01" value={form.ivaRate} onChange={e => setField('ivaRate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Otros impuestos</label>
              <input type="number" min="0" step="0.01" value={form.otherTaxes} onChange={e => setField('otherTaxes', e.target.value)} />
            </div>
          </div>

          <div className="totals-preview">
            <div className="totals-row"><span>Subtotal:</span><span>{subtotal.toFixed(2)}</span></div>
            {discount > 0 && <div className="totals-row"><span>Descuento:</span><span>-{discount.toFixed(2)}</span></div>}
            <div className="totals-row"><span>Base imponible:</span><span>{taxableBase.toFixed(2)}</span></div>
            {iva > 0 && <div className="totals-row"><span>IVA ({form.ivaRate}%):</span><span>{iva.toFixed(2)}</span></div>}
            {otherTaxes > 0 && <div className="totals-row"><span>Otros:</span><span>{otherTaxes.toFixed(2)}</span></div>}
            <div className="totals-row totals-row-total"><span>TOTAL {form.currency}:</span><span>{total.toFixed(2)}</span></div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Generando PDF...' : 'Generar y Descargar PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
