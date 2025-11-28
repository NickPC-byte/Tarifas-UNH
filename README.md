# Widget Tarifario TUPA / TUSNE - UNH

Este repositorio contiene un widget web que muestra las tarifas del TUPA/TUSNE directamente desde un Google Sheets publicado en CSV. Usa PapaParse para parseo correcto del CSV y Fuse.js para búsqueda aproximada.

## Archivos principales
- `index.html` — interfaz y modal
- `style.css` — estilos (paleta institucional)
- `script.js` — lógica: carga CSV, filtros, búsqueda y render
- No requiere servidor: funciona en GitHub Pages

## Pasos para publicar en GitHub Pages
1. Crear un repositorio público (por ejemplo `tupa-tusne-widget`) en GitHub.
2. Subir los 3 archivos (`index.html`, `style.css`, `script.js`) a la raíz del repositorio.
3. Ir a **Settings → Pages** y seleccionar la rama `main` y carpeta `/ (root)`. Guardar.
4. Esperar unos minutos. La URL será:
   `https://TU_USUARIO.github.io/NOMBRE-REPO/`

## Actualizar la fuente de datos
Los datos se obtienen desde la URL CSV que ya está embebida en `index.html` (variable `SHEET_CSV_URL`). Si quieres cambiar la hoja:
- Publica la hoja en Google Sheets como CSV (Archivo → Publicar en la web → CSV).
- Reemplaza la URL en `index.html` (variable `SHEET_CSV_URL`).

## Notas
- PapaParse maneja comas y saltos de línea en las celdas correctamente.
- Fuse.js permite búsquedas aproximadas (fuzzy) para que la búsqueda funcione aunque el usuario cometa errores de tipografía o use mayúsculas/minúsculas mixtas.
- El modal muestra únicamente los requisitos (Modelo 1).

## Soporte
Si quieres:
- Añadir paginación, orden por monto, export a Excel o PDF,
- Ajustar estilos a la identidad visual exactamente,
- Añadir campo "Ubicación" con enlace a Google Maps,

Puedo entregarlo en la siguiente iteración.
