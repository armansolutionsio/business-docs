import { useState } from 'react';
import { upsertParty, createSale, createSaleItem, updateLead } from '../api.js';

export default function CloseWonModal({ lead, onClose, onSuccess }) {
  const [form, setForm] = useState({
    // Buyer info
    buyerName: '',
    buyerDoc: '',
    buyerEmail: '',
    // Sale info
    currency: 'ARS',
    notes: '',
    // At least one item required
    items: [{ description: '', quantity: 1, unit_price: '' }],
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
    setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: '' }] }));
  }

  function removeItem(index) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyerDoc.trim()) {
      setError('El documento del comprador es obligatorio');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // 1. Upsert party
      const docStr = form.buyerDoc.trim();
      const docType = docStr.replace(/[-./]/g, '').length <= 8 ? 'DNI' : 'CUIT';
      const party = await upsertParty({
        doc_type: docType,
        doc_number: docStr,
        full_name: form.buyerName || null,
        email: form.buyerEmail || null,
      });

      // 2. Create sale
      const sale = await createSale({
        buyer_party_id: party.id,
        status: 'CONFIRMED',
        currency: form.currency,
        notes: form.notes || null,
      });

      // 3. Create sale items
      await Promise.all(
        form.items.map(item =>
          createSaleItem({
            sale_id: sale.id,
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            total_price: Number(item.quantity) * Number(item.unit_price),
          })
        )
      );

      // 4. Mark lead as WON
      await updateLead(lead.id, { status: 'WON' });

      onSuccess({ saleId: sale.id, partyId: party.id });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const total = form.items.reduce((s, it) => s + (Number(it.quantity || 1) * Number(it.unit_price || 0)), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cerrar Venta (WON)</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form modal-form-scroll">
          <h3 className="form-section-title">Comprador</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Nombre</label>
              <input value={form.buyerName} onChange={e => setField('buyerName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>CUIT / DNI *</label>
              <input required value={form.buyerDoc} onChange={e => setField('buyerDoc', e.target.value)} placeholder="20-12345678-9" />
            </div>
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.buyerEmail} onChange={e => setField('buyerEmail', e.target.value)} />
          </div>

          <h3 className="form-section-title">Venta</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Moneda</label>
              <select value={form.currency} onChange={e => setField('currency', e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notas</label>
              <input value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>

          <h3 className="form-section-title">Ítems de Venta</h3>
          {form.items.map((item, i) => (
            <div key={i} className="item-row">
              <div className="form-group form-group-flex">
                <label>Descripción</label>
                <input
                  required
                  value={item.description}
                  onChange={e => setItem(i, 'description', e.target.value)}
                  placeholder="ej. Paquete Cancún 7 días"
                />
              </div>
              <div className="form-group form-group-sm">
                <label>Cant.</label>
                <input type="number" min="1" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
              </div>
              <div className="form-group form-group-sm">
                <label>Precio unit.</label>
                <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} />
              </div>
              {form.items.length > 1 && (
                <button type="button" className="btn-icon" onClick={() => removeItem(i)}>🗑</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>+ Ítem</button>

          <div className="totals-preview">
            <div className="totals-row totals-row-total">
              <span>TOTAL {form.currency}:</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-success" disabled={loading}>
              {loading ? 'Guardando...' : 'Confirmar Venta WON'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
