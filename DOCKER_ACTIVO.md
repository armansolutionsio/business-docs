# 🐳 DOCKER - ARMAN TRAVEL

## ✅ Estado Actual

El servidor está **corriendo en Docker** en el puerto **3001**.

```
✓ Contenedor: arman-travel-backend
✓ Puerto: 3001
✓ Red: arman-travel-network
✓ Estado: ACTIVO
✓ URL: http://localhost:3001
```

---

## 📋 Cómo Usar Docker

### Para Iniciar

Ya está corriendo automáticamente. Si necesitas reiniciar:

```bash
cd "c:\Users\sanag\Downloads\arman\Github arman\business-docs"
docker-compose up
```

### Para Detener

```bash
# En la terminal donde está corriendo, presiona: Ctrl+C

# O desde otra terminal:
docker-compose down
```

---

## 🔍 Ver Logs

```bash
# Ver logs en tiempo real
docker-compose logs -f backend

# O desde otra terminal si está corriendo en background
docker-compose logs -f
```

---

## 📂 Archivos Docker

### Dockerfile
- Imagen base: `node:18-alpine` (muy ligera)
- Instala dependencias de Node
- Copia la aplicación
- Expone puerto 3001
- Health check incluido

### docker-compose.yml
- Configura el servicio backend
- Mapea puertos (3001:3001)
- Monta volúmenes para desarrollo
- Red personalizada

---

## 🎯 URLs para Acceder

```
Desarrollo:  http://localhost:3001
Contenedor:  http://arman-travel-backend:3001 (desde dentro de la red)
```

---

## 📊 Comandos Útiles

```bash
# Ver estado de contenedores
docker-compose ps

# Ver recursos usados
docker stats

# Ejecutar comando en el contenedor
docker-compose exec backend npm list

# Reconstruir imagen
docker-compose build --no-cache

# Limpiar todo
docker-compose down -v
```

---

## 🚀 Para Producción

Cuando desplegues a un servicio como **Render**, **Heroku**, etc:

1. El `Dockerfile` está optimizado para producción
2. Las variables de entorno se cargan desde `.env`
3. El health check está configurado
4. Puedes cambiar el puerto con la variable `PORT`

Ejemplo en Render:
```
PORT=8080 docker-compose up
```

---

## 💡 Diferencias: Docker vs Sin Docker

### Sin Docker (npm start)
- ✅ Rápido de probar
- ❌ Requiere Node.js instalado
- ❌ Diferencias entre sistemas operativos

### Con Docker
- ✅ Funciona igual en todas partes
- ✅ Aislado del sistema
- ✅ Listo para producción
- ❌ Requiere Docker instalado

---

**¡Tu sistema está corriendo en Docker! 🚀**
