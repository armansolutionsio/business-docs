# 🎨 GUARDAR TU LOGO EN EL SISTEMA

## Opción 1: Guardar el Logo del Adjunto (RECOMENDADO)

El logo que viste al principio (con los colores azul y turquesa) es perfecto para Arman Travel.

### Pasos:
1. **Descarga el logo** que ves en la interfaz
2. **Renómbralo** como: `logo.png`
3. **Guárdalo aquí**: `public/logo.png`
4. **Reinicia el servidor**: `npm start`
5. ✅ El logo aparecerá automáticamente en los documentos

---

## Opción 2: Si Tienes un Logo Local

### Pasos:
1. Ubica tu archivo de logo (PNG, JPG, etc.)
2. Cópialo a: `public/logo.png`
3. Si no es PNG, convierte primero a PNG (recomendado)
4. Reinicia el servidor

---

## Opción 3: Usar el Script de Procesamiento

Si tienes Python instalado:

```powershell
# Instalar Pillow si no lo tienes
pip install pillow

# Ejecutar el script
python process_logo.py
```

El script:
- ✅ Busca automáticamente un logo en public/
- ✅ Lo redimensiona si es muy grande
- ✅ Lo convierte a PNG si es necesario
- ✅ Lo optimiza para uso en documentos

---

## 🎨 Especificaciones Recomendadas para el Logo

| Especificación | Recomendación |
|---|---|
| **Formato** | PNG (con transparencia) o JPG |
| **Tamaño** | 200x200px o mayor |
| **Relación** | Cuadrado (1:1) o rectangular |
| **Colores** | RGB o RGBA |
| **Calidad** | Alta resolución (mínimo 300 DPI) |

---

## 📍 Ubicación Exacta del Archivo

```
c:\Users\sanag\Downloads\arman\Github arman\business-docs\
└── public/
    └── logo.png  ← COLOCAR AQUÍ
```

---

## ✅ Verificación

Después de guardar el logo:

1. **Reinicia el servidor**: `npm start`
2. **Abre**: http://localhost:3001
3. **Crea un documento**
4. **Descarga en PDF**
5. ✅ El logo debe aparecer en la esquina superior izquierda

---

## 🔄 Cambiar Logo Después

Si deseas cambiar el logo:

1. Reemplaza `public/logo.png` con uno nuevo
2. Reinicia el servidor
3. Los nuevos documentos usarán el nuevo logo

---

## 🐛 Si el Logo No Aparece

**Problema**: El logo no se ve en los documentos

**Soluciones:**

1. **Verifica el nombre exacto**:
   - Debe ser: `logo.png` (minúsculas)
   - No: `LOGO.PNG` o `Logo.PNG`

2. **Verifica la ubicación**:
   - Debe estar en: `public/`
   - No en: `src/` o `frontend/`

3. **Comprueba el formato**:
   - Mejor: PNG o JPG
   - Evita: BMP, TIFF, etc.

4. **Reinicia el servidor**:
   ```powershell
   # Presiona Ctrl+C para detener
   # Luego
   npm start
   ```

5. **Limpia caché del navegador**:
   - Presiona: Ctrl+Shift+Del
   - Selecciona: "Imágenes en caché"
   - Haz clic: "Limpiar"

---

## 💡 Consejos

✨ Si el logo tiene fondo blanco, convierte a PNG con transparencia
✨ Los logos cuadrados funcionan mejor en documentos
✨ Usa logos con buen contraste (el azul turquesa es perfecto)
✨ Evita logos muy grandes (< 500KB)

---

## 📞 Si Sigue Sin Funcionar

1. Verifica en la **consola del navegador** (F12):
   - ¿Hay errores de red?
   - ¿Se carga la imagen?

2. Intenta:
   ```powershell
   npm install
   npm start
   ```

3. Prueba con un logo PNG simple (descargable del web)

---

## ✅ Logo Guardado Exitosamente

Una vez que veas el logo en un PDF descargado, ¡está todo configurado!

**Logo correcto:**
- ✅ Aparece en encabezado PDF
- ✅ Aparece en encabezado Word
- ✅ Mantiene proporción
- ✅ Color intacto

---

**¡Tu sistema está listo con el logo de Arman Travel!** 🎨✈️
