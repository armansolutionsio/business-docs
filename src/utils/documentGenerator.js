const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ShadingType, ImageRun, TextRun } = require('docx');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');

const COLORS = {
  primary: '#4B6B9B',
  secondary: '#1FA3B0',
  text: '#2C3E50',
  lightGray: '#ECF0F1',
  border: '#BDC3C7',
  white: '#FFFFFF'
};

const BRAND_NAME = 'Arman Travel';
const COMPANY_NAME = 'Arman Solutions S.R.L';
const COMPANY_ADDRESS = 'Corrientes 1234, CABA';
const COMPANY_PHONE = '+54 11 1234-5678';
const COMPANY_EMAIL = 'info@armantravel.com';

const logoPath = path.join(__dirname, '../../public/logo.png');
const logoExists = fs.existsSync(logoPath);

async function generatePDF(documentType, data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true
      });

      let chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      drawPDFHeader(doc);
      drawDocumentTitle(doc, documentType);
      drawDocumentInfo(doc, documentType, data);

      switch(documentType) {
        case 'invoice':
          drawInvoice(doc, data);
          break;
        case 'receipt':
          drawReceipt(doc, data);
          break;
        case 'quote':
          drawQuote(doc, data);
          break;
        case 'budget':
          drawBudget(doc, data);
          break;
        case 'proposal':
          drawProposal(doc, data);
          break;
        case 'delivery-note':
          drawDeliveryNote(doc, data);
          break;
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function generateWord(documentType, data) {
  try {
    // If a .docx template exists, use docxtemplater to fill placeholders and images
    const templatePath = path.join(__dirname, 'cotizador-ejemplo.docx');
    if (fs.existsSync(templatePath)) {
      try {
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const imageModule = new ImageModule({
          centered: false,
          getImage: function(tagValue) {
            if (!tagValue) return null;
            // tagValue may be a data URL or Buffer
            if (typeof tagValue === 'string' && tagValue.startsWith('data:')) {
              return base64DataToBuffer(tagValue);
            }
            if (Buffer.isBuffer(tagValue)) return tagValue;
            return null;
          },
          getSize: function(img, tagValue) {
            // Return size [width, height] in pixels — keep reasonable defaults
            return [450, 300];
          }
        });

        doc.attachModule(imageModule);

        // Build template data
        const tplData = Object.assign({}, data);
        // Map images to template keys (use flight_image, hotel_image, transfer_image)
        tplData.flight_image = data.images?.flight?.data || null;
        tplData.hotel_image = data.images?.hotel?.data || null;
        tplData.transfer_image = data.images?.transfer?.data || null;
        // Map items into simple structure
        tplData.items = (data.items || []).map(it => ({ description: it.description, quantity: it.quantity, price: it.price, subtotal: (it.quantity * it.price).toFixed(2) }));

        doc.setData(tplData);
        doc.render();
        const buf = doc.getZip().generate({ type: 'nodebuffer' });
        return buf;
      } catch (err) {
        // If template processing fails, fall back to programmatic generation below
        console.error('Template render error:', err);
      }
    }
    const title = getDocumentTitle(documentType);
    const children = [];

    // NOTE: Do not inject logos or header/footer content here — the user-provided
    // .docx template will include any header/footer branding. We only render
    // body content (title, info, items, images).
    children.push(
      new Paragraph({
        text: title,
        bold: true,
        size: 40,
        color: COLORS.primary.substring(1),
        spacing: { after: 200, before: 100 }
      })
    );

    // Info table
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            height: { value: 600, rule: 'auto' },
            children: [
              new TableCell({
                shading: { fill: COLORS.lightGray.substring(1), type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    text: 'Nº',
                    bold: true,
                    size: 16,
                    color: COLORS.secondary.substring(1)
                  }),
                  new Paragraph({
                    text: data.number || '-',
                    size: 20,
                    color: COLORS.text.substring(1)
                  })
                ]
              }),
              new TableCell({
                shading: { fill: COLORS.lightGray.substring(1), type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    text: 'FECHA',
                    bold: true,
                    size: 16,
                    color: COLORS.secondary.substring(1)
                  }),
                  new Paragraph({
                    text: data.date || new Date().toLocaleDateString('es-AR'),
                    size: 20,
                    color: COLORS.text.substring(1)
                  })
                ]
              }),
              new TableCell({
                shading: { fill: COLORS.lightGray.substring(1), type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    text: documentType === 'quote' ? 'VIGENCIA' : 'ESTADO',
                    bold: true,
                    size: 16,
                    color: COLORS.secondary.substring(1)
                  }),
                  new Paragraph({
                    text: documentType === 'quote' ? (data.validity || '30 días') : 'Emitido',
                    size: 20,
                    color: COLORS.text.substring(1)
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));

    // Content
    switch(documentType) {
      case 'invoice':
        children.push(...wordInvoice(data));
        break;
      case 'receipt':
        children.push(...wordReceipt(data));
        break;
      case 'quote':
        children.push(...wordQuote(data));
        break;
      case 'budget':
        children.push(...wordBudget(data));
        break;
      case 'proposal':
        children.push(...wordProposal(data));
        break;
      case 'delivery-note':
        children.push(...wordDeliveryNote(data));
        break;
    }

    // Do not add footer here. Template will handle footer/logo if needed.

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    return buffer;
  } catch (error) {
    throw error;
  }
}

function drawPDFHeader(doc) {
  // Intentionally do not draw header logo or header text here. The user's
  // .docx template will include any header/footer branding. Keep the
  // PDF cursor in a safe top area to avoid overlapping content.
  doc.y = doc.page.margins.top + 10;
}

function drawDocumentTitle(doc, type) {
  const title = getDocumentTitle(type);
  const y = doc.y;

  doc.rect(40, y, 515, 45).fill(COLORS.primary);

  doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.white);
  doc.text(title, 50, y + 8, { width: 495 });

  doc.y = y + 55;
}

function drawDocumentInfo(doc, type, data) {
  const y = doc.y;
  const boxHeight = 35;

  doc.rect(40, y, 515, boxHeight).fill(COLORS.lightGray);

  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary);
  doc.text(`Nº`, 50, y + 7);
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.number || '-', 50, y + 18);

  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary);
  doc.text('FECHA', 200, y + 7);
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.date || new Date().toLocaleDateString('es-AR'), 200, y + 18);

  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary);
  doc.text(type === 'quote' ? 'VIGENCIA' : 'ESTADO', 380, y + 7);
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
  doc.text(type === 'quote' ? (data.validity || '30 días') : 'Emitido', 380, y + 18);

  doc.y = y + boxHeight + 20;
}

function drawSection(doc, title) {
  doc.moveDown(0.3);
  const y = doc.y;
  
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLORS.secondary).lineWidth(2).stroke();
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary);
  doc.text(title, 50, y - 10);

  doc.y = y + 15;
}

function formatCurrency(amount) {
  const n = Number(amount || 0);
  const fixed = n.toFixed(2);
  const parts = fixed.split('.');
  const integer = parts[0];
  const decimals = parts[1];
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Spanish style: thousands '.' and decimal ','
  return `${withThousands},${decimals}`;
}

function drawItemsTable(doc, items, showQty = false) {
  if (!items || items.length === 0) return;

  const startX = 40;
  const tableWidth = doc.page.width - startX - doc.page.margins.right;
  const descWidth = showQty ? Math.round(tableWidth * 0.55) : Math.round(tableWidth * 0.6);
  const qtyWidth = showQty ? Math.round(tableWidth * 0.1) : 0;
  const priceWidth = Math.round(tableWidth * 0.15);
  const subtotalWidth = showQty ? Math.round(tableWidth * 0.15) : Math.round(tableWidth * 0.25);

  // Header
  const headerY = doc.y;
  doc.rect(startX, headerY, tableWidth, 22).fill(COLORS.primary);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
  doc.text('DESCRIPCIÓN', startX + 6, headerY + 6, { width: descWidth });
  if (showQty) doc.text('CANT.', startX + 6 + descWidth, headerY + 6, { width: qtyWidth, align: 'center' });
  doc.text('PRECIO', startX + 6 + descWidth + qtyWidth, headerY + 6, { width: priceWidth, align: 'right' });
  if (!showQty) doc.text('SUBTOTAL', startX + 6 + descWidth + qtyWidth + priceWidth, headerY + 6, { width: subtotalWidth, align: 'right' });

  let cursorY = headerY + 26;

  items.forEach((item, idx) => {
    // Compute description height with wrapping
    doc.fontSize(10).font('Helvetica');
    const descHeight = doc.heightOfString(String(item.description || '-'), { width: descWidth });
    const rowHeight = Math.max(18, descHeight) + 8;

    // Page break if not enough space
    if (cursorY + rowHeight + doc.page.margins.bottom > doc.page.height) {
      doc.addPage();
      cursorY = doc.y;
    }

    // Row background
    if (idx % 2 === 0) {
      doc.rect(startX, cursorY - 4, tableWidth, rowHeight).fill(COLORS.lightGray);
    }

    // Text
    doc.fillColor(COLORS.text).fontSize(10).font('Helvetica');
    doc.text(String(item.description || '-'), startX + 6, cursorY, { width: descWidth });

    if (showQty) {
      doc.text(String(item.quantity || 0), startX + 6 + descWidth, cursorY, { width: qtyWidth, align: 'center' });
    }

    const priceStr = `$ ${formatCurrency(item.price)} `;
    doc.text(priceStr, startX + 6 + descWidth + qtyWidth, cursorY, { width: priceWidth, align: 'right' });

    if (!showQty) {
      const subtotal = (Number(item.quantity || 1) * Number(item.price || 0));
      const subtotalStr = `$ ${formatCurrency(subtotal)} `;
      doc.text(subtotalStr, startX + 6 + descWidth + qtyWidth + priceWidth, cursorY, { width: subtotalWidth, align: 'right' });
    }

    cursorY += rowHeight + 4;
  });

  doc.y = cursorY + 6;
}

function drawImage(doc, imageData, title) {
  if (!imageData) return;

  drawSection(doc, title);
  doc.moveDown(0.3);
  try {
    const buffer = Buffer.from(imageData.split(',')[1], 'base64');
    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 40; // padding
    const maxHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 120; // leave room

    // Try to get image intrinsic dimensions via PDFKit's image loading
    let img;
    try {
      img = doc.openImage(buffer);
    } catch (e) {
      img = null;
    }

    let drawWidth = maxWidth;
    let drawHeight = maxHeight;
    if (img) {
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      drawWidth = Math.round(img.width * ratio);
      drawHeight = Math.round(img.height * ratio);
    } else {
      // fallback fixed height
      drawHeight = Math.min(300, maxHeight);
      drawWidth = Math.min(maxWidth, drawHeight * 1.5);
    }

    // If image doesn't fit on current page, add a new page
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;
    if (drawHeight + 40 > remainingHeight) {
      doc.addPage();
    }

    const x = (doc.page.width - drawWidth) / 2;
    doc.image(buffer, x, doc.y, { width: drawWidth, height: drawHeight });
    // Move cursor after the image
    doc.y = doc.y + drawHeight + 10;
  } catch (e) {
    console.log('Error loading image:', e.message);
  }
}

// Helper: convert base64 (data url) to Buffer
function base64DataToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const parts = dataUrl.split(',');
  return Buffer.from(parts[1], 'base64');
}

function drawTotal(doc, amount, label) {
  doc.moveDown(1);
  const y = doc.y;

  doc.rect(355, y, 200, 50).fill(COLORS.secondary);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.white);
  doc.text(label, 365, y + 8, { width: 180 });
  doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.white);
  doc.text(`$${parseFloat(amount || 0).toFixed(2)}`, 365, y + 22, { width: 180, align: 'right' });

  doc.y = y + 60;
}

function drawInvoice(doc, data) {
  drawSection(doc, 'DATOS DEL CLIENTE');
  
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.clientName || '-', 50);
  if (data.clientDNI) doc.text(`DNI/CUIT: ${data.clientDNI}`, 50);
  if (data.clientPhone) doc.text(`Teléfono: ${data.clientPhone}`, 50);
  doc.moveDown(0.5);

  if (data.items && data.items.length > 0) {
    drawSection(doc, 'DETALLE');
    drawItemsTable(doc, data.items, true);
  }

  drawTotal(doc, data.total, 'TOTAL A PAGAR');
}

function drawReceipt(doc, data) {
  drawSection(doc, 'RECIBIMOS DE');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.paidBy || '-', 50);
  doc.moveDown(1);

  drawSection(doc, 'CONCEPTO');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.concept || '-', 50);
  doc.moveDown(1);

  drawTotal(doc, data.amount, 'MONTO RECIBIDO');
}

function drawQuote(doc, data) {
  drawSection(doc, 'SOLICITANTE');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.requesterName || '-', 50);
  doc.moveDown(1);

  if (data.images?.flight || data.flightDescription) {
    if (data.images?.flight) drawImage(doc, data.images.flight.data, 'DATOS DEL VUELO');
    if (data.flightDescription) {
      drawSection(doc, 'INFORMACIÓN DEL VUELO');
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.text);
      doc.text(data.flightDescription, 50, doc.y, { width: 450 });
      doc.moveDown(0.5);
    }
  }

  if (data.images?.hotel || data.hotelDescription) {
    if (data.images?.hotel) drawImage(doc, data.images.hotel.data, 'DATOS DEL HOSPEDAJE');
    if (data.hotelDescription) {
      drawSection(doc, 'INFORMACIÓN DEL HOSPEDAJE');
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.text);
      doc.text(data.hotelDescription, 50, doc.y, { width: 450 });
      doc.moveDown(0.5);
    }
  }

  if (data.images?.transfer || data.transferDescription) {
    if (data.images?.transfer) drawImage(doc, data.images.transfer.data, 'INFO DE LOS TRASLADOS');
    if (data.transferDescription) {
      drawSection(doc, 'INFORMACIÓN DE TRASLADOS');
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.text);
      doc.text(data.transferDescription, 50, doc.y, { width: 450 });
      doc.moveDown(0.5);
    }
  }

  if (data.items && data.items.length > 0) {
    drawSection(doc, 'SERVICIOS');
    drawItemsTable(doc, data.items);
  }

  drawTotal(doc, data.total, 'TOTAL COTIZADO');
}

function drawBudget(doc, data) {
  drawSection(doc, 'CLIENTE');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.clientName || '-', 50);
  doc.moveDown(1);

  if (data.description) {
    drawSection(doc, 'PROYECTO');
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
    doc.text(data.description, 50, doc.y, { width: 400 });
    doc.moveDown(0.8);
  }

  if (data.images?.flight || data.flightDescription) {
    if (data.images?.flight) drawImage(doc, data.images.flight.data, 'DATOS DEL VUELO');
    if (data.flightDescription) {
      drawSection(doc, 'INFORMACIÓN DEL VUELO');
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.text);
      doc.text(data.flightDescription, 50, doc.y, { width: 450 });
      doc.moveDown(0.5);
    }
  }

  if (data.items && data.items.length > 0) {
    drawSection(doc, 'DETALLES');
    drawItemsTable(doc, data.items);
  }

  drawTotal(doc, data.total, 'TOTAL PRESUPUESTO');
}

function drawProposal(doc, data) {
  drawSection(doc, 'DIRIGIDA A');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.clientName || '-', 50);
  doc.moveDown(1);

  if (data.summary) {
    drawSection(doc, 'RESUMEN');
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
    doc.text(data.summary, 50, doc.y, { width: 400 });
    doc.moveDown(0.8);
  }

  if (data.solution) {
    drawSection(doc, 'PROPUESTA');
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
    doc.text(data.solution, 50, doc.y, { width: 400 });
    doc.moveDown(0.8);
  }

  drawTotal(doc, data.investment, 'INVERSIÓN REQUERIDA');
}

function drawDeliveryNote(doc, data) {
  drawSection(doc, 'DESTINATARIO');
  doc.fontSize(11).font('Helvetica').fillColor(COLORS.text);
  doc.text(data.recipientName || '-', 50);
  doc.moveDown(1);

  if (data.items && data.items.length > 0) {
    drawSection(doc, 'PRODUCTOS');
    drawItemsTable(doc, data.items, true);
  }

  if (data.observations) {
    drawSection(doc, 'OBSERVACIONES');
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.text);
    doc.text(data.observations, 50, doc.y, { width: 400 });
  }
}

function wordInvoice(data) {
  const sections = [];
  sections.push(createSectionTitle('DATOS DEL CLIENTE'));
  sections.push(new Paragraph({ text: data.clientName || '-', size: 22, spacing: { after: 50 } }));
  if (data.clientDNI) sections.push(new Paragraph({ text: `DNI/CUIT: ${data.clientDNI}`, size: 20, spacing: { after: 50 } }));
  if (data.clientPhone) sections.push(new Paragraph({ text: `Teléfono: ${data.clientPhone}`, size: 20, spacing: { after: 200 } }));
  sections.push(createSectionTitle('DETALLE'));
  sections.push(createItemsTable(data.items, true));
  sections.push(createTotalSection(data.total, 'TOTAL A PAGAR'));
  return sections;
}

function wordReceipt(data) {
  const sections = [];
  sections.push(createSectionTitle('RECIBIMOS DE'));
  sections.push(new Paragraph({ text: data.paidBy || '-', size: 22, spacing: { after: 200 } }));
  sections.push(createSectionTitle('CONCEPTO'));
  sections.push(new Paragraph({ text: data.concept || '-', size: 22, spacing: { after: 200 } }));
  sections.push(createTotalSection(data.amount, 'MONTO RECIBIDO'));
  return sections;
}

function wordQuote(data) {
  const sections = [];
  sections.push(createSectionTitle('SOLICITANTE'));
  sections.push(new Paragraph({ text: data.requesterName || '-', size: 22, spacing: { after: 200 } }));
  
  if (data.images?.flight || data.flightDescription) {
    sections.push(createSectionTitle('DATOS DEL VUELO'));
    if (data.images?.flight) {
      const p = createImageParagraph(data.images.flight.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.flightDescription) sections.push(new Paragraph({ text: data.flightDescription, size: 20, spacing: { after: 200 } }));
  }

  if (data.images?.hotel || data.hotelDescription) {
    sections.push(createSectionTitle('DATOS DEL HOSPEDAJE'));
    if (data.images?.hotel) {
      const p = createImageParagraph(data.images.hotel.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.hotelDescription) sections.push(new Paragraph({ text: data.hotelDescription, size: 20, spacing: { after: 200 } }));
  }

  if (data.images?.transfer || data.transferDescription) {
    sections.push(createSectionTitle('INFO DE LOS TRASLADOS'));
    if (data.images?.transfer) {
      const p = createImageParagraph(data.images.transfer.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.transferDescription) sections.push(new Paragraph({ text: data.transferDescription, size: 20, spacing: { after: 200 } }));
  }
  
  sections.push(createSectionTitle('SERVICIOS'));
  sections.push(createItemsTable(data.items));
  sections.push(createTotalSection(data.total, 'TOTAL COTIZADO'));
  return sections;
}

function wordBudget(data) {
  const sections = [];
  sections.push(createSectionTitle('CLIENTE'));
  sections.push(new Paragraph({ text: data.clientName || '-', size: 22, spacing: { after: 200 } }));
  if (data.description) {
    sections.push(createSectionTitle('PROYECTO'));
    sections.push(new Paragraph({ text: data.description, size: 20, spacing: { after: 200 } }));
  }
  if (data.images?.flight || data.flightDescription) {
    sections.push(createSectionTitle('DATOS DEL VUELO'));
    if (data.images?.flight) {
      const p = createImageParagraph(data.images.flight.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.flightDescription) sections.push(new Paragraph({ text: data.flightDescription, size: 20, spacing: { after: 200 } }));
  }
  sections.push(createSectionTitle('DETALLES'));
  sections.push(createItemsTable(data.items));
  sections.push(createTotalSection(data.total, 'TOTAL PRESUPUESTO'));
  return sections;
}

function wordProposal(data) {
  const sections = [];
  sections.push(createSectionTitle('DIRIGIDA A'));
  sections.push(new Paragraph({ text: data.clientName || '-', size: 22, spacing: { after: 200 } }));
  if (data.summary) {
    sections.push(createSectionTitle('RESUMEN'));
    sections.push(new Paragraph({ text: data.summary, size: 20, spacing: { after: 200 } }));
  }
  if (data.solution) {
    sections.push(createSectionTitle('PROPUESTA'));
    sections.push(new Paragraph({ text: data.solution, size: 20, spacing: { after: 200 } }));
  }
  // Allow images/descriptions in proposals
  if (data.images?.flight || data.flightDescription) {
    sections.push(createSectionTitle('DATOS DEL VUELO'));
    if (data.images?.flight) {
      const p = createImageParagraph(data.images.flight.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.flightDescription) sections.push(new Paragraph({ text: data.flightDescription, size: 20, spacing: { after: 200 } }));
  }
  if (data.images?.hotel || data.hotelDescription) {
    sections.push(createSectionTitle('DATOS DEL HOSPEDAJE'));
    if (data.images?.hotel) {
      const p = createImageParagraph(data.images.hotel.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.hotelDescription) sections.push(new Paragraph({ text: data.hotelDescription, size: 20, spacing: { after: 200 } }));
  }
  if (data.images?.transfer || data.transferDescription) {
    sections.push(createSectionTitle('INFO DE LOS TRASLADOS'));
    if (data.images?.transfer) {
      const p = createImageParagraph(data.images.transfer.data, 450, 300);
      if (p) sections.push(p);
    }
    if (data.transferDescription) sections.push(new Paragraph({ text: data.transferDescription, size: 20, spacing: { after: 200 } }));
  }
  sections.push(createTotalSection(data.investment, 'INVERSIÓN REQUERIDA'));
  return sections;
}

function wordDeliveryNote(data) {
  const sections = [];
  sections.push(createSectionTitle('DESTINATARIO'));
  sections.push(new Paragraph({ text: data.recipientName || '-', size: 22, spacing: { after: 200 } }));
  sections.push(createSectionTitle('PRODUCTOS'));
  sections.push(createItemsTable(data.items, true));
  if (data.observations) {
    sections.push(createSectionTitle('OBSERVACIONES'));
    sections.push(new Paragraph({ text: data.observations, size: 20, spacing: { after: 200 } }));
  }
  return sections;
}

function createSectionTitle(text) {
  return new Paragraph({
    text: text,
    bold: true,
    size: 24,
    color: COLORS.primary.substring(1),
    border: { bottom: { color: COLORS.secondary.substring(1), space: 1, style: BorderStyle.SINGLE, size: 12 } },
    spacing: { before: 100, after: 100 }
  });
}

function createImageParagraph(dataUrl, width = 450, height = 300) {
  const buffer = base64DataToBuffer(dataUrl);
  if (!buffer) return null;
  return new Paragraph({ children: [new ImageRun({ data: buffer, transformation: { width, height } })], spacing: { after: 200 } });
}

function createItemsTable(items, showQty = false) {
  if (!items || items.length === 0) {
    return new Paragraph({ text: 'Sin items', spacing: { after: 200 } });
  }

  const headerCells = [
    new TableCell({
      shading: { fill: COLORS.primary.substring(1), type: ShadingType.CLEAR },
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      children: [new Paragraph({ text: 'DESCRIPCIÓN', bold: true, color: COLORS.white.substring(1), size: 18 })]
    })
  ];

  if (showQty) {
    headerCells.push(new TableCell({
      shading: { fill: COLORS.primary.substring(1), type: ShadingType.CLEAR },
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      children: [new Paragraph({ text: 'CANT.', bold: true, color: COLORS.white.substring(1), size: 18, alignment: AlignmentType.CENTER })]
    }));
  }

  headerCells.push(new TableCell({
    shading: { fill: COLORS.primary.substring(1), type: ShadingType.CLEAR },
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    children: [new Paragraph({ text: 'PRECIO', bold: true, color: COLORS.white.substring(1), size: 18, alignment: AlignmentType.RIGHT })]
  }));

  if (!showQty) {
    headerCells.push(new TableCell({
      shading: { fill: COLORS.primary.substring(1), type: ShadingType.CLEAR },
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      children: [new Paragraph({ text: 'SUBTOTAL', bold: true, color: COLORS.white.substring(1), size: 18, alignment: AlignmentType.RIGHT })]
    }));
  }

  const rows = [new TableRow({ children: headerCells })];

  items.forEach((item, idx) => {
    const cells = [
      new TableCell({
        shading: { fill: idx % 2 === 0 ? COLORS.lightGray.substring(1) : COLORS.white.substring(1), type: ShadingType.CLEAR },
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        children: [new Paragraph({ text: item.description, size: 20 })]
      })
    ];

    if (showQty) {
      cells.push(new TableCell({
        shading: { fill: idx % 2 === 0 ? COLORS.lightGray.substring(1) : COLORS.white.substring(1), type: ShadingType.CLEAR },
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        children: [new Paragraph({ text: item.quantity.toString(), size: 20, alignment: AlignmentType.CENTER })]
      }));
    }

    cells.push(new TableCell({
      shading: { fill: idx % 2 === 0 ? COLORS.lightGray.substring(1) : COLORS.white.substring(1), type: ShadingType.CLEAR },
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      children: [new Paragraph({ text: `$ ${formatCurrency(item.price)}`, size: 18, alignment: AlignmentType.RIGHT })]
    }));

    if (!showQty) {
      cells.push(new TableCell({
        shading: { fill: idx % 2 === 0 ? COLORS.lightGray.substring(1) : COLORS.white.substring(1), type: ShadingType.CLEAR },
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        children: [new Paragraph({ text: `$ ${formatCurrency(item.quantity * item.price)}`, size: 18, alignment: AlignmentType.RIGHT })]
      }));
    }

    rows.push(new TableRow({ children: cells }));
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, spacing: { after: 200 } });
}

function createTotalSection(total, label) {
  return new Table({
    width: { size: 50, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: COLORS.secondary.substring(1), type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [
              new Paragraph({
                text: label,
                bold: true,
                color: COLORS.white.substring(1),
                size: 20,
                spacing: { after: 50 }
              }),
              new Paragraph({
                text: `$${parseFloat(total || 0).toFixed(2)}`,
                bold: true,
                color: COLORS.white.substring(1),
                size: 32
              })
            ]
          })
        ]
      })
    ],
    alignment: AlignmentType.RIGHT,
    spacing: { after: 200 }
  });
}

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

module.exports = {
  generatePDF,
  generateWord
};
