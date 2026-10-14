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
| `--danger` | Errores y acciones irreversibles. En el tablero, lo de los gólems: su alcance, la mira de atacarlos y las casillas de una carta |
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
| Separaciones | 8, 12, 16, 24 o 32 px. En las pantallas nuevas, las del respiro de la sección 12: 8, 16, 24 y 32 |
| Foco | `outline: 3px solid var(--water); outline-offset: 3px` en todo lo interactivo, campos y enlaces incluidos |
| Elegido | Un aro de 3 px de `--gold` alrededor, además de su sombra, como la carta elegida de la mano |

La escala y la geometría también son variables de `:root`: `--text-hero`, `--text-title`, `--text-panel`, `--text-section`, `--text-lead`, `--text-body`, `--text-notice`, `--text-small`, `--text-btn` y `--text-btn-lg`; `--leading` y `--leading-read`; `--line`; `--radius-panel`, `--radius-control` y `--radius-check`; `--shadow-panel`, `--shadow-control`, `--shadow-primary`, `--shadow-danger`, `--ring` (el aro de lo elegido) y `--shade` (la sombra de los ninjas en el suelo); `--control-h`; `--gap-1` a `--gap-5`; `--edge-x` y `--edge-top`; `--focus` y `--focus-offset`. Las de la grilla y el respiro (`--grid-*`, `--space-*` y `--read-max`) están en la sección 12.

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
  - en una pantalla de lectura llevan el peso del texto: los distingue el subrayado;
  - los que llevan fuera del juego (D-108) se abren en otra pestaña, con `rel="noopener"` y sin parámetros de seguimiento, y a un lector de pantalla le dicen que se abren en otra pestaña. Sin `noreferrer`: el portafolio cuenta las visitas que llegan desde el juego;
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
- **Texto corto** (créditos): la misma pantalla de lectura, con su panel ajustado al texto (`.reading-short`) en vez de llenar la columna.
- **"Tu equipo":** bajo las tres tarjetas, las opciones van en dos filas. Arriba, el ritmo y la dificultad, a lo ancho. Debajo, las ayudas, en renglones de tres, a la izquierda de las acciones: así el grupo puede crecer sin empujar los botones.
- **Portada:** se mantiene la jerarquía original:
  - el nombre del juego, la línea superior y el lema;
  - una fila de botones (primario "Jugar sin cuenta" y secundarios);
  - los ninjas a la derecha y un pie discreto: una frase que dice qué es el proyecto y de quién y, separados por puntos medios, los enlaces a los créditos y al aviso de privacidad (`.title-foot`). Va en la tinta de los subtítulos (`--ink-2`), que sobre el papel pasa de 4,5 a 1, lo que pide la letra pequeña;
  - en la esquina de enfrente, el sello de quien hace Ventisca (`.title-seal`, D-108): a 28 px, centrado en la línea del pie y con su mismo margen, como contrapeso del texto.
    - **Es su marca y va tal cual:** es la única pieza de la interfaz que no lleva el contorno ni la sombra del juego. Es un archivo del juego (`src/art/wpena.svg`) y va incrustado en él.
    - **Al pasar el ratón o al llegar con el teclado** dice a dónde lleva, a su izquierda, en la línea del pie y con su misma letra. Con el ratón sube 2 px, salvo con animaciones reducidas.
    - **En teléfono** queda en la misma esquina: la portada es el escenario a escala.

## 6. Textos

- Español neutro, frases cortas y verbos en los botones: "Entrar", "Crear cuenta", "Enviar código".
- Los errores dicen qué pasó y cómo arreglarlo, en una frase, sin jerga técnica.
- Se le habla siempre a quien juega, y el ninja se nombra en tercera persona: "Elige a dónde se mueve Brasa", no "Brasa: elige a dónde moverte".
- Una sola fórmula para pasar de ninja, igual en todos lados: "Elige otro ninja con un clic o con Tab." (D-79). La ayuda agrega dónde va el clic: "con un clic, en el tablero o en su panel, o con Tab".

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
3. **Prueba automática de desbordes:** en las e2e de cada pantalla nueva, recorre los elementos visibles y falla si alguno tiene `scrollWidth > clientWidth` sin permitir desplazamiento. Así se detecta el texto cortado, y el que se sale de una caja que se ve (con borde, fondo o sombra). No cuenta lo que pasa el ancho de una caja invisible y se ve entero, porque nada lo corta: el nombre del juego en la portada es más ancho que el bloque que lo ordena.

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
- **Aviso de privacidad:** en la captura a 1280×720, el texto se corta por la derecha ("Su responsable es William Andrés Pe…"). Convertirlo en pantalla completa de lectura (sección 5) y cubrirlo con la prueba de desbordes.
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

El tablero es la escena de Phaser (`apps/web/src/game/`). Mientras se planifica muestra capas, y cada capa dice una sola cosa. Qué capa se ve y cuándo lo decide `state/board.ts`, y qué hace cada clic, `state/steps.ts`; los dos tienen sus pruebas, y la escena solo dibuja. Los colores salen de `art/palette.ts`, que repite los tokens de la sección 2.

Esta sección crece con la ronda de claridad del tablero (D-74). Hoy describe el orden visual, el foco, con los ajustes que le siguieron, y la información a pedido, y cómo se ve la reanimación (D-77).

**El tablero muestra lo que se puede hacer, no el resultado:** el cálculo es de quien juega. Lo demás es a pedido: con el ratón, o con las ayudas opcionales (D-78).

### Planificar, y la carta

Al planificar a un ninja, el tablero le ofrece a la vez sus casillas y sus objetivos. No hay un paso de moverse: como en el original, solo la carta es un modo aparte.

| Modo | Cuándo | Qué ofrece el tablero | Qué acepta un clic |
| --- | --- | --- | --- |
| **Planificar** | Al activar un ninja | A la vez, las casillas de su color, a las que puede ir, y los objetivos que alcanza desde donde va a estar: su casilla planeada o, si no se mueve, la suya | Una casilla de su color lo mueve; la de su fantasma, o la suya, cancela el movimiento. Un objetivo elige la acción, sin moverse o después de moverse |
| **Carta** | Al elegir una carta de la mano, antes o después de moverse | Solo casillas rojas: dónde cabe la carta. Bajo el ratón, su área de 3×3 | Una casilla roja. Esc devuelve la carta a la mano |

- **Un objetivo se elige sin moverse.** Un clic en un gólem a su alcance lo ataca desde donde está: no hace falta decir antes que se queda.
- **Al moverse, los objetivos se recalculan** desde la casilla nueva. Si el que ya había elegido queda fuera de alcance, se quita y un aviso lo dice.
- **Las casillas no se apagan después de moverse:** siguen a la vista, más tenues, y quien juega cambia de destino con otro clic, sin volver atrás.
- **El foco no salta solo** (D-79). Quien juega elige otro ninja con un clic, en el tablero o en su panel, o con Tab; cuando el ninja activo ya no tiene nada por decidir, la franja de arriba se lo dice: "Elige otro ninja con un clic o con Tab." Con la ayuda "Pasar al siguiente ninja", que viene apagada, el foco pasa solo al elegir la acción: el objetivo o la casilla de la carta. Tras moverse nunca salta, aunque desde ahí no alcance a nadie.
- **Deshacer va hacia atrás, de a una cosa:** la carta en la mano, la acción, la casilla.
- **La forma dice qué acción es:** atacar es una mira o un anillo, curar es una cruz y revivir es una flecha. **El color dice quién actúa:** el anillo de un ataque elegido lleva un arco del color de cada ninja que lo eligió. Nada depende solo del color.

### Los objetivos: posibles y elegidos

| | Atacar | Curar | Revivir |
| --- | --- | --- | --- |
| **Posible,** para el ninja activo | Una mira tenue, en `--danger` | Una cruz tenue, en `--snow` | Una flecha tenue, en `--gold` |
| **Elegido,** de cualquier ninja y en cualquier modo | Un anillo con un arco del color de cada ninja que lo eligió | La cruz, sólida | La flecha, sólida |

- **Encima de cada objetivo elegido va un punto por cada ninja que lo eligió,** en orden Fuego, Agua, Nieve.
- **El anillo muestra de un vistazo quién ataca a quién** y cómo se concentra el equipo: con un atacante es de un color; con dos, mitad y mitad; con tres, en tercios.
- **La marca de un objetivo elegido se ve siempre,** también la de los ninjas que no están activos: es la marca compacta del plan del equipo.

### Los planes del equipo: silueta y marca

Un ninja que no está activo deja en el tablero solo esto:

- **Su silueta,** en la casilla a la que planea moverse.
- **La marca de su objetivo,** con su punto.
- **La miniatura de su carta,** en la casilla donde la colocó, con un contorno fino de su área.
- **Su número de orden** (D-32), en la casilla desde la que actúa: arriba a la izquierda o, si en esa casilla hay una carta, abajo a la izquierda.

Su camino no se dibuja, y su línea de mira aparece solo con el ratón. Lo del ninja activo se dibuja encima de lo de los demás: sus casillas, sus objetivos posibles y la marca del que eligió.

### Las cartas colocadas

Una carta colocada deja una miniatura: una carta pequeña, como las de la mano, con la franja del color de su elemento, su valor en la esquina y su símbolo (llama, ola o copo). Reemplaza al número en un círculo, que se confundía con los números de orden.

- **Un lugar fijo por elemento,** en el orden de los paneles: Fuego a la izquierda, Agua al centro y Nieve a la derecha. Con tres cartas en la misma casilla se ven las tres, sin taparse y sin moverse al sumarse otra.
- **En la franja de arriba de su casilla, y siempre al frente,** como en el original: por encima de la unidad que esté en esa casilla. Detrás, la de Agua, que va al centro, quedaba oculta justo en el caso más común, que es una carta sobre un gólem. Con el ratón sobre esa unidad, las miniaturas se vuelven semitransparentes, para verla completa.
- **El área, a pedido.** La carta de un ninja que no está activo deja solo un contorno fino y tenue de su área de 3×3, sin relleno ni borde grueso: del color de su elemento o, si varias cartas comparten la casilla, uno solo, de tinta. El área completa, con relleno y borde grueso, se ve cuando el ninja dueño de la carta está activo o con el ratón sobre la miniatura.
- **El combo se anuncia.** Si dos o más ninjas tienen carta en el turno, sus miniaturas llevan un borde de `--gold`, estén en la misma casilla o en distintas (R-18).

`game/layout.ts` fija el lugar de cada miniatura (`MINI` y `miniRect`), y `game/layout.test.ts` mide que ninguna tape a otra. El antes y el después de la escena que motivó la regla, la carta de 11 de Escarcha con Brasa activo, están en la descripción del PR #24.

### Un solo tinte por casilla

Ningún tinte se mezcla con otro: cada casilla lleva un solo relleno, y las demás capas le ponen, como mucho, un borde.

1. Si la casilla es una opción del ninja activo, se ve solo su color.
2. Si no, el del alcance de un gólem, cuando esa ayuda está encendida.
3. Si no, el del área completa de una carta.

Así el área de una carta ya no se mezcla con las casillas de otro ninja. Sobre una casilla que es opción del ninja activo, el alcance de un gólem se marca solo con su borde.

### A pedido: el ratón y las ayudas

| Qué | Cómo se pide | Dónde se ve |
| --- | --- | --- |
| El plan de cada ninja | Siempre a la vista | En su panel, con palabras y sin números: "Moverse → atacar a Témpano" |
| El nombre de un gólem y cómo ataca | Con el ratón sobre él | En la franja de arriba. No pinta casillas |
| El área completa de una carta colocada | Con el ratón sobre su miniatura, o con su dueño activo | En el tablero |
| La línea de mira de un plan | Con el ratón sobre el objetivo, sobre quien actúa o sobre su fantasma | En el tablero |
| Las casillas vecinas de un caído | Con el ratón sobre él | En el tablero, con un borde |
| El alcance de un gólem | Con la ayuda "Ver el alcance de los enemigos" y el ratón sobre él | En el tablero, en `--danger` |
| La vida que perdería un gólem | Con la ayuda "Ver el daño antes de confirmar" | En su barra: el tramo que le quitarían los planes y lo que se está apuntando va en `--gold`, con una raya de tinta donde empieza |

Las dos ayudas se encienden en "Tu equipo", vienen apagadas y existen solo en las partidas locales (D-78): en línea no, para que todas las personas jueguen con la misma información.

**En el panel de cada ninja,** el resumen del plan ocupa el pie, en una sola línea, y los estados (escudo y potencia) van arriba a la derecha, bajo el número de orden.

### Cada unidad cabe en su casilla

La casilla mide 100×84 px. Dentro van la figura, su barra de vida y sus estados, así una unidad nunca tapa a la de la casilla de arriba ni a su barra:

- **La figura** se apoya a 67 px del borde de arriba de la casilla y no lo pasa.
- **La barra de vida** va al pie, bajo la figura, con su número a la derecha, en 13 px. Usa el color del elemento del ninja, `ICE.deep` en los gólems y `--danger` cuando queda el 30 % o menos.
- **Los íconos de estado** van arriba a la derecha, uno bajo el otro. Una unidad tiene dos como mucho: escudo y potencia, o aturdido y quemado.
- **El número de orden** (D-32) va arriba a la izquierda de la casilla desde la que actúa el ninja. Si en esa casilla hay una carta colocada, de cualquier ninja, baja a la esquina de abajo a la izquierda: arriba van las miniaturas, que se dibujan al frente, y la de Fuego lo taparía. Abajo no pisa la barra de vida ni su número.
- **La marca de un objetivo** va sobre el cuerpo de la unidad, con sus puntos encima, y cabe en la casilla.
- **Las miniaturas de las cartas colocadas** van en la franja de arriba, al frente de la unidad. Con el ratón sobre ella se vuelven semitransparentes.

Los efectos del combate (proyectiles, impactos y números de daño) sí pueden salirse: duran un instante. `game/layout.test.ts` mide lo que dibuja cada figura y falla si deja de caber.

### Capas de la planificación

De abajo hacia arriba:

| Capa | Qué muestra | Color | Cuándo se ve |
| --- | --- | --- | --- |
| Alcance de un gólem | Las casillas que puede golpear en su turno | `--danger`, con relleno tenue y borde. Sobre una casilla que es opción del ninja activo, solo el borde | Solo con la ayuda "Ver el alcance de los enemigos" (D-78): con el ratón sobre ese gólem, salvo con una carta en la mano |
| Contorno de una carta colocada | El área de 3×3 de la carta, o de las cartas, de esa casilla | Una línea fina y tenue, del elemento de la carta o, si son varias, de tinta | Para cada casilla con cartas colocadas, mientras no se vea su área completa |
| Casillas de movimiento | A dónde puede moverse el ninja activo, y su propia casilla | El color suave de su elemento (`--fire-soft`, `--water-soft` o `--snow-soft`), con el borde y el punto en el color del elemento | Mientras se planifica a ese ninja. Cuando ya eligió una, siguen a la vista a la mitad de su intensidad |
| Ninja activo | Un aro en el suelo, bajo sus pies, sobre su casilla | El de su elemento | Mientras se planifica a ese ninja |
| Casillas vecinas de un caído | Desde dónde se le puede revivir: sus 8 casillas vecinas, menos las rocas y las que ocupa un gólem | Borde `--paper-hi` con tinta alrededor, sin relleno | Con el ratón sobre ese caído, salvo que ya lo esté reviviendo otro ninja o haya una carta en la mano |
| Casillas de la carta | Dónde cabe la carta elegida; bajo el ratón, el área de 3×3, una diana sobre cada gólem que alcanzaría y, con la carta de Nieve, una cruz sobre cada ninja | `--danger`; las cruces, en `--snow` | En el modo carta |
| Camino | La línea del ninja a su fantasma, por la línea de los pies | El de su elemento | Solo para el ninja activo |
| Fantasma | La silueta sin relleno del ninja, en la casilla a la que planea moverse | El de su elemento | Para cada ninja que planea moverse |
| Área completa de una carta | El relleno de sus casillas, salvo las que ya llevan otro tinte, y un borde grueso | El del elemento del ninja activo, si una de las cartas es suya; si no, el de la primera | Con el dueño de una de las cartas activo, o con el ratón sobre la miniatura. Nunca con una carta en la mano |
| Línea de mira | De la casilla desde la que actúa un ninja al objetivo de su acción planeada | El del elemento de quien actúa | Solo con el ratón: sobre el objetivo, sobre quien actúa o sobre su fantasma |
| Objetivo elegido | Atacar: un anillo con un arco del color de cada atacante. Curar: la cruz. Revivir: la flecha. Encima, un punto por cada ninja que lo eligió | El anillo y los puntos, del elemento de cada ninja | Para cada acción planeada, en cualquier modo. Las del ninja activo van encima de las demás |
| Objetivos posibles | Una mira tenue sobre cada gólem al alcance, una cruz sobre el aliado que se puede curar y una flecha sobre el caído que se puede revivir | `--danger`, `--snow` y `--gold` | Para el ninja activo, salvo con una carta en la mano. Van encima de las marcas de los demás ninjas |
| Casilla bajo el ratón | Un borde | `--ink` | Con el ratón sobre el tablero |
| Número de orden | El orden real en que actuará cada ninja (D-32) | El de su elemento | Para cada ninja con una acción planeada. Arriba a la izquierda de su casilla; abajo a la izquierda si en ella hay una carta colocada |
| Miniatura de una carta colocada | Una carta pequeña con su valor y el símbolo de su elemento, en su lugar fijo. Con combo, un borde `--gold` | El del elemento | Para cada carta ya colocada. Va al frente de todo; con el ratón sobre la unidad de su casilla, semitransparente |

- **Tinta alrededor:** el anillo, los puntos y la línea de mira llevan borde de tinta, para leerse sobre cualquier figura.
- **Un borde no tiñe:** las casillas vecinas de un caído se marcan solo con su borde. Así, una casilla a la que además puede ir el ninja activo conserva su color.
- **El panel de cada ninja resume su plan con palabras y sin números** ("Moverse → atacar a Témpano").

### La reanimación

Revivir se completa al final del turno (R-09), así que el tablero muestra la reanimación mientras dura:

- **Al planificar:** con el ratón sobre un caído se ven sus casillas vecinas, y la flecha tenue aparece sobre él solo cuando el ninja activo está en una de ellas o planeó ir a una. Si otro ninja ya planeó revivirlo, no se ofrece: queda la marca de ese ninja, la flecha sólida con su punto, y un clic lo dice ("Marea ya va a revivir a Brasa.").
- **Durante la fase de los gólems:** quien revive mantiene su pose de reanimar, inclinado sobre su aliado, y el caído lleva un anillo `--gold` que gira.
- **Al terminar:** si se completa, el aliado se levanta con su haz de luz y el aviso dice "Brasa vuelve con 1 de vida". Si quien revivía cae, el anillo se apaga y el aviso dice "Reanimación interrumpida".
- **La primera vez que cae un ninja,** una burbuja sobre los paneles explica cómo revivirlo (ver "Consejos en el momento").

### La mano

- Muestra solo las cartas que hay: un lugar sin carta no se dibuja.
- Vacía, dice bajo su título cómo se ganan: "Llena el medidor para ganar cartas".
- **Vacía y sin cartas en el mazo** (D-106 del PRD de v2), dice que se acabaron (`.deck-out`): un recuadro de trazos, en el lugar de las cartas, con el ícono de las cartas en un círculo punteado, una frase en 15 px y, debajo, otra en 14 px `--ink-2`. En línea habla de las cartas de la persona y de las cajas; sin cuenta, de las del ninja y de lo que todavía puede hacer.
- **En el panel de un ninja con el mazo en 0,** "Mazo 0" va en rojo oscuro (`#b0321f`) y en negrita, y el medidor, apagado (al 35 %): ya no reparte nada, así que tampoco avisa que está lleno.
- Guarda su alto aunque esté vacía, para que su título no salte al cambiar de ninja.

### Consejos en el momento

Cuatro consejos salen una sola vez cada uno, la primera vez que hacen falta (D-80): cambiar de ninja, primera carta, combo posible y primera caída. Sus textos están en el §9.5 del PRD.

- **La burbuja (`.bubble`):** un panel `.paper` con una franja a la izquierda del color del ninja del que habla, como la de los mensajes (`.notice`). El texto va en 14 px, como el de la franja de arriba, y abajo a la derecha lleva "Entendido", un `.link`. Se cierra con ese enlace o con Enter.
- **Siempre en el mismo lugar, y nunca sobre el tablero:** la franja de abajo, a la derecha, en el espacio libre junto a la mano. Va pegada al borde derecho y mide 290 px de ancho como mucho, así se lee en dos o tres renglones. En la maqueta iba encima del panel o de la mano; ahí no cabe, porque entre el marco del tablero y los paneles quedan menos de 20 px.
- **Lo que señala lleva el borde dorado (`.tip-mark`),** el aro de lo elegido (sección 2), sin levantar la carta: el panel del ninja, en cambiar de ninja y en la primera caída; su primera carta, en la primera carta; y todas las cartas de la mano, en el combo posible. Así la burbuja no se mueve y siempre señala al ninja correcto.

| En la mano | Dónde va la burbuja |
| --- | --- |
| Ninguna carta | Junto a la frase de la mano, que se parte en dos renglones para dejarle lugar |
| Una o dos cartas | A la derecha de las cartas |
| Tres o cuatro cartas | No queda espacio libre junto a la mano: sube encima de ella, al margen derecho del tablero, con 150 px de ancho. No tapa ninguna carta |

- **Una a la vez.** Si coinciden varios consejos, sale primero la caída, después la primera carta, el combo y cambiar de ninja. Al cerrar uno sale el siguiente.
- **No estorba.** La burbuja no pausa nada ni bloquea el tablero: se puede seguir jugando con ella abierta.
- **Aprendidos.** El consejo que se cierra se guarda con los ajustes y no vuelve a salir. La ayuda trae "Volver a ver los consejos". Con "Consejos en pantalla" apagado no sale ninguno.
- **La franja de arriba es la línea de contexto:** el estado del turno y, al mirar a un gólem, su nombre y cómo ataca, sin números. Lo que se enseña una sola vez va en una burbuja, no en la franja.

`state/tips.ts` decide qué consejo sale, cuándo y dónde, con pruebas. Una prueba e2e mide que ninguna burbuja pise el marco del tablero.

### Demostraciones

Qué hace una carta y cómo ataca un gólem se enseñan en un tablero en miniatura, donde la carta se juega, o el gólem ataca, en bucle (D-81 y D-82). El detalle está en el §9.5 del PRD.

- **El ▶ (`.demo-open`):** un botón redondo de tinta junto al título de la mano. Uno solo para toda la mano. Abierto, lleva el aro dorado de lo elegido. No cambia el alto del título.
- **La burbuja (`.demo`):** un panel `.paper` sobre la mano, pegado a su borde derecho, de 400 px de ancho. Arriba, el título ("Carta de Fuego · 9") y una ✕; debajo, el selector "Sin combo | Con combo", que es el `.seg` de las opciones en chico; el tablero en miniatura; y la línea de texto de la carta, que guarda el alto de dos renglones para que la burbuja no salte.
- **Tapa parte del tablero mientras está abierta.** No cabe en otro lugar, y la abre quien juega. Por eso es de una a la vez, y se cierra con la ✕, con Esc o con un clic fuera, que no llega al tablero. Las teclas del juego esperan, y el consejo en pantalla también. No pausa el reloj.
- **El tablero en miniatura** es la escena del juego mirando solo 4×3 casillas, a 0,8 de su tamaño: a la izquierda, quien juega la carta; a la derecha, su área de 3×3 con dos gólems. Primero se ve lo planeado, como en la partida, con la miniatura de cada carta; después se juega el turno; y al final queda el resultado un momento.
- **Lo que se lee sobre cada unidad (`.demo-label`)** sale con el resultado: "−9 · aturdido". Va en 13 px, sobre la casilla de la unidad, y ahí arriba nunca hay otra unidad: el tablero de cada demostración se arma para eso, y una prueba lo mide. Las de la primera y la última columna se alinean al borde, para no salirse.
- **El combo** se anuncia con un "¡Combo!" corto sobre el tablero en miniatura, en vez del cartel a pantalla completa. Las dos cartas llevan el borde dorado.
- **En miniatura no van los números de vida:** no se leerían. La barra basta. Con la mano vacía tampoco van los números del daño.
- **Con animaciones reducidas** van dos tableros fijos, "Antes" y "Después", lado a lado, a 0,55 de su tamaño, en una burbuja de 484 px.
- **El resultado espera** a que se vaya el número flotante del último golpe: así no queda bajo su etiqueta.

Las de los gólems usan la misma burbuja:

- **"Ver cómo ataca" (`.tip-demo`):** un botón chico de papel con borde de tinta y un ▶, a la derecha de la franja de arriba. Sale solo mientras la franja nombra a un gólem, y nunca con una carta en la mano. Con él, el texto de la franja puede pasar a dos renglones; la franja sigue sin pisar el marco del tablero.
- **La franja se queda:** sigue nombrando al gólem 2,5 s después de que el ratón lo deja, y todo el tiempo que el ratón esté sobre ella, para que se alcance el botón. Un clic en el tablero, deshacer o cambiar de ninja la devuelven enseguida al estado del turno. Con la demostración abierta sigue nombrando a ese gólem, y el botón lleva el aro dorado de lo elegido, como el ▶ de las cartas.
- **La burbuja** no lleva selector, y su título es "Carámbano, cómo ataca". La línea de texto lleva los números del motor.
- **El tablero en miniatura** tiene el tamaño que pide cada ataque, siempre dentro de 368 px de ancho: 5×2 casillas para Carámbano, 4×3 para Granizo y 3×3 para Témpano. Las casillas golpeadas van teñidas todo el bucle, con el tinte del alcance de los gólems, y siempre hay un ninja fuera de ellas, que al final dice "a salvo".
- **Con animaciones reducidas,** el tablero de Carámbano, ancho y bajo, va una vez sobre otra en vez de lado a lado, a su tamaño del bucle. Los otros dos van lado a lado.
- **En la ayuda (`.help-demo`):** el mismo botón, debajo de la descripción de cada gólem. Abre la burbuja en el centro de la pantalla, sobre la ayuda, con el fondo oscurecido. Toma el foco y, al cerrarse, lo devuelve a su botón. Esc cierra primero la demostración y después la ayuda.

`state/demos.ts` arma el tablero y le pide al motor que lo resuelva; `game/DemoScene.ts` es la escena del juego sin sonido ni conexión con la partida.

### El fondo

- Deja lisa la franja de abajo, donde van los paneles de los ninjas y la mano: de 544 px hacia abajo solo hay campo nevado (`HUD_BAND_Y` en `art/scenery.ts`). Las montañas, los acantilados y los pinos se apoyan en esa línea o más arriba.
- Así ninguna línea del fondo cruza el título de la mano ni la pista de las teclas, que van sobre el fondo sin panel propio. `art/scenery.test.ts` lo mide en los tres mapas.

## 12. Grillas y composición

Toda pantalla se compone sobre una grilla, con las mismas reglas de simetría y de respiro (D-99). Las maquetas que la fijaron están fuera del repositorio; aquí quedan sus números y sus reglas.

### La grilla

A 1280×720, el escenario de referencia:

| Medida | Valor | Variable |
| --- | --- | --- |
| Columnas | 12 | `--grid-cols` |
| Espacio entre columnas | 16 px | `--grid-gutter` |
| Margen a cada lado | 56 px | `--grid-margin` |
| Ritmo vertical | Pasos de 8 px | `--grid-step` |

Con esos números, cada columna mide 82,67 px, y un bloque de 4 columnas, 378,67 px.

**En las pantallas adaptables,** la grilla cambia con el ancho de la ventana:

| Ancho de la ventana | Columnas | Margen |
| --- | --- | --- |
| 1024 px o más | 12 | 56 px |
| De 600 a 1023 px | 8 | 32 px |
| Menos de 600 px | 4 | 16 px |

### Las cuatro plantillas

| Plantilla | Para qué | Cómo se reparte |
| --- | --- | --- |
| **Menú** | Elegir entre pocas opciones | La cabeza arriba a la izquierda, en las columnas 1 a 6. El contenido en tarjetas de 4 columnas, tres por fila. La barra de acciones abajo a la derecha |
| **Batalla** | El combate | La barra de arriba en una fila: la franja de contexto (6 columnas), el reloj (1), confirmar (2), la ronda (2) y los botones (1). El tablero al centro, en las columnas 2 a 11. Abajo, tres paneles de 2 columnas, la mano (3) y el lugar de los consejos (3) |
| **Lectura** | El aviso de privacidad, la ayuda y los créditos | La columna de texto ocupa 7 columnas, unos 680 px. La ilustración va a la derecha, y la barra de acciones, abajo |
| **Diálogo** | Los avisos | 6 columnas centradas, de la 4 a la 9, sobre el fondo oscurecido. Los botones en fila |

### Simetría

- **El eje central es la referencia.** Lo que va solo, va centrado en él: el tablero, un diálogo o el botón grande de una pantalla.
- **Los bloques se reparten en partes iguales:** tres tarjetas de 4 columnas, dos de 6, o tres asientos a la misma distancia.
- **Un lado con peso lleva su contrapeso.** El título arriba a la izquierda se equilibra con las acciones abajo a la derecha; un panel a la izquierda, con el escenario a la derecha.
- **Los márgenes son iguales a los dos lados.**

### Respiro justificado

| Dónde | Separación | Variable |
| --- | --- | --- |
| Dentro de un elemento, entre su ícono y su texto | 8 px | `--space-in` |
| Entre los elementos de un grupo | 16 px | `--space-item` |
| Entre grupos | 24 px | `--space-group` |
| Entre zonas, como el contenido y la barra de acciones | 32 px o más | `--space-zone` |
| A los lados de la pantalla | 56 px | `--grid-margin` |

**Ningún vacío sin razón.** Un espacio grande separa dos cosas distintas, como elegir y actuar. Si no separa nada, sobra.

### Detalles

- **Los mismos bordes, radios y sombras** en todas las piezas: los de la sección 2.
- **Alineación óptica:** un ícono se alinea con el centro del texto que lo acompaña, no con su caja. El título y su subtítulo empiezan en la misma columna.
- **Estados idénticos en todo el juego:** lo elegido lleva el aro dorado, lo deshabilitado se apaga igual y el foco se ve igual.
- **El botón principal va al final de su fila,** a la derecha. Hay uno solo por vista.
- **Las líneas de lectura no pasan de 75 caracteres** (`--read-max`).
- **Un retrato va centrado con su texto,** con 16 px de aire a todos lados.

### En horizontal siempre que quepa

- El retrato a la izquierda y el texto a la derecha.
- Las tarjetas, lado a lado.
- Los botones, en fila.

En una ventana angosta, lo que ya no cabe lado a lado pasa a ir uno bajo otro, en el mismo orden.

### En el código

- **Las variables** están en `:root`, en `ui/styles.css`: `--grid-cols`, `--grid-gutter`, `--grid-margin`, `--grid-step`, `--space-in`, `--space-item`, `--space-group`, `--space-zone` y `--read-max`.
- **`ui/grid.ts`** repite esos números y describe las cuatro plantillas (`GRID`, `SPACE`, `BREAKPOINTS` y `TEMPLATES`), con `colLeft` y `span` para medir. `ui/grid.test.ts` comprueba que el código y la hoja de estilos digan lo mismo, y que cada plantilla llene sus columnas.

## 13. Pantallas en línea

Las pantallas del juego en línea (D-100 del PRD de v2) siguen todo lo anterior. Esta sección dice lo que es propio de ellas.

### El escenario y los asientos

- **Un mismo escenario** para la ficha, la búsqueda de equipo y las salas: el fondo de la cumbre, con borde de tinta y sin sombra. Así las tres hablan el mismo idioma.
- **Cada elemento tiene su lugar fijo:** Fuego a la izquierda, Agua al centro y Nieve a la derecha, en tres columnas iguales. Es el orden de los paneles del combate y de las miniaturas de las cartas.
- **Tres estados de un asiento:** el ninja a color, con su nombre y el de la persona; la silueta de tinta con el ícono girando, cuando se busca a alguien; y la silueta punteada, cuando el asiento está libre. El asiento de quien juega lleva el aro dorado en su etiqueta.
- **Los ninjas usan el esqueleto y las poses del tablero** (`art/poses.ts`): en reposo respiran como en la partida, y quien ya eligió va en pose de acción. Con animaciones reducidas quedan quietos.

### Botones y etiquetas

- **`.btn-xl`** es solo para "Jugar", en la ficha: 64 px de alto y texto de 24 px. Va centrado bajo el escenario, con el secundario a su izquierda.
- **La ✕** de arriba a la derecha hace de "Volver" o de "Salir", y va en el margen de la grilla, sin pisar ninguna columna. Su nombre dice qué hace: "Volver", "Cancelar la búsqueda", "Salir de la sala" o "Salir de la partida".
- **La etiqueta "Beta"** es una píldora dorada con borde de tinta, junto al título de cada pantalla en línea y junto a "Jugar en línea".

### Diálogos y franjas

- **Un diálogo** es para decidir algo o para enterarse de algo importante: fondo oscurecido, un papel de 6 columnas al centro, un ícono en un círculo, el título, una frase y, al final de la fila, el botón principal, que recibe el foco.
- **Una franja** es para un estado pasajero de la partida: arriba, sobre el tablero y sin bloquearlo. La de la conexión perdida se queda mientras dura; la de "Volviste" se va sola.
- **Sobre el escenario**, la oferta del bot y el aviso del ninja ocupado van en una franja de papel, arriba y al centro, con sus botones dentro.

### El combate en línea

- **El verde `--ok`** (`#2f9c60`) es el de lo que ya está hecho: la marca de listo sobre el ninja, el botón "Listo" y la píldora "Listo" del panel. No es el color de ningún elemento, para que no se confunda con el de Escarcha.
- **La marca de listo** es un círculo grande sobre la cabeza del ninja, al centro de su casilla. Si en esa casilla hay una carta colocada, baja al pecho. `layout.test.ts` mide que no tape el número de orden, los íconos de estado, las miniaturas ni la barra de vida.
- **El reloj** es una tarta con una porción por segundo. En los últimos 3 segundos pasa al número, en dorado sobre tinta.
- **Los paneles** dicen de quién es cada ninja y cómo va esa persona. El de quien juega lleva el contorno dorado. El de quien no está, y su ninja en el tablero, van en gris.

### El pergamino

Los resultados en línea y la Libreta ninja van sobre un pergamino: papel crema (`#f7f1e3`), rollos a los lados, que hacen de borde, y el título en una franja de tinta inclinada 2 grados. Sus cajas son de un papel más claro (`#fffaf0`), con borde de tinta y sin sombra.

### El amuleto y el avance de los logros

Llegaron con el amuleto de 4 pliegues (D-104 y D-105 del PRD de v2). Viven en `ui/Notebook.tsx` y `online.css`.

- **El amuleto de papel (`.amulet`)** tiene cuatro pliegues: Fuego a la izquierda, Agua a la derecha, Nieve abajo y, en el centro y sobre los otros tres, el de Equipo. Cada uno se rellena con el color de su elemento al completarse, y el de Equipo, con tinta; mientras le falta, queda en papel, con el borde de trazos. Con los cuatro, el cordón y el nudo pasan de `--ink-3` a `--gold`.
- **El pliegue de Equipo no es de ningún elemento:** su color es la tinta, su fondo suave es `#e6e8f0` y su tarjeta lleva un borde doble, para distinguirla de las tres de ninja. Su ícono son tres figuras juntas.
- **Un logro (`.ach-line`)** va en tres renglones: su nombre en 700 14 px y, a la derecha, su contador ("7/30") en 13 px `--ink-2`; debajo, qué cuenta, en 13 px `--ink-2`; y su barra. La explicación va siempre a la vista: nunca en un texto que solo sale con el ratón.
- **La barra (`.ach-bar`)** mide 10 px, con borde de tinta y las puntas redondas, y se llena con el color del pliegue. Completo, el logro lleva una marca de listo antes del nombre y el contador en negrita.
- **En la ficha** van el pliegue del ninja elegido y el de Equipo, sin la explicación: nombre, contador y una barra de 7 px. La ficha queda justa de alto a 1280×720: lo que se le agregue tiene que caber en sus 652 px.
- **En los resultados,** lo que sumó la partida va en dorado: "+3" antes del contador, en `#9a6a0c`, y el tramo nuevo de la barra en `--gold`, a continuación de lo que ya había. Lo que no sumó dice "sin avance". El logro que se completó en esa partida lleva el aro dorado de lo recién ganado.
- **Una tarjeta de pliegue completa** toma el fondo suave de su elemento.
- **"Mis cartas"** muestra un elemento a la vez: las pestañas de los elementos arriba, con cuántas de sus 20 cartas tiene la persona, y el saldo a su derecha; las flechas pasan entre las dos páginas de ese elemento, y al pie van qué página se ve, a la izquierda, y el botón de las cajas de ese elemento, a la derecha.

### Adaptables

- **Fuera del combate, las pantallas en línea y la Libreta son adaptables (D-97).** Desde 1024 px van en el escenario de 1280×720, a escala, como el resto del juego. Por debajo van a lo ancho de la ventana, con 8 o 4 columnas, y se desplazan a lo alto.
- **El mismo marcado sirve para los tres anchos.** Cada pantalla mide el ancho en que se dibuja con una consulta de contenedor (`@container online`), no el de la ventana: en el escenario siempre mide 1280.
- **Con 8 columnas** el contenido se apila, y lo que cabe sigue en horizontal: la ficha del ninja va en dos columnas bajo el escenario. **Con 4**, todo va en una columna y los botones ocupan el ancho, con el principal arriba.
- **El combate en línea es para computador** (D-73): se ve en el escenario a escala, sin adaptar.

