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
| `--el`, `--el-lo`, `--el-soft`, `--el-ink` | Dentro de `.el-fire`, `.el-water` y `.el-snow`, los colores de ese elemento. `--el-ink` es el del texto que va sobre `--el`: papel sobre fuego y agua, y tinta sobre nieve |
| `--ice` | Sombra del nombre del juego y detalles de hielo |
| `--gold` | Monedas, progreso y recompensas |
| `--danger` | Errores y acciones irreversibles |
| `--font-display`, `--font-ui` | Títulos y números grandes; todo lo demás |

**Escala de texto** (a 1280×720):

| Uso | Tamaño |
| --- | --- |
| Nombre del juego, solo en la portada | 104 px, con `text-shadow: 5px 5px 0 var(--ice)` |
| Número de una carta recién salida de una caja | 72 px, tipografía de títulos |
| Título de pantalla (`.screen-head h1`) | 40 px / 1,1, tipografía de títulos |
| Título de un panel, como el nombre de cada ninja en "Tu equipo" | 26 px, tipografía de títulos |
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
| Elegido | Un aro de 3 px de `--gold` alrededor, además de su sombra, como la carta elegida de la mano |

La escala y la geometría también son variables de `:root`: `--text-hero`, `--text-title`, `--text-panel`, `--text-section`, `--text-lead`, `--text-body`, `--text-notice`, `--text-small`, `--text-btn` y `--text-btn-lg`; `--leading` y `--leading-read`; `--line`; `--radius-panel`, `--radius-control` y `--radius-check`; `--shadow-panel`, `--shadow-control`, `--shadow-primary`, `--shadow-danger`, `--ring` (el aro de lo elegido) y `--shade` (la sombra de los ninjas en el suelo); `--control-h`; `--gap-1` a `--gap-4`; `--edge-x` y `--edge-top`; `--focus` y `--focus-offset`.

## 3. Piezas existentes: reutilizar

- **`.screen` y `.screen-head`** (con `h1` y `p`): en toda pantalla.
- **`.paper`:** en paneles y tarjetas.
- **`.btn`, `.btn-primary` y `.btn-lg`:** un solo botón primario por vista; los demás son `.btn`.
- **`.seg`:** para elegir entre dos y cuatro opciones.
- **`.toggle`:** para ajustes de sí o no.
- **`.chip`:** para datos compactos.
- **`.tag`:** una etiqueta de estado, como "Próximamente": un `.chip` en pequeño, con el mismo borde y radio, texto de 13 px en `--ink-2` y fondo `--paper-lo`. Va junto a un texto o dentro de una lista.
- **`.kbd`:** para atajos de teclado.
- **Íconos:** los SVG del juego (`Icon` en `ui/common.tsx`). Ni emoji ni íconos externos.
- **Retratos:** los de los ninjas (`art.bust`), cuando la pantalla habla de un personaje o de la persona.
- **`.screen-actions`:** la fila de acciones abajo a la derecha, igual que la de "Tu equipo". Admite a su izquierda un enlace discreto (`.foot`).
- **`.toast`:** el aviso flotante del combate. Se llamaba `.notice` hasta que ese nombre pasó al mensaje de la sección 4.

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

En el código, en `ui/common.tsx`: `Field` (con `hint`, `error` y `code` para los dígitos grandes), `Check`, `Notice` (tonos `danger`, `gold` y `snow`) y `SubmitButton` (con `busy` y `danger`). Los enlaces son `.link`, y `.link-quiet` el discreto.

## 5. Composición de pantallas

- **Estructura común:**
  - `.screen-head` arriba a la izquierda;
  - contenido en la banda central;
  - acciones abajo a la derecha, con "Volver" a la izquierda del primario, como en "Tu equipo".
- **Formularios:** nunca un panel solo flotando en el centro.
  - **Composición en dos columnas:** a la izquierda, el panel del formulario, de 440 a 480 px de ancho; a la derecha, la ilustración (los tres ninjas, o el de la carta de camino de la persona) y dos o tres beneficios concretos, por ejemplo "Tu progreso queda guardado", "Juega en línea con amigos" y "Tu colección de cartas".
  - **Verificar un código:** el código ocupa el centro, con dígitos grandes en la tipografía de títulos.
  - **En el código:** `NinjaTrio` (los tres ninjas de pie) y `Points` (dos o tres puntos, con un ícono o un número de paso y, si hace falta, una etiqueta `.tag`), en `ui/common.tsx`.
  - **Beneficios que todavía no existen:** llevan la etiqueta "Próximamente", que se quita cuando llega cada uno.
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

En el código, en `apps/web/e2e/helpers.ts`: `clippedElements` busca el texto cortado y `smallText`, el de menos de 13 px.

## 9. Correcciones pendientes en las pantallas de cuenta

Es el primer uso de estos lineamientos. Ver `diseno/comparacion-cuentas.png`; el antes y el después de cada pantalla, junto a "Tu equipo", están en la descripción del PR #13.

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

## 10. Piezas del progreso

Llegaron con las pantallas del progreso de la cuenta: elegir el camino, la colección con la tienda y el resumen del perfil. Se derivan de las piezas existentes y viven en `ui/CardFace.tsx`, `ui/Progress.tsx` y `styles.css`.

- **Cara de carta (`.cface`, `CardFace`):** la misma construcción de las cartas de la mano.
  - Franja de arriba en el color del elemento, con su nombre en `--el-ink`; el número en la tipografía de títulos, a 40 px, o a 72 px al abrir una caja; debajo, el nombre de la carta en 13 px `--ink-2`.
  - Tres tamaños: `sm` en la colección, donde ocupa su casilla; `md` al elegir el camino; `lg` al abrir una caja.
  - La que falta es una silueta: papel rayado, borde de trazos y sin color.
  - Recién salida de una caja lleva una franja al pie: "Nueva" en `--gold` o "Repetida" en `--paper-lo`.
- **Monedas (`.coins`, `Coins`):** el ícono de la moneda y la cantidad en 700 15 px. Como dato suelto va en su propio chip (`.coin-chip`). El oro va solo en el ícono.
- **Pestañas (`.tabs` y `.tab`):** para cambiar entre los tres elementos. Se construyen como `.seg`; la elegida toma el color de su elemento, con el texto en `--el-ink` y la sombra de los botones.
- **Opción grande (`.camino-option`):** un panel `.paper` que es un botón, para elegir entre pocas opciones con ilustración. La elegida se levanta y lleva el aro de `--gold`.
- **Resumen (`.summary` y `.summary-stats`):** el encabezado de las tarjetas de "Tu equipo" (retrato, título y una línea en el color del elemento) y, debajo, una fila de datos, cada uno con su nombre en 13 px y su valor en la tipografía de títulos.
- **Nota junto a las acciones (`.screen-actions p.foot`):** una frase a la izquierda de la fila de acciones, en 15 px `--ink-2`.
- **Colección y tienda:** las cartas ocupan la columna izquierda hasta el borde inferior; a la derecha van el panel de la tienda y, debajo, las acciones. El saldo va arriba a la derecha, junto al título.
- **Ocupado al comprar:** el botón de la caja que se compra dice "Comprando…" y todos los de compra quedan deshabilitados hasta que llega la respuesta.
- **Si la respuesta de una compra se pierde:** un mensaje (`.notice`) lo dice bajo los botones, y esa caja sigue habilitada para comprarla de nuevo, aunque el saldo ya no alcance.
- **Un aviso reemplaza la pista de las monedas:** el aviso y la pista no caben a la vez en el panel de la tienda, así que la pista vuelve cuando el aviso se va.
- **Lo que todavía no existe:** las monedas se ganarán en las partidas en línea. Hasta entonces, la tienda lo dice en futuro y con la etiqueta "Próximamente".

## 11. Tablero

El tablero es la escena de Phaser (`apps/web/src/game/`). Mientras se planifica muestra capas, y cada capa dice una sola cosa. Qué capa se ve y cuándo lo decide `state/board.ts`, que tiene sus pruebas; la escena solo dibuja. Los colores salen de `art/palette.ts`, que repite los tokens de la sección 2.

Esta sección crece con la ronda de claridad del tablero (D-74). Hoy describe su primer paso, el orden visual. La regla de un solo modo a la vez llega con el paso siguiente, "foco y pasos".

### Cada unidad cabe en su casilla

La casilla mide 100×84 px. Dentro van la figura, su barra de vida y sus estados, así una unidad nunca tapa a la de la casilla de arriba ni a su barra:

- **La figura** se apoya a 67 px del borde de arriba de la casilla y no lo pasa.
- **La barra de vida** va al pie, bajo la figura, con su número a la derecha, en 13 px. Usa el color del elemento del ninja, `ICE.deep` en los gólems y `--danger` cuando queda el 30 % o menos.
- **Los íconos de estado** van arriba a la derecha, uno bajo el otro. Una unidad tiene dos como mucho: escudo y potencia, o aturdido y quemado.
- **El número de orden** (D-32) va arriba a la izquierda de la casilla desde la que actúa el ninja.

Los efectos del combate (proyectiles, impactos y números de daño) sí pueden salirse: duran un instante. `game/layout.test.ts` mide lo que dibuja cada figura y falla si deja de caber.

### Capas de la planificación

De abajo hacia arriba:

| Capa | Qué muestra | Color | Cuándo se ve |
| --- | --- | --- | --- |
| Alcance de un gólem | Las casillas que puede golpear en su turno | `--danger`, con relleno tenue y borde | Con el ratón sobre ese gólem |
| Ninja activo | Un aro en el suelo, bajo sus pies | El de su elemento | Mientras se planifica a ese ninja |
| Casillas de movimiento | A dónde puede moverse el ninja activo | El color suave de su elemento (`--fire-soft`, `--water-soft` o `--snow-soft`), con el borde y el punto en el color del elemento | Mientras se planifica a ese ninja, sin una carta elegida |
| Carta por colocar | Un círculo en cada casilla donde se puede colocar; bajo el ratón, el área de 3×3, una diana sobre cada gólem que alcanzaría y, con la carta de Nieve, una cruz sobre cada ninja | El del elemento; las dianas, en `--danger`, y las cruces, en `--snow` | Con una carta elegida |
| Camino | La línea del ninja a su fantasma, por la línea de los pies | El de su elemento | Solo para el ninja activo |
| Fantasma | La silueta sin relleno del ninja, en la casilla a la que planea moverse | El de su elemento | Para cada ninja que planea moverse |
| Carta colocada | El área de 3×3 con su borde y, en el centro, el valor de la carta | El del elemento | Para cada carta ya colocada |
| Línea de mira | De la casilla desde la que actúa un ninja al objetivo de su acción planeada | El del elemento de quien actúa | Solo con el ratón: sobre el objetivo, sobre quien actúa o sobre su fantasma |
| Objetivos posibles | Una diana tenue sobre cada gólem al alcance, una cruz sobre el aliado que se puede curar y una flecha sobre el caído que se puede revivir | `--danger`, `--snow` y `--gold` | Para el ninja activo, sin una carta elegida |
| Objetivo elegido | Atacar: un anillo sobre el objetivo, con un arco del color de cada atacante. Curar: la cruz. Revivir: la flecha. Encima, un punto por cada ninja que lo eligió | El anillo y los puntos, del elemento de cada ninja | Para cada acción planeada |
| Casilla bajo el ratón | Un borde | `--ink` | Con el ratón sobre el tablero |
| Número de orden | El orden real en que actuará cada ninja (D-32) | El de su elemento | Para cada ninja con una acción planeada |

- **La forma dice qué acción es:** atacar es un anillo, curar es una cruz y revivir es una flecha. **El color dice quién actúa.** El panel de cada ninja lo repite con palabras ("Atacar a Témpano").
- **Tinta alrededor:** el anillo, los puntos y la línea de mira llevan borde de tinta, para leerse sobre cualquier figura.
- **Los planes de los demás no se cruzan:** un ninja que no está activo deja en el tablero su fantasma, su marca sobre el objetivo y su número de orden. Su camino no se dibuja, y su línea de mira aparece solo con el ratón.

### La mano

- Muestra solo las cartas que hay: un lugar sin carta no se dibuja.
- Vacía, dice bajo su título cómo se ganan: "Llena el medidor para ganar cartas".
- Guarda su alto aunque esté vacía, para que su título no salte al cambiar de ninja.

### El fondo

- Deja lisa la franja de abajo, donde van los paneles de los ninjas y la mano: de 544 px hacia abajo solo hay campo nevado (`HUD_BAND_Y` en `art/scenery.ts`). Las montañas, los acantilados y los pinos se apoyan en esa línea o más arriba.
- Así ninguna línea del fondo cruza el título de la mano ni la pista de las teclas, que van sobre el fondo sin panel propio. `art/scenery.test.ts` lo mide en los tres mapas.
