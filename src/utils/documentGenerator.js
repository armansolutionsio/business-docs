const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle } = require('docx');
const fs = require('fs');
const path = require('path');

// Configuración de marca Arman Travel
const BRAND_CONFIG = {
  company: 'Arman Solutions S.R.L',
  brand: 'Arman Travel',
  slogan: 'Sistema de Gestión de Documentos',
  colors: {
    primary: '#4B6B9B',      // Azul
    secondary: '#1FA3B0',    // Turquesa
    accent: '#2D8A99',       // Turquesa más oscuro
    text: '#333333',
    lightGray: '#F5F5F5'
  },
  font: 'Helvetica',
  logoPath: path.join(__dirname, '../../public/logo.png')
};

// Verificar si existe el logo
const logoExists = fs.existsSync(BRAND_CONFIG.logoPath);

// Plantilla para PDF
async function generatePDF(documentType, data) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40
      });

      let chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Encabezado con logo si existe
      if (logoExists) {
        try {
          doc.image(BRAND_CONFIG.logoPath, 50, 40, { width: 50, height: 50 });
        } catch (e) {
          console.warn('Logo no pudo ser cargado en PDF:', e.message);
        }
      }

      // Título y empresa
      doc.fontSize(24).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.primary);
      doc.text(BRAND_CONFIG.brand, logoExists ? 110 : 50, 50);
      
      doc.fontSize(10).font('Helvetica').fillColor('#666');
      doc.text(`${BRAND_CONFIG.company} | ${BRAND_CONFIG.slogan}`, logoExists ? 110 : 50);
      
      // Línea divisoria
      doc.moveTo(50, doc.y + 10).lineTo(550, doc.y + 10).strokeColor(BRAND_CONFIG.colors.secondary).stroke();
      doc.moveDown(1.5);

      // Tipo de documento
      doc.fontSize(18).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.primary);
      doc.text(getDocumentTitle(documentType), { align: 'center' });
      doc.moveDown(0.5);

      // Línea decorativa
      const docTitleY = doc.y;
      doc.moveTo(150, docTitleY).lineTo(500, docTitleY).strokeColor(BRAND_CONFIG.colors.secondary).stroke();
      doc.moveDown(1);

      // Datos del documento según tipo
      switch(documentType) {
        case 'invoice':
          generateInvoicePDF(doc, data);
          break;
        case 'receipt':
          generateReceiptPDF(doc, data);
          break;
        case 'quote':
          generateQuotePDF(doc, data);
          break;
        case 'budget':
          generateBudgetPDF(doc, data);
          break;
        case 'proposal':
          generateProposalPDF(doc, data);
          break;
        case 'delivery-note':
          generateDeliveryNotePDF(doc, data);
          break;
      }

      // Espacio para firma (si es necesario)
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor('#999').text('Firma Autorizada: _____________________');
      
      // Pie de página
      doc.fontSize(8).fillColor('#999999');
      doc.text(`${BRAND_CONFIG.brand} - ${BRAND_CONFIG.company}`, {
        align: 'center'
      });
      doc.text(`Documento generado el ${new Date().toLocaleDateString('es-AR')}`, {
        align: 'center'
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Plantilla para Word
async function generateWord(documentType, data) {
  try {
    const sections = [];

    // Encabezado
    sections.push(
      new Paragraph({
        text: BRAND_CONFIG.brand,
        heading: HeadingLevel.HEADING_1,
        size: 48,
        bold: true,
        color: BRAND_CONFIG.colors.primary.replace('#', ''),
        alignment: AlignmentType.LEFT
      }),
      new Paragraph({
        text: `${BRAND_CONFIG.company} | ${BRAND_CONFIG.slogan}`,
        size: 20,
        color: '666666',
        alignment: AlignmentType.LEFT,
        spacing: { after: 300 }
      })
    );

    // Tipo de documento
    sections.push(
      new Paragraph({
        text: getDocumentTitle(documentType),
        heading: HeadingLevel.HEADING_2,
        size: 28,
        bold: true,
        color: BRAND_CONFIG.colors.primary.replace('#', ''),
        alignment: AlignmentType.CENTER,
        spacing: { after: 200, before: 100 }
      })
    );

    // Datos según tipo
    let contentSections = [];
    switch(documentType) {
      case 'invoice':
        contentSections = generateInvoiceWord(data);
        break;
      case 'receipt':
        contentSections = generateReceiptWord(data);
        break;
      case 'quote':
        contentSections = generateQuoteWord(data);
        break;
      case 'budget':
        contentSections = generateBudgetWord(data);
        break;
      case 'proposal':
        contentSections = generateProposalWord(data);
        break;
      case 'delivery-note':
        contentSections = generateDeliveryNoteWord(data);
        break;
    }

    sections.push(...contentSections);

    // Espacio para firma
    sections.push(
      new Paragraph({
        text: ' ',
        spacing: { before: 400 }
      }),
      new Paragraph({
        text: 'Firma Autorizada: _____________________',
        size: 18,
        color: '999999'
      })
    );

    // Pie de página
    sections.push(
      new Paragraph({
        text: `${BRAND_CONFIG.brand} - ${BRAND_CONFIG.company}`,
        size: 16,
        alignment: AlignmentType.CENTER,
        color: '999999',
        spacing: { before: 200 }
      }),
      new Paragraph({
        text: `Documento generado el ${new Date().toLocaleDateString('es-AR')}`,
        size: 14,
        alignment: AlignmentType.CENTER,
        color: '999999'
      })
    );

    const doc = new Document({
      sections: [{
        children: sections
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    return buffer;
  } catch (error) {
    throw error;
  }
}

// Funciones auxiliares
function getDocumentTitle(type) {
  const titles = {
    invoice: 'FACTURA',
    receipt: 'RECIBO',
    quote: 'COTIZACIÓN',
    budget: 'PRESUPUESTO',
    proposal: 'PROPUESTA',
    'delivery-note': 'REMITO'
  };
  return titles[type] || 'DOCUMENTO';
}

// Generadores PDF específicos
function generateInvoicePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  // Información de factura
  doc.fontSize(10).font('Helvetica-Bold').text(`Factura Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('DATOS DEL CLIENTE:');
  doc.fontSize(9).font('Helvetica').text(data.clientName || '-');
  if (data.clientDNI) doc.text(`DNI/CUIT: ${data.clientDNI}`);
  if (data.clientPhone) doc.text(`Teléfono: ${data.clientPhone}`);
  
  // Items
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('DETALLES:');
  doc.fontSize(9).font('Helvetica');
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      const subtotal = (item.quantity * item.price).toFixed(2);
      doc.text(`• ${item.description} - Cantidad: ${item.quantity} - Precio: $${item.price} = $${subtotal}`);
    });
  }
  
  // Total
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`, { align: 'right' });
}

function generateReceiptPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.fontSize(10).font('Helvetica-Bold').text(`Recibo Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('RECIBIMOS DE:');
  doc.fontSize(9).font('Helvetica').text(data.paidBy || '-');
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('CONCEPTO:');
  doc.fontSize(9).font('Helvetica').text(data.concept || '-');
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`MONTO: $${parseFloat(data.amount || 0).toFixed(2)}`, { align: 'right' });
}

function generateQuotePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.fontSize(10).font('Helvetica-Bold').text(`Cotización Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  if (data.validity) doc.text(`Vigencia: ${data.validity}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('SOLICITANTE:');
  doc.fontSize(9).font('Helvetica').text(data.requesterName || '-');
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('SERVICIOS/PRODUCTOS:');
  doc.fontSize(9).font('Helvetica');
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - $${item.price}`);
    });
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`, { align: 'right' });
}

function generateBudgetPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.fontSize(10).font('Helvetica-Bold').text(`Presupuesto Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE:');
  doc.fontSize(9).font('Helvetica').text(data.clientName || '-');
  
  if (data.description) {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('PROYECTO:');
    doc.fontSize(9).font('Helvetica').text(data.description);
  }
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('DETALLES:');
  doc.fontSize(9).font('Helvetica');
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - $${item.price}`);
    });
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`PRESUPUESTO TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`, { align: 'right' });
}

function generateProposalPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.fontSize(10).font('Helvetica-Bold').text(`Propuesta Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('PARA:');
  doc.fontSize(9).font('Helvetica').text(data.clientName || '-');
  
  if (data.summary) {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('RESUMEN EJECUTIVO:');
    doc.fontSize(9).font('Helvetica').text(data.summary);
  }
  
  if (data.solution) {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('SOLUCIÓN PROPUESTA:');
    doc.fontSize(9).font('Helvetica').text(data.solution);
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`INVERSIÓN: $${parseFloat(data.investment || 0).toFixed(2)}`, { align: 'right' });
}

function generateDeliveryNotePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.fontSize(10).font('Helvetica-Bold').text(`Remito Nº: ${data.number || '-'}`);
  doc.fontSize(9).font('Helvetica').text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('DESTINATARIO:');
  doc.fontSize(9).font('Helvetica').text(data.recipientName || '-');
  
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica-Bold').text('PRODUCTOS/SERVICIOS:');
  doc.fontSize(9).font('Helvetica');
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - Cantidad: ${item.quantity}`);
    });
  }
  
  if (data.observations) {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('OBSERVACIONES:');
    doc.fontSize(9).font('Helvetica').text(data.observations);
  }
}

// Generadores Word específicos
function generateInvoiceWord(data) {
  return [
    new Paragraph({
      text: `Factura Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'DATOS DEL CLIENTE:',
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 50 }
    }),
    ...(data.clientDNI ? [new Paragraph({
      text: `DNI/CUIT: ${data.clientDNI}`,
      spacing: { after: 50 }
    })] : []),
    ...(data.clientPhone ? [new Paragraph({
      text: `Teléfono: ${data.clientPhone}`,
      spacing: { after: 200 }
    })] : [new Paragraph({ text: '', spacing: { after: 200 } })]),
    new Paragraph({
      text: 'DETALLES:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - Cantidad: ${item.quantity} - Precio: $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200 }
    })
  ];
}

function generateReceiptWord(data) {
  return [
    new Paragraph({
      text: `Recibo Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'RECIBIMOS DE:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.paidBy || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'CONCEPTO:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.concept || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `MONTO: $${parseFloat(data.amount || 0).toFixed(2)}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      alignment: AlignmentType.RIGHT
    })
  ];
}

function generateQuoteWord(data) {
  return [
    new Paragraph({
      text: `Cotización Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 50 }
    }),
    ...(data.validity ? [new Paragraph({
      text: `Vigencia: ${data.validity}`,
      spacing: { after: 200 }
    })] : [new Paragraph({ text: '', spacing: { after: 200 } })]),
    new Paragraph({
      text: 'SOLICITANTE:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.requesterName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'SERVICIOS/PRODUCTOS:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200 }
    })
  ];
}

function generateBudgetWord(data) {
  return [
    new Paragraph({
      text: `Presupuesto Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'CLIENTE:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 200 }
    }),
    ...(data.description ? [
      new Paragraph({
        text: 'PROYECTO:',
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: data.description,
        spacing: { after: 200 }
      })
    ] : []),
    new Paragraph({
      text: 'DETALLES:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `PRESUPUESTO TOTAL: $${parseFloat(data.total || 0).toFixed(2)}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200 }
    })
  ];
}

function generateProposalWord(data) {
  return [
    new Paragraph({
      text: `Propuesta Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'PARA:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 200 }
    }),
    ...(data.summary ? [
      new Paragraph({
        text: 'RESUMEN EJECUTIVO:',
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: data.summary,
        spacing: { after: 200 }
      })
    ] : []),
    ...(data.solution ? [
      new Paragraph({
        text: 'SOLUCIÓN PROPUESTA:',
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: data.solution,
        spacing: { after: 200 }
      })
    ] : []),
    new Paragraph({
      text: `INVERSIÓN: $${parseFloat(data.investment || 0).toFixed(2)}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      alignment: AlignmentType.RIGHT
    })
  ];
}

function generateDeliveryNoteWord(data) {
  return [
    new Paragraph({
      text: `Remito Nº: ${data.number || '-'}`,
      bold: true,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'DESTINATARIO:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.recipientName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'PRODUCTOS/SERVICIOS:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - Cantidad: ${item.quantity}`,
      spacing: { after: 50 }
    })) || []),
    ...(data.observations ? [
      new Paragraph({
        text: `OBSERVACIONES: ${data.observations}`,
        spacing: { before: 200 }
      })
    ] : [])
  ];
}

module.exports = {
  generatePDF,
  generateWord
};

// Plantilla para Word
async function generateWord(documentType, data) {
  try {
    const sections = [];

    // Encabezado
    sections.push(
      new Paragraph({
        text: BRAND_CONFIG.brand,
        heading: HeadingLevel.HEADING_1,
        size: 48,
        bold: true,
        color: BRAND_CONFIG.colors.primary.replace('#', '')
      }),
      new Paragraph({
        text: BRAND_CONFIG.company,
        size: 20,
        color: BRAND_CONFIG.colors.text.replace('#', '')
      })
    );

    // Tipo de documento
    sections.push(
      new Paragraph({
        text: getDocumentTitle(documentType),
        heading: HeadingLevel.HEADING_2,
        size: 28,
        bold: true,
        color: BRAND_CONFIG.colors.primary.replace('#', ''),
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );

    // Datos según tipo
    let contentSections = [];
    switch(documentType) {
      case 'invoice':
        contentSections = generateInvoiceWord(data);
        break;
      case 'receipt':
        contentSections = generateReceiptWord(data);
        break;
      case 'quote':
        contentSections = generateQuoteWord(data);
        break;
      case 'budget':
        contentSections = generateBudgetWord(data);
        break;
      case 'proposal':
        contentSections = generateProposalWord(data);
        break;
      case 'delivery-note':
        contentSections = generateDeliveryNoteWord(data);
        break;
    }

    sections.push(...contentSections);

    // Pie de página
    sections.push(
      new Paragraph({
        text: `${BRAND_CONFIG.brand} - ${BRAND_CONFIG.company}`,
        size: 18,
        alignment: AlignmentType.CENTER,
        color: '999999'
      })
    );

    const doc = new Document({
      sections: [{
        children: sections
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    return buffer;
  } catch (error) {
    throw error;
  }
}

// Funciones auxiliares
function getDocumentTitle(type) {
  const titles = {
    invoice: 'FACTURA',
    receipt: 'RECIBO',
    quote: 'COTIZACIÓN',
    budget: 'PRESUPUESTO',
    proposal: 'PROPUESTA',
    'delivery-note': 'REMITO'
  };
  return titles[type] || 'DOCUMENTO';
}

// Generadores PDF específicos
function generateInvoicePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Factura Nº: ${data.number || '-'}`, { width: 250 });
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.text('Cliente:', { font: 'Helvetica-Bold' });
  doc.text(data.clientName || '-');
  doc.text(`DNI/CUIT: ${data.clientDNI || '-'}`);
  doc.text(`Teléfono: ${data.clientPhone || '-'}`);
  
  doc.moveDown(1);
  doc.text('Detalles:', { font: 'Helvetica-Bold' });
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - Cantidad: ${item.quantity} - Precio: $${item.price}`);
    });
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`Total: $${data.total || '0.00'}`);
}

function generateReceiptPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Recibo Nº: ${data.number || '-'}`);
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.text('Recibimos de:', { font: 'Helvetica-Bold' });
  doc.text(data.paidBy || '-');
  
  doc.moveDown(1);
  doc.text('Concepto:', { font: 'Helvetica-Bold' });
  doc.text(data.concept || '-');
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`Monto: $${data.amount || '0.00'}`);
}

function generateQuotePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Cotización Nº: ${data.number || '-'}`);
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  doc.text(`Vigencia: ${data.validity || '-'}`);
  
  doc.moveDown(1);
  doc.text('Solicitante:', { font: 'Helvetica-Bold' });
  doc.text(data.requesterName || '-');
  
  doc.moveDown(1);
  doc.text('Servicios/Productos:', { font: 'Helvetica-Bold' });
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - $${item.price}`);
    });
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`Total Cotizado: $${data.total || '0.00'}`);
}

function generateBudgetPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Presupuesto Nº: ${data.number || '-'}`);
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.text('Cliente:', { font: 'Helvetica-Bold' });
  doc.text(data.clientName || '-');
  
  doc.moveDown(1);
  doc.text('Descripción del Proyecto:', { font: 'Helvetica-Bold' });
  doc.text(data.description || '-');
  
  doc.moveDown(1);
  doc.text('Detalles:', { font: 'Helvetica-Bold' });
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - $${item.price}`);
    });
  }
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`Presupuesto Total: $${data.total || '0.00'}`);
}

function generateProposalPDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Propuesta Nº: ${data.number || '-'}`);
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.text('Para:', { font: 'Helvetica-Bold' });
  doc.text(data.clientName || '-');
  
  doc.moveDown(1);
  doc.text('Resumen Ejecutivo:', { font: 'Helvetica-Bold' });
  doc.text(data.summary || '-');
  
  doc.moveDown(1);
  doc.text('Solución Propuesta:', { font: 'Helvetica-Bold' });
  doc.text(data.solution || '-');
  
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_CONFIG.colors.secondary);
  doc.text(`Inversión: $${data.investment || '0.00'}`);
}

function generateDeliveryNotePDF(doc, data) {
  doc.fontSize(11).font('Helvetica').fillColor(BRAND_CONFIG.colors.text);
  
  doc.moveDown(0.5);
  doc.text(`Remito Nº: ${data.number || '-'}`);
  doc.text(`Fecha: ${data.date || new Date().toLocaleDateString()}`);
  
  doc.moveDown(1);
  doc.text('Destinatario:', { font: 'Helvetica-Bold' });
  doc.text(data.recipientName || '-');
  
  doc.moveDown(1);
  doc.text('Productos/Servicios:', { font: 'Helvetica-Bold' });
  
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      doc.text(`• ${item.description} - Cantidad: ${item.quantity}`);
    });
  }
  
  doc.moveDown(1);
  doc.text(`Observaciones: ${data.observations || '-'}`);
}

// Generadores Word específicos
function generateInvoiceWord(data) {
  return [
    new Paragraph({
      text: `Factura Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Cliente:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `DNI/CUIT: ${data.clientDNI || '-'}`,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Teléfono: ${data.clientPhone || '-'}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Detalles:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - Cantidad: ${item.quantity} - Precio: $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `Total: $${data.total || '0.00'}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      spacing: { before: 200 }
    })
  ];
}

function generateReceiptWord(data) {
  return [
    new Paragraph({
      text: `Recibo Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Recibimos de:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.paidBy || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Concepto:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.concept || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `Monto: $${data.amount || '0.00'}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', '')
    })
  ];
}

function generateQuoteWord(data) {
  return [
    new Paragraph({
      text: `Cotización Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 50 }
    }),
    new Paragraph({
      text: `Vigencia: ${data.validity || '-'}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Solicitante:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.requesterName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Servicios/Productos:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `Total Cotizado: $${data.total || '0.00'}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      spacing: { before: 200 }
    })
  ];
}

function generateBudgetWord(data) {
  return [
    new Paragraph({
      text: `Presupuesto Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Cliente:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Descripción del Proyecto:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.description || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Detalles:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - $${item.price}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `Presupuesto Total: $${data.total || '0.00'}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', ''),
      spacing: { before: 200 }
    })
  ];
}

function generateProposalWord(data) {
  return [
    new Paragraph({
      text: `Propuesta Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Para:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.clientName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Resumen Ejecutivo:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.summary || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Solución Propuesta:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.solution || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `Inversión: $${data.investment || '0.00'}`,
      bold: true,
      color: BRAND_CONFIG.colors.secondary.replace('#', '')
    })
  ];
}

function generateDeliveryNoteWord(data) {
  return [
    new Paragraph({
      text: `Remito Nº: ${data.number || '-'}`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: `Fecha: ${data.date || new Date().toLocaleDateString()}`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Destinatario:',
      bold: true,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: data.recipientName || '-',
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: 'Productos/Servicios:',
      bold: true,
      spacing: { after: 100 }
    }),
    ...(data.items?.map(item => new Paragraph({
      text: `• ${item.description} - Cantidad: ${item.quantity}`,
      spacing: { after: 50 }
    })) || []),
    new Paragraph({
      text: `Observaciones: ${data.observations || '-'}`,
      spacing: { before: 200 }
    })
  ];
}

module.exports = {
  generatePDF,
  generateWord
};
