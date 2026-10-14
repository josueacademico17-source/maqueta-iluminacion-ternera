# Maqueta 3D: iluminación de la vía de Ternera (Cartagena)

Escena 3D interactiva (HTML, CSS, JavaScript y Three.js r147) para presentar el proyecto de mejoramiento del alumbrado en un tramo de la vía de Ternera (Av. Pedro de Heredia / Troncal del Caribe). Ubicación de referencia: 10.379556, −75.463064.

## Cómo abrirla

### Opción A: doble clic (la más simple)
1. Abre la carpeta `maqueta-ternera`.
2. Haz doble clic en `index.html`. Se recomienda Chrome o Edge.

Esta opción **necesita internet**, porque Three.js se descarga del CDN jsDelivr. No requiere servidor.

### Opción B: sin internet (recomendada para la presentación)
Antes de la presentación, cuando todavía tengas conexión, descarga las dos librerías en la carpeta `lib/`. Abre PowerShell dentro de `maqueta-ternera` y ejecuta:

```bash
mkdir lib; curl.exe -L -o lib/three.min.js https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js; curl.exe -L -o lib/OrbitControls.js https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js
```

Desde ese momento `index.html` funciona con doble clic y sin internet, porque usa primero la copia de `lib/`.

### Opción C: servidor local (si el navegador bloquea algo)
Haz doble clic en `iniciar.bat`, o ejecuta en la carpeta:

```bash
python -m http.server 8765
```

Luego abre <http://localhost:8765> en el navegador.

## Controles

| Acción | Ratón / botón | Tecla |
|---|---|---|
| Rotar la cámara | clic izquierdo + arrastrar | — |
| Desplazar la cámara | clic derecho + arrastrar | — |
| Acercar o alejar | rueda | — |
| ANTES / DESPUÉS | barra inferior | `Q` / `W` |
| Día / Noche | barra inferior | `N` |
| Vista aérea / planta / peatón / conductor | barra inferior | `1` `2` `3` `4` |
| Recorrido peatonal automático | ▶ Recorrido | `R` |
| Conos de luz / mapa de distribución / etiquetas | panel derecho | `C` / `M` / `L` |
| Modo presentación (oculta los paneles) | — | `H` |
| Información de una luminaria | clic sobre el poste | — |

Secuencia sugerida para la exposición: **Día + Aérea** (reconocer el lugar) → **Peatón** → **Noche + ANTES** → **DESPUÉS** (los postes nuevos brotan y las reubicadas se desplazan) → **Planta + Mapa de distribución** (comparar ANTES y DESPUÉS) → **Recorrido**.

## Qué datos vienen del Excel

Fuente: `Iluminacion_Ternera.xlsx`, hoja `MML_iluminacion`.

- 20 luminarias nuevas con sus postes (ACT.1.2)
- 8 luminarias existentes reubicadas (ACT.1.3)
- 30 luminarias LED de bajo consumo (ACT.3.1)
- Mantenimiento preventivo y correctivo de las existentes (Componente 2), con meta de ≥ 95 % en funcionamiento
- Metas: ≥ 90 % de los puntos medidos con la iluminancia mínima del RETILAP; ≥ 40 % menos de consumo energético; 150 habitantes sensibilizados en 4 jornadas
- Periodo de ejecución: 1 dic 2026 a 15 abr 2027

## Aproximaciones y limitaciones

- **La muestra es ilustrativa.** Representa ≈180 m con 6 nuevas, 2 reubicadas y 3 existentes (con la interdistancia por defecto). No es el inventario completo de 20 + 8.
- El Excel **no trae** potencia, flujo luminoso, temperatura de color, altura de montaje, interdistancia ni la ubicación de cada luminaria. La altura (10 m) y la interdistancia (30 m) son valores de partida **editables** en el panel derecho.
- Los anchos de carril (3,5 m), del separador (6 m) y de los andenes (3 m) se estimaron a partir de las fotos de Street View. La calzada opuesta se modeló simétrica.
- En ANTES, la luminaria E-01 aparece con baja intensidad y la E-03 apagada para ilustrar el problema. Su estado real lo define el diagnóstico (ACT.2.1).
- El color ámbar de las existentes es una suposición; el blanco representa LED.
- Inconsistencia en el Excel: 20 nuevas + 8 reubicadas suman 28, pero se indican 30 LED. El archivo no aclara a qué corresponden las 2 restantes.
- La hoja `Resumen` (presupuesto) tiene referencias rotas (`#REF!`) y no aporta datos.
- La luz es una **simulación visual**. El «mapa de distribución» usa un modelo simple de fuente puntual (E ≈ I·cosθ/d²) en escala relativa. **No es un cálculo fotométrico ni verifica el cumplimiento del RETILAP.**
- En equipos con GPU integrada, el primer cuadro puede tardar unos segundos mientras se compilan los shaders.

## Archivos

- `index.html`: estructura e interfaz
- `styles.css`: estilos
- `script.js`: escena 3D, luminarias, escenarios, cámaras y mapa de distribución
- `iniciar.bat`: lanza el servidor local en Windows (opcional)
- `lib/`: copia local opcional de Three.js (ver opción B)
