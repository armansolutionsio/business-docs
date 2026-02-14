const sharp = require('sharp');

const ASSET_SIZES = {
  logo: { maxWidth: 600, maxHeight: 200, type: 'logo' },
  signature: { maxWidth: 400, maxHeight: 150, type: 'signature' },
  qr: { maxWidth: 150, maxHeight: 150, type: 'qr' },
  photo: { maxWidth: 800, maxHeight: 600, type: 'photo' }
};

/**
 * Procesa y normaliza imágenes para documentos
 */
class AssetProcessor {
  /**
   * Procesa un logo
   * @param {Buffer} inputBuffer - Buffer de imagen
   * @returns {Promise<{buffer, width, height, format}>}
   */
  static async processLogo(inputBuffer) {
    return this._processImage(inputBuffer, ASSET_SIZES.logo);
  }

  /**
   * Procesa una firma
   */
  static async processSignature(inputBuffer) {
    return this._processImage(inputBuffer, ASSET_SIZES.signature);
  }

  /**
   * Procesa un código QR
   */
  static async processQR(inputBuffer) {
    return this._processImage(inputBuffer, ASSET_SIZES.qr);
  }

  /**
   * Procesa una foto/imagen general
   */
  static async processPhoto(inputBuffer) {
    return this._processImage(inputBuffer, ASSET_SIZES.photo);
  }

  /**
   * Procesa imagen con restricciones de tamaño
   * @private
   */
  static async _processImage(inputBuffer, config) {
    try {
      if (!inputBuffer || inputBuffer.length === 0) {
        throw new Error('Empty image buffer');
      }

      // Obtener metadata
      const metadata = await sharp(inputBuffer).metadata();
      
      // Validar que sea imagen válida
      if (!metadata.format) {
        throw new Error('Invalid image format');
      }

      let width = metadata.width;
      let height = metadata.height;

      // Calcular si necesita resize
      const aspectRatio = width / height;
      let resizeNeeded = false;

      if (width > config.maxWidth) {
        width = config.maxWidth;
        height = Math.round(width / aspectRatio);
        resizeNeeded = true;
      }

      if (height > config.maxHeight) {
        height = config.maxHeight;
        width = Math.round(height * aspectRatio);
        resizeNeeded = true;
      }

      // Procesar imagen
      let pipeline = sharp(inputBuffer);

      // Si es logo o QR con fondo transparente, preservar PNG
      if (config.type === 'logo' || config.type === 'qr') {
        if (metadata.hasAlpha) {
          // Mantener como PNG si tiene transparencia
          if (resizeNeeded) {
            pipeline = pipeline.resize(Math.round(width), Math.round(height), {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 0 }
            });
          }
          const buffer = await pipeline.png().toBuffer();
          return {
            buffer,
            width: Math.round(width),
            height: Math.round(height),
            format: 'png',
            type: config.type
          };
        }
      }

      // Convertir a JPEG para compresión
      if (resizeNeeded) {
        pipeline = pipeline.resize(Math.round(width), Math.round(height), {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 }
        });
      }

      const buffer = await pipeline.jpeg({ quality: 90, progressive: true }).toBuffer();
      
      return {
        buffer,
        width: Math.round(width),
        height: Math.round(height),
        format: 'jpeg',
        type: config.type
      };
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Convierte buffer a base64 data URL
   */
  static bufferToDataUrl(buffer, format = 'jpeg') {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  /**
   * Convierte data URL a buffer
   */
  static dataUrlToBuffer(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid data URL');
    }
    const parts = dataUrl.split(',');
    return Buffer.from(parts[1], 'base64');
  }
}

module.exports = AssetProcessor;
