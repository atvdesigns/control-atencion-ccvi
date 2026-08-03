# Auditoria UI, interaccion y QA

Fecha: 2026-07-17

## Alcance revisado

- Roles: totem, ventanilla 1, ventanilla 2, caja, administrador y monitor publico.
- Breakpoints revisados: 390 px, 768 px y 1366 px.
- Criterios: jerarquia visual, competencia entre acciones, responsive, overflow horizontal, tamanos tactiles, microcopy visible, estados vacios, acciones repetidas y documentacion QA.

## Hallazgos corregidos

### Jerarquia de ventanilla

- El caso activo de ventanilla ahora vive en la seccion superior "Usuario en atencion".
- La cola pendiente vive en el acordeon "En espera de atencion".
- Las acciones criticas aparecen solo en el caso activo.
- La cola deja de competir visualmente con el usuario que esta siendo atendido.

### Acordeones y contadores

- Los acordeones con contadores ahora tienen nombres accesibles mas claros.
- Se evita que el texto se lea o se inspeccione como "En espera de atencion0" o "Pagos pendientes1".

### Caja

- Cuando existe un turno activo, la seccion principal pasa a "Turno en caja".
- La card activa usa tratamiento visual prominente para diferenciarla de contexto secundario.

### Boton de reinicio demo

- El boton "Reiniciar demo" se redujo en mobile para que no compita con acciones operativas.
- Mantiene etiqueta accesible y titulo descriptivo.

### Administrador

- Los botones de exportacion dejan de estirarse verticalmente por la altura del selector de jornada.
- Se reemplazo texto tecnico visible sobre Firebase por lenguaje de modo demo y produccion.

### Defensa de estados

- `startValidation` ahora exige que el turno este en estado llamado a ventanilla antes de iniciar revision.
- El totem bloquea doble emision por toque repetido durante la creacion del turno.

## Validaciones realizadas

- Typecheck con `tsc -b`.
- Build de produccion con `vite build`.
- Auditoria DOM por rol y breakpoint.
- Revision de overflow horizontal.
- Revision de botones menores a 44 px.
- Revision de textos tecnicos visibles.

## Resultado

- No se detecto overflow horizontal en los breakpoints revisados.
- No se detectaron botones visibles menores a 44 px.
- No se modificaron reglas de negocio, identificadores publicos, FIFO, routing ni modelo de datos.

## Recomendaciones para fase posterior

- Agregar pruebas automatizadas de accesibilidad con una herramienta dedicada.
- Incorporar pruebas end-to-end para flujos completos de totem, ventanilla, caja y administrador.
- Evaluar code splitting para reducir el tamano del bundle.
- Cuando se conecte Firebase real, validar transacciones atomicas y concurrencia con varios dispositivos.
