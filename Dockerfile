# ================================
# Stage 1: Build CRM UI (Vite + React)
# ================================
FROM node:20-bookworm-slim AS crm-build

WORKDIR /build
COPY apps/crm-ui/package.json ./apps/crm-ui/
COPY package.json package-lock.json ./
RUN npm ci --workspace=apps/crm-ui
COPY apps/crm-ui/ ./apps/crm-ui/
RUN npx vite build apps/crm-ui --outDir dist --emptyOutDir

# ================================
# Stage 2: Backend + serve CRM dist
# ================================
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

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

COPY package.json package-lock.json ./
COPY apps/business-docs/package.json ./apps/business-docs/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --omit=dev --workspace=apps/business-docs

RUN npx playwright install chromium

COPY packages/shared/ ./packages/shared/
COPY --from=crm-build /build/apps/crm-ui/dist/ ./apps/crm-ui/dist/
COPY apps/business-docs/ ./apps/business-docs/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/apps/business-docs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => { if (r.statusCode !== 200) process.exit(1) })"

CMD ["npm", "start"]
