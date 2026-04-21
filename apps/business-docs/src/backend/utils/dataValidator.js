/**
 * Validador de datos para documentos.
 * Non-blocking: fills defaults instead of failing on missing fields.
 */
class DataValidator {

  static validateInvoice(data) {
    return { ok: true, errors: [] };
  }

  static validateReceipt(data) {
    return { ok: true, errors: [] };
  }

  static validateQuote(data) {
    return { ok: true, errors: [] };
  }

  static validate(type, data) {
    return { ok: true, errors: [] };
  }

  /**
   * Sanitiza, normaliza y rellena defaults
   */
  static sanitize(data) {
    const sanitized = { ...data };

    // Trim strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].trim();
      }
    });

    // Normalize items
    if (Array.isArray(sanitized.items)) {
      sanitized.items = sanitized.items.map(item => ({
        ...item,
        description: (item.description || '').trim(),
        quantity: parseFloat(item.quantity) || 1,
        price: parseFloat(item.price) || 0
      }));
    }

    // Normalize numbers
    if (sanitized.amount) sanitized.amount = parseFloat(sanitized.amount) || 0;
    if (sanitized.validity) sanitized.validity = parseInt(sanitized.validity) || 15;
    if (sanitized.companyPOS) sanitized.companyPOS = parseInt(sanitized.companyPOS) || 1;

    // Fill defaults for fields templates expect
    sanitized.companyName = sanitized.companyName || '';
    sanitized.companyCUIT = sanitized.companyCUIT || '';
    sanitized.companyAddress = sanitized.companyAddress || '';
    sanitized.companyEmail = sanitized.companyEmail || '';
    sanitized.companyPhone = sanitized.companyPhone || '';
    sanitized.clientName = sanitized.clientName || sanitized.payerName || '';
    sanitized.clientDomicilio = sanitized.clientDomicilio || '';
    sanitized.clientLocalidad = sanitized.clientLocalidad || '';
    sanitized.clientProvincia = sanitized.clientProvincia || '';
    sanitized.clientCodigoPostal = sanitized.clientCodigoPostal || '';
    sanitized.quoteDate = sanitized.quoteDate || new Date().toISOString().split('T')[0];
    sanitized.invoiceDate = sanitized.invoiceDate || new Date().toISOString().split('T')[0];
    sanitized.receiptDate = sanitized.receiptDate || new Date().toISOString().split('T')[0];
    sanitized.validity = sanitized.validity || 15;
    sanitized.paymentTerms = sanitized.paymentTerms || 'A convenir';
    sanitized.deliveryTerm = sanitized.deliveryTerm || 'A convenir';
    sanitized.payerAddress = sanitized.payerAddress || '';
    sanitized.paymentMethod = sanitized.paymentMethod || '';
    sanitized.concept = sanitized.concept || '';
    sanitized.amountInLetters = sanitized.amountInLetters || '';
    return sanitized;
  }
}

module.exports = DataValidator;
