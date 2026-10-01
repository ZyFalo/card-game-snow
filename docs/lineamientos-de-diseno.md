# Lineamientos de diseño de Ventisca

Toda interfaz nueva debe verse como parte del mismo juego que la portada, la pantalla de equipo y el combate. Este documento fija las reglas de ese estilo, define las piezas que todavía no existían (campos, casillas, mensajes) y lista las correcciones pendientes en las pantallas de cuenta.

**Pantallas de referencia:** la portada, "Tu equipo", el HUD de combate, los resultados, la pausa y la ayuda. Ante la duda, compara con "Tu equipo".

**Regla de uso:** antes de crear una clase o un estilo, busca si ya existe una pieza que lo resuelva. Si hace falta una pieza nueva, se deriva de las existentes y se agrega a este documento en el mismo PR.

## 1. Principios

- **Papel y tinta.** Todo es papel recortado con contorno de tinta y sombra dura. No se usan sombras difusas, bordes de 1 px ni degradados suaves, salvo el pliegue diagonal de `.paper`.
- **Pantallas de juego, no formularios web.** Cada pantalla compone el escenario completo de 1280×720: título grande arriba a la izquierda, contenido en paneles, acciones abajo a la derecha y, cuando tenga sentido, los personajes presentes.
- **Color con significado.** La tinta da estructura. Fuego, agua y nieve dan identidad. El oro marca progreso y recompensas. El rojo (`--danger`) queda solo para errores y acciones peligrosas. Nunca se usa el azul genérico de los enlaces.
- **Dos tipografías.** Dela Gothic One para títulos y números grandes; Zen Kaku Gothic New para todo lo demás.
- **Movimiento con propósito.** Entradas escalonadas y la transición de hoja. Todo respeta "animaciones reducidas".

## 2. Tokens

Siempre variables de `:root`. Ningún color, sombra ni tamaño de letra se escribe a mano.

| Token | Uso |
| --- | --- |
| `--paper`, `--paper-hi`, `--paper-lo` | Fondo de pantalla, superficie de paneles y campos, zonas hundidas |
| `--ink`, `--ink-2`, `--ink-3` | Texto y bordes, texto secundario, texto de apoyo y placeholders |
| `--fire`, `--water`, `--snow` (con `-lo` y `-soft`) | Identidad de cada ninja y elemento. `--water` también es el color del foco |
| `--ice` | Sombra del nombre del juego y detalles de hielo |
| `--gold` | Monedas, progreso y recompensas |
| `--danger` | Errores y acciones irreversibles |
| `--font-display`, `--font-ui` | Títulos y números grandes; todo lo demás |

**Escala de texto** (a 1280×720):

| Uso | Tamaño |
| --- | --- |
| Nombre del juego, solo en la portada | 104 px, con `text-shadow: 5px 5px 0 var(--ice)` |
| Título de pantalla (`.screen-head h1`) | 40 px / 1,1, tipografía de títulos |
| Subtítulo (`.screen-head p`) | 500 16 px / 1,45, `--ink-2`, máximo 760 px de ancho |
| Botones | 700 15 px (18 px en `.btn-lg`) |
| Cuerpo | 15 a 16 px |
| Texto de apoyo | 13 px como mínimo; nada por debajo de 12 px |

**Geometría:**

| Elemento | Valor |
| --- | --- |
| Bordes | 2 px de `--ink` |
| Radios | 12 px en paneles; 10 px en botones, chips y campos |
| Sombras | 4px 4px 0 `--ink` en paneles; 3px 3px 0 `--ink` en botones y campos; 3px 3px 0 `--fire` en el botón primario |
| Márgenes de pantalla | 56 px a los lados y 34 px arriba (`.screen-head`) |
| Separaciones | 8, 12, 16 o 24 px |
| Foco | `outline: 3px solid var(--water); outline-offset: 3px` en todo lo interactivo, campos y enlaces incluidos |

## 3. Piezas existentes: reutilizar

- **`.screen` y `.screen-head`** (con `h1` y `p`): en toda pantalla.
- **`.paper`:** en paneles y tarjetas.
- **`.btn`, `.btn-primary` y `.btn-lg`:** un solo botón primario por vista; los demás son `.btn`.
- **`.seg`:** para elegir entre dos y cuatro opciones.
- **`.toggle`:** para ajustes de sí o no.
- **`.chip`:** para datos compactos.
- **`.kbd`:** para atajos de teclado.
- **Íconos:** los SVG del juego (`Icon` en `ui/common.tsx`). Ni emoji ni íconos externos.
- **Retratos:** los de los ninjas (`art.bust`), cuando la pantalla habla de un personaje o de la persona.

## 4. Piezas nuevas para formularios

Se derivan de las existentes y viven junto a ellas en `ui/common.tsx` y `styles.css`.

- **Campo (`.field`):**
  - etiqueta en 700 13 px `--ink`, arriba del campo;
  - campo de 44 px de alto, fondo `--paper-hi`, borde 2 px `--ink`, radio 10 px y sombra 3px 3px 0 `--ink`;
  - texto de 16 px, que además evita el zoom automático en móviles, y placeholder en `--ink-3`;
  - ayuda debajo en 13 px `--ink-2`;
  - en error, borde y sombra en `--danger`, con el mensaje debajo, con ícono y en `--danger`.
- **Casilla (`.check`):** cuadro de 22 px con borde 2 px `--ink` y radio 6 px. Marcada, fondo `--ink` con la marca en `--paper-hi`.
- **Enlaces:**
  - dentro de un texto, en `--ink`, subrayados con 2 px de grosor y 3 px de separación;
  - las acciones secundarias son botones `.btn`, no enlaces.
- **Mensaje (`.notice`):** panel `.paper` compacto, con una franja izquierda de color (`--danger`, `--gold` o `--snow`), un ícono y texto de 14 px.
- **Botón de peligro (`.btn-danger`):** la misma construcción de `.btn`, con fondo `--danger`, texto `--paper-hi` y sombra 3px 3px 0 `--ink`. Siempre pide confirmación.
- **Ocupado:** el botón cambia su texto ("Enviando…") y queda deshabilitado. Nunca un indicador de carga suelto.

## 5. Composición de pantallas

- **Estructura común:**
  - `.screen-head` arriba a la izquierda;
  - contenido en la banda central;
  - acciones abajo a la derecha, con "Volver" a la izquierda del primario, como en "Tu equipo".
- **Formularios:** nunca un panel solo flotando en el centro.
  - **Composición en dos columnas:** a la izquierda, el panel del formulario, de 440 a 480 px de ancho; a la derecha, la ilustración (los tres ninjas, o el de la carta de camino de la persona) y dos o tres beneficios concretos, por ejemplo "Tu progreso queda guardado", "Juega en línea con amigos" y "Tu colección de cartas".
  - **Verificar un código:** el código ocupa el centro, con dígitos grandes en la tipografía de títulos.
- **Texto largo** (aviso de privacidad, ayuda):
  - pantalla completa de lectura, en una columna de 680 a 720 px;
  - cuerpo de 15 a 16 px con interlineado 1,6, y títulos de sección en la tipografía de títulos a 20 px;
  - el texto se desplaza dentro de su panel y nunca se corta.
- **Portada:** se mantiene la jerarquía original:
  - el nombre del juego, la línea superior y el lema;
  - una fila de botones (primario "Jugar sin cuenta" y secundarios);
  - los ninjas a la derecha y un pie discreto.

## 6. Textos

- Español neutro, frases cortas y verbos en los botones: "Entrar", "Crear cuenta", "Enviar código".
- Los errores dicen qué pasó y cómo arreglarlo, en una frase, sin jerga técnica.

## 7. Movimiento y accesibilidad

- **Movimiento:** se reutilizan las entradas escalonadas (`riseIn`, `dropIn`) y la transición de hoja. No se agregan animaciones nuevas sin su versión para "animaciones reducidas".
- **Etiquetas:** toda etiqueta está asociada a su campo.
- **Foco:** visible en todo lo interactivo.
- **Teclado:** todo se puede usar con él.
- **Contraste:** tinta sobre papel siempre. Nunca texto blanco sobre `--snow` o `--gold`.

## 8. Cómo verificar una pantalla nueva

1. Captura a 1280×720 junto a una pantalla de referencia ("Tu equipo" o la portada). La pregunta es simple: ¿parece del mismo juego?
2. Revisa esta lista:
   - solo tokens, sin colores ni tamaños sueltos en el CSS nuevo;
   - un solo primario;
   - acciones abajo a la derecha;
   - texto de 13 px o más;
   - foco visible.
3. **Prueba automática de desbordes:** en las e2e de cada pantalla nueva, recorre los elementos visibles y falla si alguno tiene `scrollWidth > clientWidth` sin permitir desplazamiento. Así se detecta el texto cortado.

## 9. Correcciones pendientes en las pantallas de cuenta

Es el primer uso de estos lineamientos. Ver `diseno/comparacion-cuentas.png`.

- **Entrar y Crear cuenta:** hoy son un panel flotante arriba al centro, con la mitad inferior vacía y aspecto de formulario web.
  - Recomponer en dos columnas, con ilustración y beneficios (sección 5).
  - Campos con el estilo de la sección 4.
  - "¿Olvidaste tu contraseña?" como enlace bajo el campo de contraseña.
  - "Crear una cuenta" como botón secundario junto a "Entrar".
  - "Deshacer un cambio de correo" como enlace discreto al pie.
  - "Volver" en la barra de acciones, abajo.
- **Aviso de privacidad:** en la captura a 1280×720, el texto se corta por la derecha ("Su responsable es William Andres Pe…"). Convertirlo en pantalla completa de lectura (sección 5) y cubrirlo con la prueba de desbordes.
- **Verificación, recuperación, perfil y deshacer cambio de correo:** mismas reglas.
- **CSS de cuentas:** reemplazar los valores sueltos por tokens y las clases propias por las piezas de las secciones 3 y 4.
