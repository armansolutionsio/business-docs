# Dockerfile para Arman Travel - Sistema de Documentos
FROM node:18-alpine

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema (incluyendo las necesarias para Playwright y Sharp)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-dejavu \
    fontconfig

# Copiar archivos de configuración
COPY package.json package-lock.json ./

# Instalar dependencias de Node
RUN npm install --no-audit --no-fund

# Copiar toda la aplicación
COPY . .

# Exponer puerto
EXPOSE 3001

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Comando de inicio
CMD ["npm", "start"]
ENV NODE_ENV=production
ENV PORT=3001

# Iniciar la aplicación
CMD ["npm", "start"]
