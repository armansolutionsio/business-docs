# ================================
# Arman Travel - Sistema Documental
# Backend Node + Playwright + Sharp
# ================================

FROM node:20-bookworm-slim

# Evita prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive

# Directorio de trabajo
WORKDIR /app

# --------------------------------
# Instalar dependencias del sistema
# Necesarias para:
# - Playwright (Chromium)
# - Sharp
# - Renderizado correcto de fuentes
# --------------------------------
RUN apt-get update && apt-get install -y \
    ca-certificates \
    wget \
    gnupg \
    fonts-dejavu \
    fonts-liberation \
    fonts-freefont-ttf \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libpng16-16 \
    libgif7 \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# --------------------------------
# Copiar manifests del monorepo
# (mejor cache de Docker)
# --------------------------------
COPY package.json package-lock.json ./
COPY apps/business-docs/package.json ./apps/business-docs/
COPY packages/shared/package.json ./packages/shared/

# Instalar dependencias Node (workspace-aware)
RUN npm ci --omit=dev --workspace=apps/business-docs

# Instalar Chromium para Playwright
RUN npx playwright install chromium

# Copiar paquete compartido, CRM dist y aplicación
COPY packages/shared/ ./packages/shared/
COPY apps/crm-ui/dist/ ./apps/crm-ui/dist/
COPY apps/business-docs/ ./apps/business-docs/

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3001

# Exponer puerto
EXPOSE 3001

# Cambiar al directorio de la app
WORKDIR /app/apps/business-docs

# Healthcheck real
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => { if (r.statusCode !== 200) process.exit(1) })"

# Iniciar aplicación
CMD ["npm", "start"]
