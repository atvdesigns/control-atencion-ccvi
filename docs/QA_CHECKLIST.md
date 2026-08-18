# QA Checklist MVP v2.2

## Numeración pública

- [ ] Una jornada nueva genera como primer turno de Ventanilla 1 `V1-01`.
- [ ] Una jornada nueva genera como primer turno de Ventanilla 2 `V2-01`.
- [ ] Ventanilla 3 genera como primer turno `V3-01`.
- [ ] El contador interno puede estar en `00`, pero `V1-00`, `V2-00` o `Vn-00` no se renderizan en ninguna superficie visible.
- [ ] El segundo turno de Ventanilla 1 es `V1-02`.
- [ ] El reinicio de jornada devuelve cada contador interno a `00` sin borrar el histórico.
- [ ] Dos centros distintos pueden tener simultáneamente un turno `V1-01` sin colisión.
- [ ] El `publicCode` no cambia al pasar a caja y no es reemplazado por `folderCode`.

## Tótem

- Seleccionar "Representación, empresa o poder notarial".
- Confirmar selección antes de emitir turno.
- Ver código `V1-01`.
- Ver microcopy "Representación, empresa o poder notarial".
- Ver destino Ventanilla 1.
- Seleccionar "Propietario del vehículo retenido".
- Confirmar selección antes de emitir turno.
- Ver código `V2-01`.
- Ver microcopy "Propietario del vehículo retenido".
- Ver destino Ventanilla 2.
- Confirmar QR visible.
- Confirmar cuenta regresiva visible.
- Usar "Necesito más tiempo" y verificar que extiende la pantalla.
- Configurar un centro fuera del horario actual y verificar que el tótem bloquea la generación de nuevos turnos.
- Verificar que el mensaje fuera de horario indica claramente el rango de atención.
- Abrir `/turno/{publicToken}` y revisar que no exponga datos internos.

## Operadores

- Ventanilla 1 solo ve casos asignados a representación.
- Ventanilla 2 solo ve casos asignados a propietarios.
- Llamar siguiente respeta FIFO de su ventanilla.
- No se puede llamar otro caso si hay uno activo.
- Al entrar sin caso activo, la sección superior "Usuario llamado" muestra una card vacía con explicación y siguiente acción.
- "Usuario llamado" debe tener el título, icono y contador dentro del mismo contenedor visual, igual que "En espera de atención" y "Procesados recientemente".
- Las secciones operativas tipo contenedor/acordeón deben compartir radio, borde, sombra, padding y línea divisoria entre encabezado y contenido cuando estén abiertas.
- Las secciones "Usuario llamado", "En espera de atención", "Procesados recientemente" y "Pagos pendientes" deben usar el mismo patrón visual con iconografía diferenciada según el proceso.
- Si no hay usuarios en espera para llamar, el botón "Llamar siguiente turno" queda deshabilitado y el sistema explica que los nuevos turnos aparecerán cuando se generen desde el tótem.
- Al llamar un turno, el caso activo aparece en la sección superior "Usuario llamado".
- La cola pendiente aparece como acordeón "En espera de atención", se colapsa cuando hay un usuario llamado y no compite visualmente con el caso activo.
- Las acciones "Iniciar validación", "No se presentó", aprobar, incompleto, rechazar y reasignar aparecen solo en el caso activo.
- El botón "Reasignar a Ventanilla" usa tratamiento terciario gris, está alineado junto a las demás acciones y mantiene foco/hover visible.
- Intentar disparar "Iniciar validación" dos veces no debe duplicar el cambio de estado.
- Iniciar validación.
- Marcar "No se presentó" cuando un usuario llamado no llega a la ventanilla.
- Ventanilla 1 muestra advertencia de validación reforzada.
- Aprobar genera `folderCode`.
- Incompleta no pide motivo.
- Rechazar no envía a caja.
- Reasignar conserva código público y hora de llegada.

## Cajas

- Caja llama siguiente desde cola única.
- Caja no puede llamar otro caso si tiene uno activo.
- `folderCode` aparece para retirar carpeta física.
- Iniciar atención.
- Completar pago.
- Registrar "Pago no realizado" cuando el pago es rechazado, no se procesa o no puede completarse.
- Verificar que el turno queda en "Pagos pendientes" y conserva el mismo código público.
- Retomar atención de un pago pendiente cuando la caja no tenga otro turno activo.
- Verificar que no se puede retomar un pago pendiente si la caja ya tiene un turno activo.
- Marcar no presentado.

## Monitor público

- Muestra llamados a ventanilla.
- Muestra llamados a caja.
- El orden visual debe ser Ventanilla y luego Caja.
- En desktop, Ventanilla y Caja deben ocupar 50% y 50% del ancho disponible.
- Cada tarjeta debe comunicar "Usuario", código público y "Pase a" destino.
- Los códigos `V1`, `V2`, `V3` deben tener diferenciación cromática sutil para evitar confusión visual.
- Al generarse un nuevo llamado, el monitor debe intentar reproducir un sonido breve.
- Usa siempre el mismo `publicCode`.
- No muestra `folderCode`, `caseId` ni datos personales.
- El botón de reinicio demo no debe competir con el contenido del monitor.

## Administrador

- Crear centro.
- Intentar crear centro con nombre vacío y verificar mensaje de ayuda.
- Intentar crear centro con cantidades fuera de rango y verificar que no permite continuar.
- Crear centro con horario de inicio y término de atención.
- Intentar crear o editar centro con hora de inicio igual a hora de término y verificar que no permite continuar.
- Editar centro y guardar cambios.
- Editar horario de atención y verificar que aparece en el listado de centros.
- Intentar guardar centro con tiempo de tótem menor a 8 o mayor a 30 segundos.
- Cancelar edición de centro sin modificar datos.
- Abrir confirmación de "Eliminar centro" desde el modal de edición del centro.
- Cancelar eliminación con "No eliminar".
- Verificar que "Sí, eliminar" permanece deshabilitado hasta escribir `ELIMINAR`.
- Confirmar eliminación con "Sí, eliminar" después de escribir `ELIMINAR`.
- Verificar que no se pueda eliminar el último centro disponible.
- Configurar ventanillas de representación.
- Configurar ventanillas de propietarios.
- Configurar cajas.
- Cambiar centro activo.
- Ver métricas.
- Seleccionar una jornada de atención y verificar que las métricas se filtran por ese día.
- Descargar métricas como archivo CSV `.csv` compatible con Excel y Google Sheets.
- Preparar salida PDF desde la vista imprimible institucional con logo CCVI.
- Ver eventos de trazabilidad con textos claros para el personal, sin nombres técnicos internos.
- Validar que "Centros de atención" y "Trazabilidad reciente" mantienen altura y comportamiento visual coherente.

## Responsive y accesibilidad

- Probar desktop.
- Probar tablet.
- Probar mobile.
- Probar 320 px y 390 px sin scroll horizontal global.
- Probar orientación vertical y horizontal.
- Verificar foco visible con teclado.
- Verificar que los selects de Rol y Centro tienen nombre accesible.
- Verificar que los acordeones con contador tienen nombre accesible legible, por ejemplo "En espera de atención, 2 usuarios".
- Verificar que los botones principales tienen área táctil amplia.
- Verificar que ningún estado depende solo del color.
- Verificar que no aparecen códigos técnicos ni errores de programación al usuario.
- Verificar tildes y acentos en todos los textos visibles de cara a usuarios.

## Gobernanza visual y accesibilidad transversal

- Revisar cada pantalla contra WCAG 2.1 AA: perceptible, operable, comprensible y robusta.
- Revisar criterios de diseño universal inspirados en SENADIS y Kit Digital: lectura clara, interacción simple, tolerancia al error y compatibilidad con distintas capacidades.
- Validar que cada llamado público se entienda por texto visible, jerarquía visual y, cuando esté permitido, sonido complementario.
- Confirmar que el sonido del monitor público nunca sea el único canal para avisar un llamado.
- Confirmar que los códigos `V1`, `V2`, `V3` tengan diferenciación visual sin depender solo del color.
- Confirmar que los headers de contenedores mantienen fondo blanco y que las zonas internas con muchas cards usan contraste suficiente respecto al fondo general.
- Confirmar que contenedores desplegados con scroll interno muestran separación visual clara mediante fondo, borde y sombra interior.
- Confirmar que los contenedores padre equivalentes comparten radio, borde, separador, padding, sombra y comportamiento.
- Confirmar que cada pantalla tiene una acción principal dominante y que las acciones secundarias no compiten con ella.
- Confirmar que los estados vacíos explican qué sucede y qué acción corresponde.
- Confirmar que no hay botones, chips, cards o mensajes flotantes superpuestos.
- Confirmar que las zonas con muchas cards tienen scroll interno cuando corresponda y no generan scroll infinito innecesario en el body.
- Confirmar que las acciones destructivas usan fricción intencional, advertencia clara y confirmación explícita.
- Confirmar que todos los errores explican qué ocurrió, cómo continuar y si la información fue guardada.
- Confirmar que cada componente nuevo sigue la guía `docs/ACCESSIBILITY_DESIGN_GOVERNANCE.md`.
