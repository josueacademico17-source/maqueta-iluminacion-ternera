@echo off
cd /d "%~dp0"
echo Iniciando servidor local en http://localhost:8765  (cierra esta ventana para detenerlo)
start "" http://localhost:8765
python -m http.server 8765
if errorlevel 1 (
  echo.
  echo No se encontro Python. Abre index.html con doble clic (requiere internet) o instala Python.
  pause
)
