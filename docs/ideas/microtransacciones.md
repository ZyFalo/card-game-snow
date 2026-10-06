# Ideas de microtransacciones (para después)

**Estado:** solo ideas. Nada de esto está decidido ni se implementa en v2. Hoy Ventisca es el piloto de un proyecto personal, gratuito y sin publicidad, y así lo dice el aviso de privacidad. Cuando llegue el momento, estas notas sirven de punto de partida para decidir con calma.

## 1. Precedente: el original también cobraba

Card-Jitsu Snow tenía ventajas para miembros de pago, y eso no rompía la cooperación:

- **La carta de revivir de miembros:** una vez por partida, revivía o curaba al 100 % solo a quien la usaba.
- **Más cartas de poder para los miembros,** según el propio tráiler del juego.

## 2. Principios propuestos

0. **La fiesta es de todos.** Lo de pago nunca crea rivalidad entre personas ni deja a nadie fuera por no poder pagar. Lo que compra una persona también lo disfruta su equipo (ver la sección 3.1). Este principio está por encima de los demás.
1. **Nada que perjudique a otros.** El juego es cooperativo contra los gólems, así que una ventaja de una persona ayuda a su equipo. Si algún día hay clasificaciones o competencia entre personas, cualquier ventaja de pago debe revisarse.
2. **Sin azar pagado con dinero real.** Las cajas con azar se compran con monedas del juego, y así deben quedarse. Vender cajas aleatorias por dinero es lo que se conoce como *loot boxes*: varios países las regulan o las prohíben, y con personas menores de edad el riesgo es mayor.
3. **No vender el progreso.** Las monedas, las cajas y el mínimo de cartas para Tormenta (R-51) se ganan jugando. Comprarlos rompería el balance medido en P-20 y la sensación de logro.
4. **Transparencia.** Qué se paga, qué da y qué no da, dicho en una frase. Sin patrones engañosos, sin presión por tiempo y sin precios escondidos.

## 3. Catálogo de ideas

| Idea | Qué da | Notas |
|---|---|---|
| **Pase de ayudas en línea** | "Ver el daño antes de confirmar" y "Ver el alcance de los enemigos" también en las partidas en línea (en local ya son gratis y opcionales) | Es la idea del dueño de producto: una ventaja sigilosa que no afecta a nadie. **No se puede proteger:** el cliente es de código abierto y tiene el motor, así que alguien con conocimientos podría calcularlo por su cuenta. Sería una comodidad, no un secreto |
| **Membresía al estilo del original** | Una carta propia de miembros (por ejemplo, revivirse una vez por partida) y beneficios menores | Tiene precedente directo. Es ventaja de juego, pero cooperativa |
| **Fondos de batalla** | El cielo del campo de batalla (más que el tablero), para crear una sensación de pertenencia con cada campo | Se comparten con el equipo (sección 3.1). Por ahora el juego se ve con el fondo por defecto. También podrían ganarse al derrotar al jefe de un evento (`eventos-de-jefe.md`) |
| **Otros cosméticos** | Estilos de papel para los ninjas, reversos de carta, celebraciones de victoria | La opción más segura: no toca el balance. Encaja con la estética de papel recortado |
| **Apoyo al proyecto** | Un pago voluntario, con quizá un distintivo en el perfil | Simple y transparente. Sirve para medir interés antes de construir algo mayor |
| **Monedas por dinero real** | Comprar monedas del juego | **No recomendada:** vende el progreso y, como las monedas compran cajas con azar, se acerca a las *loot boxes* |

### 3.1 Compartir lo comprado: los fondos de batalla

La regla del dueño de producto busca que nadie se quede fuera de la fiesta:

- **Quien tiene un fondo configurado** ve el suyo.
- **Quien no tiene fondo** ve, al azar, uno de los fondos de sus compañeros.
- **Si nadie del equipo tiene fondo,** todos ven el fondo por defecto.

Casos que habrá que definir:

- **El azar:** se elige una vez por partida o cambia en cada ronda. Si cambia por ronda, quien no tiene fondo visitaría el cielo de cada compañero.
- **El bot** (D-45) no tiene fondo.
- **El sandbox** usa el fondo por defecto, porque no tiene progreso (D-34).
- **Cada pantalla dibuja su propio cielo,** así que dos personas pueden ver cielos distintos en la misma partida. Basta con que el servidor envíe, al empezar, el fondo que tiene cada integrante.

## 4. Qué resolver antes de cobrar

**Legal y aviso de privacidad**

- Cambiar el aviso de privacidad: hoy dice que el juego es gratuito, sin compras ni publicidad. Hay que declarar las compras, el procesador de pagos y los datos que recibe. El cambio debe avisarse con el mecanismo del M9, antes de que rija.
- Escribir términos de uso: qué se compra, reembolsos y qué pasa si el juego cierra.
- Revisar con asesoría el Estatuto del Consumidor (Ley 1480 de 2011), en particular el derecho de retracto en ventas en línea y su aplicación al contenido digital.
- Resolver la parte tributaria con asesoría contable: facturación e impuestos de lo que se venda.

**Personas menores de edad**

- Hoy no hay límite de edad (D-38). Antes de cobrar hay que decidir cómo se manejan las compras de menores: verificación de edad, autorización de un adulto o no ofrecer pagos a quien no sea mayor de edad.

**Pagos**

- Elegir un procesador disponible en Colombia, o un servicio *merchant of record*, que actúa como vendedor ante el cliente y gestiona los impuestos. Hay que verificar la disponibilidad y las condiciones de cada opción en su momento.
- Si algún día hay aplicación móvil en las tiendas, las reglas de Apple y Google para bienes digitales cambian el modelo.

**Técnico**

- **Derechos en el servidor:** lo comprado vive en una tabla propia, nunca se confía en el cliente, y los avisos del procesador (webhooks) se verifican.
- **Compras sin duplicados:** se reutiliza el patrón del libro de monedas, con un identificador por compra que hace inofensivos los reintentos (D-68).
- **Reembolsos y contracargos:** qué se le quita a la cuenta en cada caso.
- **Código abierto:** el repositorio es público. Conviene decidir qué licencia cubre el código y si los recursos gráficos y la marca quedan reservados.

**Producto**

- Medir antes: con el pago voluntario, o preguntando a quienes juegan qué pagarían.
- Mantener el juego completo y justo sin pagar: lo de pago debe sentirse como un extra, nunca como un muro.

## 5. Cuándo retomarlo

Después del M9, con el juego publicado, personas jugando y datos de uso. Cuando llegue ese momento, estas notas se convierten en una sección del PRD con sus decisiones.
