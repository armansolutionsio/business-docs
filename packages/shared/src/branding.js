'use strict';

/**
 * Arman Travel brand constants.
 * Override any value via environment variables — never hardcode in templates.
 */
module.exports = {
  colors: {
    primary: '#7B2CBF',
    primaryDark: '#6A1B9A',
  },
  company: {
    name: process.env.COMPANY_NAME || 'Arman Travel',
    cuit: process.env.COMPANY_CUIT || '',
    address: process.env.COMPANY_ADDRESS || '',
    email: process.env.COMPANY_EMAIL || '',
    phone: process.env.COMPANY_PHONE || '',
    ivaCondition: process.env.COMPANY_IVA_CONDITION || 'Responsable Inscripto',
  },
};
