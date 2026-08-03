# Decisions

## 2026-07-13 - Especificacion v2.2

- La solucion vigente reemplaza PN/PJ por codigos publicos por ventanilla: `V1-01`, `V2-01`, `V3-01`, etc.
- Ventanilla 1 atiende representacion, empresas y personas con poder notarial.
- Ventanilla 2 atiende propietarios de vehiculos retenidos. El vehiculo permanece retenido en el corral o aparcadero.
- El routing usa `serviceType`, no `natural | legal` como criterio principal.
- Cada ventanilla tiene secuencia independiente por centro y jornada, comenzando en `01`.
- El codigo publico se conserva durante todo el tramite, incluso si existe reasignacion.
- El QR usa `publicToken`; no usa `publicCode` como clave publica directa.
- La carpeta fisica sigue existiendo, pero la fuente de verdad es digital.
- SMS y WhatsApp quedan excluidos del MVP y del roadmap definido.

## 2026-07-17 - Eliminacion de centros en modo demo

- El administrador puede eliminar centros de atencion creados.
- La accion vive dentro del modal de edicion del centro como zona restrictiva, no en el listado principal.
- La accion requiere confirmacion en modal antes de ejecutar la eliminacion.
- El modal exige escribir `ELIMINAR` para habilitar el boton destructivo y reducir eliminaciones accidentales.
- No se permite eliminar el ultimo centro disponible para evitar dejar el sistema sin contexto operativo.
- Si el centro eliminado era el centro activo, la aplicacion selecciona automaticamente otro centro disponible.
- En la demo local, eliminar un centro tambien retira sus sesiones, casos, cola de caja y eventos asociados.

## 2026-07-17 - Horario laboral, reinicio diario y exportacion de metricas

- Cada centro de atencion define hora de inicio y termino de atencion desde el modal de creacion y edicion.
- El totem no permite generar nuevos turnos fuera del horario laboral configurado.
- La secuencia publica por ventanilla se reinicia diariamente con la jornada, comenzando nuevamente en `01`.
- Las jornadas anteriores se mantienen para consulta de metricas y trazabilidad.
- El administrador puede seleccionar centro y dia de atencion para revisar metricas.
- En el MVP, la descarga para Excel se implementa como CSV compatible con Excel para evitar dependencias adicionales.
- En el MVP, la salida PDF se prepara mediante una vista imprimible del navegador.
