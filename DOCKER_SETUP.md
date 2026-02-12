# 🐳 USANDO DOCKER - ARMAN TRAVEL

## Requisitos Previos

- **Docker** instalado: https://www.docker.com/products/docker-desktop
- **Docker Compose** instalado (incluido con Docker Desktop)

---

## ⚡ Opción 1: Usar Docker (RECOMENDADO)

### Pasos para ejecutar con Docker:

```bash
# 1. Navega a la carpeta del proyecto
cd "c:\Users\sanag\Downloads\arman\Github arman\business-docs"

# 2. Construir la imagen Docker
docker-compose build

# 3. Iniciar los servicios
docker-compose up
```

### El servidor estará disponible en:
```
http://localhost:3001
```

---

## 🛑 Detener los servicios

```bash
# Detener sin eliminar contenedores
docker-compose stop

# Detener y eliminar contenedores
docker-compose down

# Detener y eliminar todo (incluyendo volúmenes)
docker-compose down -v
```

---

## 🔍 Comandos Útiles de Docker

### Ver estado de los servicios
```bash
docker-compose ps
```

### Ver logs en tiempo real
```bash
# Todos los servicios
docker-compose logs -f

# Solo el backend
docker-compose logs -f backend
```

### Reiniciar un servicio
```bash
docker-compose restart backend
```

### Ejecutar comandos en el contenedor
```bash
docker-compose exec backend npm list
```

---

## 📊 Comparativa: Con vs Sin Docker

### SIN Docker (npm start)
```
✓ Más simple
✓ Rápido de iniciar
✓ Directo en tu máquina
✗ Requiere Node.js instalado
✗ Posibles conflictos de puerto
✗ No es reproducible en otros equipos
```

### CON Docker
```
✓ Reproducible en cualquier máquina
✓ Aislado del sistema operativo
✓ Fácil de compartir
✓ Escalable a producción
✓ Consistencia entre dev y prod
✗ Requiere Docker instalado
✗ Ligeramente más lento
```

---

## 🚀 Para Producción (Render, Heroku, etc.)

Si necesitas desplegar a un servicio en la nube:

1. Docker está ya configurado
2. El Dockerfile incluye health checks
3. Las variables de entorno están definidas
4. Solo necesitas hacer push a tu repositorio

---

## 🐛 Troubleshooting

### "Docker daemon is not running"
```
Solución: Abre Docker Desktop y espera a que esté listo
```

### "Port 3001 already in use"
```bash
# Opción 1: Cambiar puerto en docker-compose.yml
# Cambiar "3001:3001" a "3002:3001"

# Opción 2: Liberar el puerto
docker ps
docker stop <container_id>
```

### "Cannot find module"
```bash
# Reconstruir sin caché
docker-compose build --no-cache
docker-compose up
```

### Los cambios no se reflejan
```bash
# Reconstruir y reiniciar
docker-compose down
docker-compose build
docker-compose up
```

---

## 📝 Diferencias entre Métodos de Inicio

### 1. npm start (local)
```bash
cd c:\Users\sanag\Downloads\arman\Github arman\business-docs
npm start
```
**Uso**: Desarrollo local, rápido

### 2. Docker (contenedor)
```bash
docker-compose up
```
**Uso**: Desarrollo, testing, producción

### 3. iniciar.bat (Windows)
```
Doble clic en iniciar.bat
```
**Uso**: Usuarios no técnicos en Windows

---

## ✅ Verificación

Una vez que ejecutes `docker-compose up`:

1. Deberías ver en la consola:
```
✓ Servidor corriendo en http://localhost:3001
✓ Aplicación Arman Travel iniciada
```

2. Abre tu navegador: http://localhost:3001

3. Si funciona, Docker está configurado correctamente

---

## 🔄 Flujo Recomendado

### Desarrollo
```
docker-compose up          ← Inicia todo
Haz cambios en el código
docker-compose restart     ← Reinicia si es necesario
```

### Testing
```
docker-compose down        ← Limpia todo
docker-compose up          ← Fresh start
Prueba la aplicación
```

### Producción
```
git push                   ← Push a repo
Deployment automático
Docker construye y ejecuta
```

---

**¡Docker está listo para usar!** 🐳
