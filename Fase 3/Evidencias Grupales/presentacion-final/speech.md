# Speech - presentación final

Equipo 7: Felipe Cuevas y Carlos Vallejos.
Abrir `presentacion-final/index.html` a pantalla completa.
La planta sale de la tierra con el scroll. Flecha abajo o la barra espaciadora llevan al siguiente brote. Flecha arriba vuelve a la lámina anterior.
Cada tarjeta nace del capullo cuando el tallo llega a ese punto. La primera es la portada.

No nombrar a personas del cliente. Decir el cliente, gerencia, administración, tesorería o compras.
No nombrar reuniones por sigla ni por fecha. Si hace falta el tiempo, decir julio, agosto o septiembre.

La demo (lámina 11) no tiene texto medido: ahí se abre el sistema. El resto cabe en unos 10 minutos.

---

## Felipe - láminas 1 a 3

Lámina 1 - Portada
Buenas tardes. Somos Felipe Cuevas y Carlos Vallejos, Ingeniería en Informatica, equipo 7. El proyecto es ERP Almahue: un sistema de gestión para un exportador de fruta fresca, con sede en Rengo. No es un caso inventado.

Lámina 2 - Integrantes
Yo me hice cargo de la interfaz, de los flujos y de dejar escritas las evidencias. En septiembre sumé monedas y tipo de cambio. Carlos llevó los requisitos con el cliente, el backend, el modelo de datos y la facturación. El equipo del título somos nosotros dos. El cliente es quien prioriza.

Lámina 3 - Descripción
El problema: la operación no vive en un solo sistema. Agrosoft para el día a día, Excel para el banco, un portal para el documento tributario y otra plataforma para los embarques. El mismo dato se carga más de una vez. Agrosoft cobra por cuenta, entonces varias personas entran con el mismo usuario. Si alguien cambia de empresa y no avisa, el otro computador sigue en la sociedad anterior, y la factura o la compra queda en la empresa que no corresponde.

La propuesta: un ERP web, usuario propio y la sociedad a la vista. Compras, ventas, inventario, tesorería, contabilidad y la emisión en el mismo flujo. No es un reemplazo de un día para otro.

## Carlos - láminas 4 a 7

Lámina 4 - Objetivos
El objetivo general es diseñar e implementar ese ERP por empresa, y que vaya reemplazando el sistema que usan hoy.

Los específicos son cuatro. Uno: levantar como operan y dejar un backlog. Dos: orden de compra con aprobación, orden de venta con stock, y los libros. Tres: tesorería y contabilizar por ítem. Cuatro: el documento tributario nacional. La factura de exportación queda para después.

Lámina 5 - Alcances
En el semestre mostramos el MVP: núcleo comercial, tesorería y documento nacional, con aislamiento por empresa. La aprobación quedó solo en la compra.

Queda fuera la puesta en marcha. La carta la deja para el 9 de enero de 2027, después del semestre. También quedan fuera la factura de exportación, los presupuestos de seguimiento y los reportes ejecutivos. El plan de producto es más largo que la asignatura. En Duoc se muestra el corte, no la salida a producción.

Lámina 6 - Metodología
Seguimos en Scrum. El cliente prioriza. El sprint es la semana. Si esa semana hubo cliente, la review es con el. Si no hubo, la escribimos como interna. El incremento se acepta cuando el cliente lo ve, no cuando la carta dice que tocaba.

El objetivo no cambió. Sí cambió el orden: la carta ponía construir tarde, y en julio el cliente ya veía pantallas.

Lámina 7 - Cronograma
Esta es la carta de las 18 semanas de la asignatura, la de inicio. Fase 1 es definición. Fase 2 es el desarrollo del núcleo, tesorería y documento nacional. Fase 3 es informe y defensa, que es esta.

Al corte de hoy, levantamiento y definición están hechos. Núcleo, tesorería y documento nacional están en uso. Lo que ven marcado es el plan, no una reunion suelta.

## Carlos - láminas 8 y 9. Felipe retoma la 10

Lámina 8 - Arquitectura
La pantalla es React. La API es NestJS y filtra por empresa. Los datos están en PostgreSQL. Cuando hay que emitir, el ERP no llama al facturador directo: pasa por billing-gateway, un proyecto intermediario, y ese habla con el ambiente de prueba del facturador.

Lámina 9 - Modelo de datos
Todo cuelga de la empresa. Arriba, empresa, usuario y permiso. Después la contraparte, que sirve para cliente y proveedor. Compras y ventas, con sus órdenes y los libros. Tesorería con cartola y pagos. Contabilidad con plan de cuentas y asientos. Y la emisión, ligada a la venta.

Lámina 10 - Tecnologías (Felipe)
En pantalla: React, Vite y TypeScript. Atras: NestJS, Prisma y PostgreSQL. El intermediario de facturación también es NestJS. No metimos app móvil ni un motor de reportes pesado. El foco es el sistema de gestión.

## Demo y cierre

Lámina 11 - Demostración (Felipe abre, Carlos acompana)
Aquí dejamos las láminas y abrimos el sistema. El orden: entrar y elegir empresa, orden de compra y su aprobación, orden de venta con stock, el libro, una cartola o un pago, y la emisión del documento nacional. Si preguntan por exportación, esa no está.

Lámina 12 - Resultados (Carlos)
Lo que quedó: el operador entra con su usuario y ve una sociedad. La compra parte en la orden y se aprueba. La venta valida stock y queda confirmada. Tesorería lee la cartola. El set nacional se emite. Y quedó escrito el proceso, sprint por sprint. La puesta en marcha sigue fuera de este semestre.

Lámina 13 - Obstáculos (Felipe el primero, Carlos el resto)
El facturador no respondió a tiempo. El cliente dejó abierta la idea de postergar el cambio a la otra temporada. No esperamos: armamos el intermediario.

La carta no calzaba con el trabajo. Ponía la construcción tarde y nosotros ya estábamos en julio con pantallas. La carta quedó como mapa. Las evidencias cuentan lo que pasó.

Presupuestos y reportes ejecutivos no se cerraron. El cliente pidió dejarlos para más adelante. Siguen pendientes, no los dimos por listos.

Lámina 14 - Preguntas (los dos)
Quedamos atentos a la comisión.
Cuando terminen las preguntas, una flecha más. La copa se llena con la fruta que exportan: cerezas, carozos, cítricos, kiwis y manzanas.
