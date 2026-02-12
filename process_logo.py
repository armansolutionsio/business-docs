#!/usr/bin/env python3
"""
Script para procesar y optimizar el logo de Arman Travel
Requisitos: pip install pillow
"""

import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ Pillow no está instalado.")
    print("Instálalo con: pip install pillow")
    exit(1)

def process_logo():
    """Procesa el logo para usarlo en documentos PDF y Word"""
    
    script_dir = Path(__file__).parent
    public_dir = script_dir / 'public'
    
    # Buscar archivo de logo existente
    logo_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif']
    logo_file = None
    
    for ext in logo_extensions:
        for file in public_dir.glob(f'*{ext}'):
            if 'logo' in file.name.lower():
                logo_file = file
                break
    
    if not logo_file:
        print("❌ No se encontró archivo de logo en public/")
        print("Por favor coloca el logo como 'logo.png' en la carpeta 'public/'")
        return False
    
    print(f"✓ Archivo encontrado: {logo_file.name}")
    
    try:
        # Abrir imagen
        img = Image.open(logo_file)
        print(f"✓ Imagen cargada: {img.size} ({img.format})")
        
        # Redimensionar si es muy grande
        max_size = (200, 200)
        if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            print(f"✓ Imagen redimensionada a: {img.size}")
        
        # Convertir a PNG si no lo es
        if logo_file.suffix.lower() != '.png':
            png_path = public_dir / 'logo.png'
            img = img.convert('RGBA')
            img.save(png_path, 'PNG', quality=95)
            print(f"✓ Convertido a PNG y guardado")
            logo_file.unlink()  # Eliminar archivo original
        else:
            img.save(logo_file, 'PNG', quality=95)
            print(f"✓ Logo optimizado y guardado")
        
        print("\n✅ Logo procesado exitosamente!")
        print(f"   Ubicación: public/logo.png")
        print(f"   El logo se utilizará en los documentos PDF y Word")
        return True
        
    except Exception as e:
        print(f"❌ Error al procesar imagen: {e}")
        return False

if __name__ == '__main__':
    print("=" * 50)
    print("  Procesador de Logo - Arman Travel")
    print("=" * 50)
    print()
    
    success = process_logo()
    
    if success:
        print("\n💡 Próximos pasos:")
        print("   1. Inicia el servidor: npm start")
        print("   2. Abre http://localhost:3001")
        print("   3. Tu logo aparecerá en los documentos generados")
