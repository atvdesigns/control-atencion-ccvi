# Control de Atencion CCVI - Especificacion Maestra MVP v2.2

## Vision

Sistema web paperless-first, multirrol y multicientro para ordenar la llegada de usuarios, validar documentacion, trazar carpetas fisicas, gestionar una cola unica de caja y medir el flujo completo desde llegada hasta pago.

## Definicion definitiva de ventanillas

### Ventanilla 1

- Denominacion visible: Ventanilla 1.
- Microcopy publico: Representacion, empresa o poder notarial.
- Atiende empresas, personas juridicas y personas naturales que actuan mediante poder notarial.
- Validacion documental reforzada.
- `serviceType = "representation"`.
- `validationLevel = "enhanced"`.

### Ventanilla 2

- Denominacion visible: Ventanilla 2.
- Microcopy publico: Propietario del vehiculo retenido.
- Atiende exclusivamente propietarios de vehiculos retenidos.
- El propietario no concurre con el vehiculo; el vehiculo permanece retenido en el corral o aparcadero.
- Validacion documental estandar.
- `serviceType = "vehicle_owner"`.
- `validationLevel = "standard"`.

## Principios

- Un solo codigo publico para el cliente durante todo el proceso.
- Codigo publico por ventanilla: `V{windowNumber}-{sequence}`.
- El contador interno comienza en `00` por centro, ventanilla y jornada; `Vn-00` nunca es un turno publico.
- La primera secuencia publica por ventanilla comienza en `01`.
- Cero impresion de tickets en el MVP.
- QR en pantalla como mecanismo para guardar el turno.
- Carpeta fisica existente, pero no como fuente de verdad.
- `folderCode` generado por sistema y escrito manualmente en la carpeta.
- Cola unica FIFO de caja por hora de aprobacion documental.
- Cajas sin seleccion manual arbitraria.
- Interfaces por rol, simples y con baja carga cognitiva.
- Sin SMS ni WhatsApp en MVP ni roadmap definido.
- Display publico sin datos sensibles.
- Lenguaje claro, cercano, corporativo y accesible.

## Identificadores

- `publicCode`: visible para cliente, por ejemplo `V1-01` o `V2-01`.
- `publicToken`: identificador no predecible para la pagina QR.
- `caseId`: identificador tecnico corto, por ejemplo `SB-001-A7`.
- `folderCode`: identificador interno de carpeta, por ejemplo `SB-F001`.
- `globalArrivalSequence`: orden real global de llegada por centro y jornada.

## Flujo exitoso

1. Cliente llega.
2. Selecciona Representacion/empresa/poder notarial o Propietario del vehiculo retenido.
3. Sistema muestra confirmacion de seleccion.
4. Sistema genera `publicCode`, `caseId`, `publicToken`, `globalArrivalSequence` y ventanilla.
5. Pantalla muestra numero durante 10-15 segundos con QR y opcion de mas tiempo.
6. Operador llama siguiente de su ventanilla.
7. Operador inicia validacion documental.
8. Operador aprueba, marca documentacion incompleta o rechaza.
9. Si aprueba, el sistema genera `folderCode`.
10. Operador escribe `folderCode` en carpeta fisica.
11. Caso entra a cola unica de caja.
12. Cajero presiona `Llamar siguiente`.
13. Sistema asigna el caso aprobado mas antiguo.
14. Display muestra `publicCode -> Caja`.
15. Cajero inicia atencion y completa pago.
16. Caso queda finalizado con eventos y timestamps.

## Reglas de negocio

- Toda llegada crea un caso.
- El routing usa `serviceType`, no personalidad natural/juridica como regla principal.
- Ventanilla 1 atiende representacion, empresas y poderes notariales.
- Ventanilla 2 atiende propietarios de vehiculos retenidos.
- La secuencia publica es independiente por centro, ventanilla y jornada.
- El contador interno de cada ventanilla se inicia y se reinicia en `00`.
- Los valores internos `V1-00`, `V2-00` y `Vn-00` nunca se muestran en interfaces, QR, display, caja, dashboards, reportes publicos ni mensajes al usuario.
- La generacion incrementa primero el contador interno de `00` a `01` y luego crea el `publicCode`.
- La primera secuencia emitida por cada ventanilla en la jornada es `01`: `V1-01`, `V2-01`, `V3-01` o `Vn-01`.
- Cada centro define horario de inicio y termino de atencion.
- El totem solo permite generar nuevos turnos dentro del horario laboral configurado para el centro.
- Al iniciar una nueva jornada, el contador interno de cada ventanilla vuelve a `00`; el primer turno publico vuelve a `01` sin borrar los datos de jornadas anteriores.
- Las metricas deben conservarse por centro y jornada para consulta administrativa.
- El administrador puede exportar metricas por centro y dia en formato compatible con Excel y preparar una salida imprimible/PDF.
- El codigo publico se mantiene aunque el caso sea reasignado.
- El codigo publico se conserva al pasar a caja y no se genera un segundo codigo publico.
- `folderCode` es un identificador interno independiente y no sustituye al codigo publico.
- Una reasignacion conserva `caseId`, `publicToken`, `publicCode`, `arrivalAt` y `globalArrivalSequence`.
- Documentacion incompleta no exige motivo obligatorio.
- Solo casos aprobados entran a caja.
- Aprobacion genera `folderCode`.
- La cola de caja es unica por centro.
- Cajero solo puede tener un caso activo.
- Cajero no selecciona libremente casos: llama el siguiente FIFO.
- Dos cajeros no deben recibir el mismo caso.
- Display usa siempre el `publicCode`.
- Eventos de trazabilidad registran actor, accion, estado anterior, estado nuevo y timestamp.

## Atención preferencial end-to-end

- Solo Ventanilla 1 y Ventanilla 2 pueden crear, actualizar o quitar prioridad.
- Caja, tótem, QR y display público no pueden modificarla.
- La condición preferencial se conserva al avanzar hacia caja; no existe un segundo indicador de prioridad.
- `publicCode` no cambia. La `P` se agrega únicamente al representar el turno en interfaces autorizadas y no se persiste en el código.
- El motivo específico permanece restringido a personal de ventanilla. Caja y display solo comunican que el turno es preferencial.
- La etiqueta accesible equivalente es “Turno Vn-XX, atención preferencial”.
- Las colas documental y de caja separan casos elegibles en preferenciales y regulares, manteniendo FIFO dentro de cada grupo.
- La política inicial configurable usa `maxConsecutivePriorityCases = 2`: selecciona hasta dos preferenciales consecutivos y luego un regular si existe.
- Si uno de los grupos está vacío, se continúa con el otro sin bloquear la operación.
- Eliminar o cambiar la prioridad no crea otro turno, no cambia ventanilla ni altera el estado operacional.

## MVP incluido

- Admin puede crear centros.
- Admin configura cantidad de ventanillas de representacion, ventanillas de propietarios y cajas.
- Totem genera codigos `V1/V2` y QR.
- Pagina publica `/turno/{publicToken}`.
- Operadores aprueban, marcan incompleto, rechazan o reasignan.
- Cajeros llaman siguiente desde cola unica.
- Display publico.
- Admin con metricas basicas y eventos.
- Admin con seleccion de jornada para revisar metricas.
- Admin puede descargar metricas de la jornada como CSV compatible con Excel.
- Admin puede preparar una vista imprimible para PDF con las metricas seleccionadas.
- Firebase Hosting configurado.
- Firebase Realtime Database preparado.

## KPI

- Total de llegadas.
- Llegadas por representacion.
- Llegadas de propietarios.
- Casos aprobados.
- Casos con documentacion incompleta.
- Casos rechazados.
- Reasignaciones.
- Casos en espera de caja.
- Casos en caja.
- Casos finalizados.
- Tiempo promedio de validacion documental.
- Tiempo promedio desde aprobacion hasta llamado a caja.
- Tiempo promedio de caja.
- Tiempo total end-to-end.
- Tiempo de uso del totem y solicitudes de mas tiempo.

## Accesibilidad y contenido

- Base objetivo: WCAG 2.1 AA.
- Usar como marco de referencia permanente W3C/WAI, Manual de Accesibilidad Web de Kit Digital, SENADIS, Guia de Accesibilidad Web SENADIS 2016 y normativa chilena de accesibilidad digital aplicable.
- No depender solo de color.
- Mantener foco visible.
- Controles tactiles amplios.
- Textos claros, sin estados tecnicos ni errores Firebase visibles.
- El QR debe tener alternativa textual.
- La cuenta regresiva del totem debe poder extenderse.
- Ninguna vista publica muestra datos personales, `folderCode`, `caseId` ni notas internas.
- Cada llamado a usuarios debe ser multimodal: texto claro, jerarquia visual, diferenciacion de destino y sonido complementario cuando sea posible.
- Cada pantalla nueva o modificada debe revisarse contra `docs/ACCESSIBILITY_DESIGN_GOVERNANCE.md`.

## Opcion fisica de contingencia

Tarjetas plasticas reutilizables con numero o QR pueden presentarse como alternativa para clientes sin celular o baja alfabetizacion digital.

Riesgos: perdida, retencion por usuarios, reposicion, sanitizacion, asociacion incorrecta, control de inventario y duplicidad si una tarjeta no se libera.
