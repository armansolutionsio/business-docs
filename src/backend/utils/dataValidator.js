/**
 * Validador de datos para documentos
 */
class DataValidator {
  /**
   * Valida datos de factura
   */
  static validateInvoice(data) {
    const errors = [];

    // Datos del Emisor
    if (!data.companyName || !data.companyName.trim()) {
      errors.push('companyName is required');
    }
    if (!data.companyCUIT || !data.companyCUIT.trim()) {
      errors.push('companyCUIT is required');
    }
    if (!data.companyIVACondition) {
      errors.push('companyIVACondition is required');
    }
    if (!data.companyAddress || !data.companyAddress.trim()) {
      errors.push('companyAddress is required');
    }

    // Datos del Comprobante
    if (!data.invoiceNumber) {
      errors.push('invoiceNumber is required');
    }
    if (!data.invoiceLetter || !['A', 'B', 'C', 'E', 'M', 'X'].includes(data.invoiceLetter)) {
      errors.push('invoiceLetter must be A, B, C, E, M, or X');
    }
    if (!data.invoiceDate) {
      errors.push('invoiceDate is required');
    }
    if (!data.companyPOS || data.companyPOS <= 0) {
      errors.push('companyPOS must be a positive number');
    }

    // Datos del Cliente
    if (!data.clientName || !data.clientName.trim()) {
      errors.push('clientName is required');
    }
    if (!data.clientCUIT || !data.clientCUIT.trim()) {
      errors.push('clientCUIT is required');
    }
    if (!data.clientIVACondition) {
      errors.push('clientIVACondition is required');
    }
    if (!data.clientAddress || !data.clientAddress.trim()) {
      errors.push('clientAddress is required');
    }

    // Datos Fiscales
    if (!data.cae || !data.cae.trim()) {
      errors.push('cae is required');
    }
    if (!data.caeExpiration) {
      errors.push('caeExpiration is required');
    }

    // Items
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.push('items array must contain at least one item');
    } else {
      data.items.forEach((item, idx) => {
        if (!item.description || !item.description.trim()) {
          errors.push(`items[${idx}].description is required`);
        }
        if (item.quantity <= 0) {
          errors.push(`items[${idx}].quantity must be positive`);
        }
        if (item.price < 0) {
          errors.push(`items[${idx}].price cannot be negative`);
        }
      });
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  /**
   * Valida datos de recibo
   */
  static validateReceipt(data) {
    const errors = [];

    // Datos del Emisor
    if (!data.companyName || !data.companyName.trim()) {
      errors.push('companyName is required');
    }
    if (!data.companyCUIT || !data.companyCUIT.trim()) {
      errors.push('companyCUIT is required');
    }
    if (!data.companyAddress || !data.companyAddress.trim()) {
      errors.push('companyAddress is required');
    }

    // Datos del Pagador
    if (!data.payerName || !data.payerName.trim()) {
      errors.push('payerName is required');
    }
    if (!data.payerCUIT || !data.payerCUIT.trim()) {
      errors.push('payerCUIT is required');
    }

    // Detalle del Pago
    if (!data.receiptNumber) {
      errors.push('receiptNumber is required');
    }
    if (!data.receiptDate) {
      errors.push('receiptDate is required');
    }
    if (!data.concept || !data.concept.trim()) {
      errors.push('concept is required');
    }
    if (!data.amount || data.amount <= 0) {
      errors.push('amount must be a positive number');
    }
    if (!data.amountInLetters || !data.amountInLetters.trim()) {
      errors.push('amountInLetters is required');
    }
    if (!data.paymentMethod) {
      errors.push('paymentMethod is required');
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  /**
   * Valida datos de cotización
   */
  static validateQuote(data) {
    const errors = [];

    // Datos del Emisor
    if (!data.companyName || !data.companyName.trim()) {
      errors.push('companyName is required');
    }
    if (!data.companyCUIT || !data.companyCUIT.trim()) {
      errors.push('companyCUIT is required');
    }
    if (!data.companyAddress || !data.companyAddress.trim()) {
      errors.push('companyAddress is required');
    }
    if (!data.companyEmail || !data.companyEmail.trim()) {
      errors.push('companyEmail is required');
    }
    if (!data.companyPhone || !data.companyPhone.trim()) {
      errors.push('companyPhone is required');
    }

    // Datos del Cliente
    if (!data.clientName || !data.clientName.trim()) {
      errors.push('clientName is required');
    }

    // Comprobante
    if (!data.quoteNumber) {
      errors.push('quoteNumber is required');
    }
    if (!data.quoteDate) {
      errors.push('quoteDate is required');
    }

    // Condiciones
    if (!data.validity || data.validity <= 0) {
      errors.push('validity must be a positive number');
    }
    if (!data.paymentTerms || !data.paymentTerms.trim()) {
      errors.push('paymentTerms is required');
    }
    if (!data.deliveryTerm || !data.deliveryTerm.trim()) {
      errors.push('deliveryTerm is required');
    }

    // Items
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.push('items array must contain at least one item');
    } else {
      data.items.forEach((item, idx) => {
        if (!item.description || !item.description.trim()) {
          errors.push(`items[${idx}].description is required`);
        }
        if (item.quantity <= 0) {
          errors.push(`items[${idx}].quantity must be positive`);
        }
        if (item.price < 0) {
          errors.push(`items[${idx}].price cannot be negative`);
        }
      });
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  /**
   * Valida datos genéricamente por tipo
   */
  static validate(type, data) {
    switch (type) {
      case 'invoice':
        return this.validateInvoice(data);
      case 'receipt':
        return this.validateReceipt(data);
      case 'quote':
        return this.validateQuote(data);
      default:
        return { ok: false, errors: [`Unknown document type: ${type}`] };
    }
  }

  /**
   * Sanitiza y normaliza datos
   */
  static sanitize(data) {
    const sanitized = { ...data };

    // Trimear strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].trim();
      }
    });

    // Normalizar items
    if (Array.isArray(sanitized.items)) {
      sanitized.items = sanitized.items.map(item => ({
        ...item,
        description: (item.description || '').trim(),
        quantity: parseFloat(item.quantity) || 0,
        price: parseFloat(item.price) || 0
      }));
    }

    // Normalizar números
    if (sanitized.amount) sanitized.amount = parseFloat(sanitized.amount) || 0;
    if (sanitized.validity) sanitized.validity = parseInt(sanitized.validity) || 0;
    if (sanitized.companyPOS) sanitized.companyPOS = parseInt(sanitized.companyPOS) || 0;
    if (sanitized.invoiceNumber) sanitized.invoiceNumber = parseInt(sanitized.invoiceNumber) || 0;
    if (sanitized.receiptNumber) sanitized.receiptNumber = parseInt(sanitized.receiptNumber) || 0;

    return sanitized;
  }
}

module.exports = DataValidator;
