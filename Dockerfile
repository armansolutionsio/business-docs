# Dockerfile para Arman Travel - Sistema de Documentos
FROM node:18-alpine

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copiar archivos de configuración
COPY package.json package-lock.json ./

# Instalar dependencias de Node
# Use npm install to avoid lockfile mismatch during image builds when package.json changed
RUN npm install --production --no-audit --no-fund

# Copiar toda la aplicación
COPY . .

# Exponer puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3001

# Iniciar la aplicación
CMD ["npm", "start"]
