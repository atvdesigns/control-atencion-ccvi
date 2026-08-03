# Gobernanza de accesibilidad, diseño e interacción

Fecha: 2026-07-18

Este documento define el marco obligatorio para diseñar, editar y auditar las pantallas de Control de Atención CCVI. Debe aplicarse de inicio a fin en cada flujo, componente, texto visible, interacción y punto de contacto con usuarios internos y públicos.

## Referentes base

- W3C / WAI y WCAG: principios de contenido perceptible, operable, comprensible y robusto.
- Manual de Accesibilidad Web de Kit Digital Gobierno de Chile.
- SENADIS: accesibilidad universal, diseño universal e inclusión.
- Guía de Accesibilidad Web SENADIS 2016.
- Marco chileno de accesibilidad digital municipal, Ley 21.180, Ley 20.422 y Decreto 1.

Estos referentes no se tratan como una sección aislada. Funcionan como criterios transversales para decisiones de producto, UX, UI, front-end, contenido, QA y monitoreo.

## Principio rector

Toda persona debe poder entender el estado de su trámite, recibir el llamado, ejecutar una acción o recuperarse de un error sin depender exclusivamente de color, sonido, ubicación visual, memoria, tecnicismos o asistencia de otra persona.

## Estándar mínimo del MVP

- Objetivo de conformidad: WCAG 2.1 nivel AA.
- Adoptar criterios útiles de WCAG 2.2 cuando mejoren interacción táctil, foco visible, navegación y prevención de errores.
- Validar diseño universal en tótem, monitor público, QR, ventanillas, caja y administrador.
- Priorizar remediación en el componente y el contenido original. No depender de overlays de accesibilidad como solución principal.

## Criterios por principio WCAG

### Perceptible

- Todo estado debe comunicarse con texto, icono y tratamiento visual; nunca solo con color.
- Los llamados en monitor público deben combinar señal visual, texto claro y sonido cuando el navegador lo permita.
- El sonido de llamado es apoyo, no canal único. Una persona con discapacidad auditiva debe poder seguir el flujo por pantalla.
- El contenido visual debe mantener contraste suficiente entre texto, chips, cards, fondos y botones.
- La tipografía debe escalar sin romper el layout ni producir superposición.
- El logo debe tener texto alternativo cuando aporte identidad institucional.
- El QR debe tener alternativa textual o URL visible cuando corresponda.

### Operable

- Todo control debe poder usarse con teclado, mouse y pantalla táctil.
- El foco visible debe ser claro, consistente y no depender de un borde demasiado sutil.
- Los componentes interactivos deben tener área táctil mínima recomendada de 44 x 44 px; se recomienda 48 x 48 px para este sistema.
- No debe existir scroll horizontal global en mobile.
- Las zonas con muchas cards pueden tener scroll interno, pero el usuario debe entender que el contenedor contiene más información.
- Los acordeones deben tener estado expandido/contraído comprensible y nombre accesible con contador.
- Las acciones destructivas o irreversibles deben agregar fricción intencional mediante confirmación, advertencia y texto explícito.

### Comprensible

- Usar español claro, directo y con tildes.
- No mostrar estados técnicos como `waiting_cashier`, `case_reassigned`, `payment_failed` o errores de Firebase.
- Cada pantalla debe explicar qué ocurre y cuál es la siguiente acción esperada.
- Los mensajes de error deben indicar qué pasó, si la información se guardó y cómo continuar.
- Los estados vacíos deben explicar por qué no hay elementos y qué debe hacer el usuario.
- Las acciones críticas deben usar verbos concretos: llamar, iniciar, aprobar, rechazar, reasignar, retomar, finalizar, eliminar.
- La interfaz debe evitar culpa al usuario. Preferir "No pudimos completar la acción" sobre "Acción inválida".

### Robusto

- Usar HTML semántico y componentes MUI con roles/nombres accesibles correctos.
- Los selects de Rol y Centro deben tener label persistente y nombre accesible.
- Los cambios de estado relevantes deben poder anunciarse con regiones `aria-live` cuando sea necesario.
- Los íconos decorativos deben marcarse como decorativos; los íconos funcionales deben tener etiqueta accesible.
- Las rutas públicas no deben exponer datos internos o sensibles.

## Auditoría obligatoria antes de cerrar una pantalla

Cada edición visual debe responder estas preguntas:

1. ¿Cuál es la acción principal de esta pantalla?
2. ¿El elemento principal tiene jerarquía superior al resto?
3. ¿Hay elementos que compiten visualmente por la atención del usuario?
4. ¿El usuario puede entender el estado sin depender del color?
5. ¿El usuario con baja visión puede leer códigos, chips y botones?
6. ¿El usuario que no escucha el sonido del monitor puede seguir el llamado?
7. ¿El usuario que usa teclado puede llegar, activar y salir de todos los controles?
8. ¿La pantalla funciona a 320 px, tablet, desktop y monitor público?
9. ¿Hay textos técnicos visibles?
10. ¿Los estados vacíos orientan en vez de parecer fallas?
11. ¿Los contenedores padre, cards, acordeones, chips y botones mantienen la misma gobernanza visual?
12. ¿El contenido conserva tono cercano, corporativo, empático y transparente?

## Criterios de jerarquía visual

- Cada pantalla debe tener una sola acción dominante por etapa operativa.
- En ventanilla, "Atención actual" tiene prioridad sobre "En espera de atención" y "Procesados recientemente".
- En caja, "Turno en caja" tiene prioridad sobre "Cola única de caja" y "Pagos pendientes".
- En monitor público, el llamado más reciente debe tener mayor jerarquía que los llamados anteriores.
- En administrador, métricas de operación, centros, trazabilidad y exportaciones deben agruparse por propósito, no mezclarse.
- Si dos elementos tienen la misma jerarquía, deben compartir tamaño, alineación, radio, separadores, padding y comportamiento.

## Criterios de diseño visual

- Mantener paleta CCVI: navy institucional, naranja operativo, grises cálidos, blanco y fondos azul-gris suaves.
- Usar `#FFFFFF` para headers de contenedores.
- Usar fondos suaves como `#ecf0f7` para zonas internas con scroll y grupos de cards.
- Usar sombras interiores solo para reforzar profundidad en contenedores desplegados, sin crear ruido visual.
- Homologar radios, bordes, separadores, sombras y padding mediante constantes o estilos compartidos.
- Evitar superposición entre botones flotantes, cards, contenido y barras inferiores.
- Evitar espacios muertos que generen una lectura desbalanceada.

## Criterios para llamados a usuarios

El llamado debe ser multimodal:

- Texto grande y claro en monitor público.
- Diferenciación cromática sutil entre ventanillas, sin depender solo del color.
- Sonido breve cuando haya un nuevo llamado y el navegador lo permita.
- Código público constante durante todo el proceso.
- Mensaje directo: "Usuario V1-09, pase a Ventanilla 1" o "Usuario V2-09, pase a Caja 4".
- Sin información interna como carpeta física, notas, `caseId` o datos personales.

## Criterios por punto de contacto

### Tótem

- Dos opciones principales, lenguaje cotidiano y sin datos personales.
- Confirmación antes de emitir turno.
- Cuenta regresiva visible y extensible.
- QR con alternativa textual.
- Error fuera de horario claro y recuperable.

### Ventanilla

- Mostrar primero el usuario llamado o estado vacío.
- La cola de espera no debe competir con el usuario llamado.
- Acciones visibles solo cuando corresponden al estado.
- Reasignación como acción terciaria, alineada y explicada.
- "No se presentó" debe estar disponible junto a "Iniciar validación" cuando el usuario llamado no llega.

### Caja

- Mostrar "Turno en caja" como foco operativo.
- Permitir pago completado, pago no realizado, no presentado y retomar atención cuando corresponda.
- El pago no realizado debe conservar trazabilidad sin bloquear indefinidamente la caja.

### Monitor público

- Diseño legible a distancia.
- Ventanilla y Caja deben tener equilibrio espacial.
- El llamado reciente debe destacar.
- El sonido no reemplaza texto ni jerarquía visual.

### Administrador

- Métricas agrupadas por propósito.
- Centros editables con validaciones claras.
- Eliminación de centro con fricción, confirmación explícita y advertencia irreversible.
- Exportaciones con formato institucional.

## Evidencia mínima de QA

Antes de entregar una iteración visual:

- Captura desktop.
- Captura tablet o ancho medio.
- Captura mobile estrecho.
- Revisión de teclado.
- Revisión de foco visible.
- Revisión de contraste visual.
- Revisión de textos visibles y tildes.
- Revisión de estados vacíos.
- Revisión de que no hay scroll horizontal global.
- Build de producción.

## Regla de producto

La accesibilidad no se agrega al final. Cada componente nuevo debe nacer accesible, comprensible, robusto y consistente con el sistema de diseño CCVI.
