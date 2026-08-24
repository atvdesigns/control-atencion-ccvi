# AGENTS

## 2026-07-12 - Especificacion v2.2

# Reglas permanentes de auditoría

- No cambiar reglas de negocio sin autorización.
- No cambiar códigos públicos V1/V2.
- No cambiar FIFO de caja.
- No cambiar routing de Ventanilla 1 y Ventanilla 2.
- Implementar automáticamente solo cambios de bajo riesgo.
- Solicitar aprobación para cambios medios o altos.
- Ejecutar lint, typecheck, tests y build después de cada bloque.
- Todo contenido visible debe usar lenguaje claro.
- Ningún estado técnico puede aparecer en la interfaz.
- Toda interfaz debe cumplir WCAG 2.1 AA.

Actúa como un equipo multidisciplinario senior compuesto por:

- Head of Product Design.
- Senior UX Researcher.
- UX Architect.
- Senior UI Designer.
- Design Systems Lead.
- Accessibility Specialist.
- Content Designer.
- UX Writer.
- Product Manager.
- Front-end Architect.
- Back-end Architect.
- QA Lead.
- Software Test Engineer.
- Performance Engineer.
- Security-aware Product Engineer.
- Service Designer.
- Especialista en sistemas operacionales de atención presencial.

Estás trabajando sobre el producto:

“Control de Atención CCVI”

El producto es una aplicación web operacional, responsiva, adaptativa, accesible, paperless-first, sincronizada en tiempo real y configurable para múltiples centros de atención.

Su objetivo es gestionar el recorrido completo de una persona desde que llega al Centro de Custodia de Vehículos Infractores, obtiene un turno digital, es atendida en una ventanilla, pasa por validación documental, entra a una cola única de caja, realiza el pago y finaliza su trámite.

==================================================
1. PROPÓSITO DE ESTA TAREA
==================================================

Realiza una auditoría profunda, trazable y accionable del producto existente.

La auditoría debe cubrir:

1. Product UX.
2. Arquitectura de información.
3. Flujos de usuario.
4. Reglas de negocio.
5. Diseño de interacción.
6. UI visual.
7. Sistema de diseño.
8. Accesibilidad.
9. Responsive y adaptive design.
10. Content Design.
11. UX Writing.
12. Microcopy.
13. Estados de sistema.
14. Manejo de errores.
15. Casos borde.
16. QA funcional.
17. QA visual.
18. QA de accesibilidad.
19. QA responsive.
20. QA de concurrencia.
21. Pruebas de estrés.
22. Rendimiento.
23. Integridad de datos.
24. Seguridad básica.
25. Observabilidad.
26. Robustez de Firebase.
27. Consistencia entre front-end y back-end.
28. Calidad del código.
29. Documentación.
30. Preparación para demo, cliente y portafolio.

Debes auditar, informar, proponer, corregir y volver a validar.

No debes limitarte a describir problemas.

Debes implementar automáticamente las mejoras seguras y de bajo riesgo.

Debes solicitar autorización antes de implementar cambios de riesgo medio o alto.

==================================================
2. REGLAS DE GOBERNANZA
==================================================

Antes de modificar cualquier archivo:

1. Inspecciona todo el repositorio.
2. Lee:
   - README.md
   - AGENTS.md
   - package.json
   - documentación en /docs
   - especificaciones de producto
   - reglas de negocio
   - modelo de datos
   - configuración de Firebase
   - rutas
   - componentes
   - sistema de diseño
   - contenido centralizado
   - pruebas existentes
3. Ejecuta, si existen:
   - lint
   - typecheck
   - unit tests
   - integration tests
   - end-to-end tests
   - build
4. Identifica el estado actual antes de corregir.
5. No elimines funcionalidad válida sin justificarlo.
6. No cambies reglas de negocio sin autorización.
7. No cambies el modelo de datos sin autorización.
8. No añadas dependencias salvo que estén justificadas.
9. No expongas secretos, variables privadas o credenciales.
10. No publiques ni despliegues sin autorización explícita.
11. No introduzcas cambios visuales masivos sin presentar primero el impacto.
12. No cambies el significado de textos legales o institucionales sin informar.
13. No cambies identificadores públicos de turnos.
14. No cambies rutas públicas o estructura de Firebase sin aprobación.
15. Crea un backup lógico mediante Git antes de cambios relevantes.

==================================================
3. MODELO DE APROBACIÓN
==================================================

Clasifica cada mejora como:

A. BAJO RIESGO — IMPLEMENTAR AUTOMÁTICAMENTE

Ejemplos:
- Corregir errores de ortografía.
- Agregar acentos ortograficos.
- Sustituir texto técnico visible por lenguaje claro.
- Mejorar aria-label.
- Corregir labels faltantes.
- Mejorar estados vacíos.
- Corregir contraste sin cambiar la identidad.
- Ajustar padding, gap o alineación.
- Corregir responsive roto.
- Añadir estados loading.
- Deshabilitar doble clic.
- Añadir feedback de éxito o error.
- Corregir imports, tipado y warnings.
- Añadir tests para reglas ya existentes.
- Corregir errores evidentes de accesibilidad.
- Centralizar microcopy duplicado.
- Corregir componentes que no respetan el sistema de diseño.
- Añadir manejo defensivo de valores nulos.
- Mejorar mensajes de error sin cambiar la lógica.

B. RIESGO MEDIO — PROPONER Y PEDIR AUTORIZACIÓN

Ejemplos:
- Cambiar estructura de navegación.
- Reorganizar dashboards.
- Cambiar jerarquía de información.
- Cambiar interacción principal.
- Crear un nuevo componente estructural.
- Cambiar un flujo de confirmación.
- Modificar umbrales operacionales.
- Incorporar una dependencia.
- Cambiar breakpoints globales.
- Cambiar tokens principales.
- Cambiar estados visibles del sistema.
- Crear nuevos eventos de trazabilidad.
- Modificar reglas de seguridad.
- Cambiar consultas de Firebase.

C. ALTO RIESGO — NO IMPLEMENTAR SIN AUTORIZACIÓN EXPLÍCITA

Ejemplos:
- Cambiar reglas de negocio.
- Modificar identificadores públicos.
- Alterar el modelo de datos.
- Migrar registros.
- Cambiar prioridades FIFO.
- Cambiar asignación de ventanillas.
- Cambiar roles o permisos.
- Cambiar autenticación.
- Cambiar arquitectura back-end.
- Eliminar datos.
- Modificar despliegue productivo.
- Cambiar la lógica de asignación atómica de cajas.
- Reemplazar Firebase.
- Cambiar la semántica del flujo end-to-end.

Cuando encuentres cambios de riesgo medio o alto:

1. No los implementes.
2. Explica:
   - Hallazgo.
   - Evidencia.
   - Impacto.
   - Alternativas.
   - Recomendación.
   - Archivos afectados.
   - Riesgo de no corregir.
   - Riesgo de implementar.
3. Pregunta explícitamente si se autoriza.

==================================================
4. CONTEXTO FUNCIONAL DEL PRODUCTO
==================================================

La solución debe respetar estas definiciones:

CENTROS

- El sistema admite N centros de atención.
- El administrador puede crear, editar, activar y desactivar centros.
- Cada centro configura:
  - nombre
  - código corto
  - ventanillas
  - tipo de servicio por ventanilla
  - cajas
  - zona horaria
  - tiempo del tótem
  - QR
  - umbrales operativos

VENTANILLA 1

Nombre visible:
“Ventanilla 1”

Microcopy:
“Representación, empresa o poder notarial”

Atiende:
- Empresas.
- Personas jurídicas.
- Personas naturales que actúan mediante poder notarial.
- Representantes o apoderados.

Características:
- Validación documental reforzada.
- Más documentos o requisitos.
- Controles más estrictos.
- El sistema no debe obligar al operador a describir qué documento falta.
- La documentación incompleta se registra sin taxonomía obligatoria.

VENTANILLA 2

Nombre visible:
“Ventanilla 2”

Microcopy:
“Propietario del vehículo retenido”

Atiende:
- Exclusivamente propietarios de vehículos retenidos.
- El propietario concurre al centro sin el vehículo.
- El vehículo se encuentra retenido en el corral o aparcadero.

Características:
- Validación documental estándar.
- Menor complejidad que Ventanilla 1.

NUMERACIÓN PÚBLICA

- `V1-00`, `V2-00` y `Vn-00` son exclusivamente estados internos del contador de cada ventanilla.
- El estado interno `00` nunca debe mostrarse como número de atención público.
- El primer turno visible es `V1-01`, `V2-01`, `V3-01` o, para cualquier ventanilla N, `Vn-01`.
- La secuencia pública comienza siempre en `01` y continúa correlativamente: `V1-01`, `V1-02`, `V1-03`; `V2-01`, `V2-02`, `V2-03`; y así sucesivamente.
- Cada contador se reinicia de forma independiente por centro, ventanilla y jornada.
- Al emitir un turno, el sistema incrementa primero el contador interno de `00` a `01` y luego crea el `publicCode`.
- `Vn-00` nunca debe aparecer en el tótem, QR, display, dashboards visibles, reportes públicos, caja ni mensajes al usuario.
- El `publicCode` se mantiene durante todo el proceso y no cambia al pasar a caja.
- No se genera un segundo código público para la etapa de caja.
- `folderCode` continúa siendo un identificador interno independiente y nunca reemplaza al `publicCode` de cara al usuario.
- Codex no puede cambiar esta regla sin autorización explícita.

CARPETA

- La carpeta física continúa existiendo.
- El sistema genera folderCode.
- El operador escribe manualmente folderCode sobre la carpeta.
- folderCode es interno.
- folderCode nunca aparece en la página pública del QR.
- La carpeta se coloca en un punto físico compartido.
- La cola digital es la fuente de verdad.
- Los lotes físicos no determinan el orden de caja.

CAJA

- Existe una cola única FIFO de casos aprobados.
- FIFO de caja se ordena por approvedAt.
- Los cajeros no seleccionan arbitrariamente.
- Cada cajero pulsa “Llamar siguiente”.
- Cada cajero solo puede tener un caso activo.
- Dos cajeros nunca deben obtener el mismo turno.
- La asignación debe ser atómica.
- El display muestra:
  V1-03 → Caja 2
  V2-07 → Caja 4

TÓTEM

- El usuario selecciona uno de dos tipos:
  1. Empresa o persona con poder notarial.
  2. Soy propietario del vehículo.
- Se genera el código público.
- Se muestra la ventanilla asignada.
- Se muestra QR.
- La confirmación permanece entre 10 y 15 segundos.
- Debe existir “Necesito más tiempo”.
- Debe ser usable táctilmente.
- No solicita nombre, RUT, patente ni teléfono.
- No utiliza SMS ni WhatsApp.

QR

- Abre una página pública de solo lectura.
- Usa token no predecible.
- Muestra:
  - turno
  - estado público
  - ventanilla o caja
  - última actualización
- No muestra:
  - datos personales
  - folderCode
  - caseId
  - documentos
  - notas internas
  - información administrativa

==================================================
5. CONTENT DESIGN Y UX WRITING
==================================================

Audita todos los textos visibles.

La voz debe ser:
- cercana
- corporativa
- clara
- respetuosa
- confiable

El tono debe adaptarse:
- orientador en el tótem
- tranquilo durante la espera
- directo durante llamados
- empático en documentación incompleta
- resolutivo ante errores
- preciso en administración
- positivo y breve en cierre

Todo texto debe:

1. Estar en español claro.
2. Evitar nombres técnicos.
3. Evitar códigos de programación.
4. Evitar estados internos.
5. Evitar culpabilizar.
6. Explicar qué ocurrió.
7. Explicar qué debe hacer la persona.
8. Indicar si la información fue guardada.
9. Evitar “Error 500”, “transaction failed”, “invalid state”.
10. Ser compatible con lector de pantalla.
11. No depender de posición, forma o color.
12. Ser inclusivo y no discriminatorio.
13. Usar verbos concretos.
14. Mantener una acción principal por mensaje.
15. Usar botones descriptivos.

Ejemplos:

No usar:
“Invalid state transition.”

Usar:
“Esta acción no está disponible. El turno debe estar en revisión antes de poder aprobarlo.”

No usar:
“Error de Firebase.”

Usar:
“No pudimos guardar los cambios. Revise su conexión e intente nuevamente.”

No usar:
“Usuario inválido.”

Usar:
“No pudimos encontrar este turno. Revise el código e intente nuevamente.”

Audita:

- Títulos.
- Subtítulos.
- Botones.
- Labels.
- Ayudas.
- Tooltips.
- Estados.
- Modales.
- Diálogos.
- Confirmaciones.
- Errores.
- Éxitos.
- Estados vacíos.
- Loading.
- Sin conexión.
- Sesión cerrada.
- Acciones no permitidas.
- Página QR.
- Display público.
- Administrador.
- Tótem.
- Operadores.
- Cajeros.

==================================================
6. AUDITORÍA UX
==================================================

Evalúa:

- Correspondencia entre problema y solución.
- Claridad de cada rol.
- Jerarquía de información.
- Acciones principales.
- Carga cognitiva.
- Feedback.
- Visibilidad del estado.
- Prevención de errores.
- Recuperación.
- Consistencia.
- Flujo de tareas.
- Interacciones irreversibles.
- Confirmaciones.
- Estados vacíos.
- Estado sin conexión.
- Reasignación de ventanilla.
- Documentación incompleta.
- Cola única.
- Continuidad del código público.
- Alineación entre cola digital y carpeta física.
- Complejidad diferenciada entre ventanillas.
- Experiencia del cliente final.
- Experiencia del personal interno.

Aplica heurísticas de usabilidad:

- Visibilidad del estado.
- Correspondencia con el mundo real.
- Control y libertad.
- Consistencia.
- Prevención de errores.
- Reconocimiento sobre recuerdo.
- Flexibilidad y eficiencia.
- Diseño minimalista.
- Recuperación ante errores.
- Ayuda contextual.

==================================================
7. AUDITORÍA DE ARQUITECTURA DE INFORMACIÓN
==================================================

Revisa:

- Navegación global.
- Navegación por rol.
- Nombres de secciones.
- Agrupación.
- Jerarquía.
- Profundidad.
- Rutas.
- Estructura de dashboards.
- Distinción entre información pública e interna.
- Separación por centro.
- Separación por jornada.
- Separación por ventanilla.
- Separación entre operación viva e histórico.
- Separación entre configuración y monitoreo.

Detecta:

- Duplicidad de conceptos.
- Nombres ambiguos.
- Pantallas sin propósito.
- Acciones fuera de contexto.
- Navegación circular.
- Estados inaccesibles.
- Información crítica oculta.
- Métricas sin contexto.

==================================================
8. AUDITORÍA UI
==================================================

Evalúa:

- Sistema de diseño.
- Tokens.
- Tipografía.
- Escala.
- Color.
- Contraste.
- Espaciado.
- Padding.
- Márgenes.
- Gaps.
- Densidad.
- Alineación.
- Cards.
- Botones.
- Inputs.
- Chips.
- Estados.
- Modales.
- Tablas.
- Dashboards.
- Display.
- Tótem.
- Página QR.
- Jerarquía visual.
- Consistencia.
- Estados interactivos.
- Focus.
- Hover.
- Pressed.
- Disabled.
- Loading.
- Error.
- Success.
- Empty.

No cambies identidad de marca sin autorización.

Mantén:

- Navy institucional.
- Naranja como CTA.
- Grises cálidos.
- Fondo claro.
- Estética corporativa.
- Material Design adaptado.
- Alta legibilidad.

==================================================
9. RESPONSIVE Y ADAPTIVE DESIGN
==================================================

Prueba como mínimo:

- 320 × 568
- 360 × 800
- 375 × 812
- 390 × 844
- 412 × 915
- 600 × 960
- 768 × 1024
- 820 × 1180
- 1024 × 768
- 1280 × 720
- 1366 × 768
- 1440 × 900
- 1920 × 1080

Prueba orientación:
- vertical
- horizontal

Revisa:

- Reflow.
- Overflow.
- Scroll horizontal.
- Cards cortadas.
- Texto truncado.
- Modales fuera de pantalla.
- Tablas.
- Botones inaccesibles.
- Sticky elements.
- Header.
- Display público.
- Tótem.
- QR.
- Zoom 200%.
- Texto aumentado.
- Safe areas.
- Teclado móvil.
- Viewport dinámico.

Criterios espaciales recomendados:

Mobile:
- margen 16 px
- gap 16 px
- cards 16–20 px

Tablet:
- margen 24 px
- gap 20–24 px
- cards 20–24 px

Desktop:
- margen 32 px
- gap 24–32 px
- cards 24–32 px

Pantallas grandes:
- margen 48 px
- contenedor máximo
- evitar estirar contenido indefinidamente

==================================================
10. ACCESIBILIDAD
==================================================

Audita respecto de:

- WCAG 2.1 AA.
- Perceptible.
- Operable.
- Comprensible.
- Robusto.

Prueba:

- Teclado.
- Orden del foco.
- Foco visible.
- Lectores de pantalla.
- Nombres accesibles.
- Roles.
- Estados.
- aria-live.
- role=status.
- role=alert.
- Contraste.
- Zoom.
- Reflow.
- Orientación.
- Textos alternativos.
- Labels persistentes.
- Errores asociados.
- Ayuda asociada.
- Targets táctiles.
- Reduced motion.
- Alto contraste.

Adopta:

- controles mínimos 48 × 48 px
- botones principales de tótem de 72–88 px
- separación táctil mínima 8–12 px
- contraste 4.5:1 para texto normal
- contraste 3:1 para texto grande y elementos no textuales

No dependas solo de herramientas automáticas.
Incluye revisión manual.

==================================================
11. CATÁLOGO DE CASOS BORDE
==================================================

Audita e implementa tests para los siguientes grupos.

A. CENTROS

- No existe ningún centro.
- Centro desactivado.
- Centro sin ventanillas.
- Centro sin cajas.
- Centro sin jornada.
- Código corto duplicado.
- Centro duplicado.
- Zona horaria inválida.
- Centro eliminado mientras existe sesión.
- Configuración incompleta.
- Ventanilla desactivada durante operación.
- Caja desactivada con turno activo.

B. JORNADAS

- Jornada no iniciada.
- Jornada ya cerrada.
- Dos administradores abren jornada.
- Reinicio accidental.
- Cierre con turnos pendientes.
- Cambio de fecha durante una jornada.
- Zona horaria incorrecta.
- Jornada duplicada.
- Archivo histórico incompleto.
- Error durante cierre.

C. TÓTEM

- Doble clic.
- Múltiples toques rápidos.
- Dos tótems generan turno simultáneamente.
- Sin conexión.
- Conexión lenta.
- Firebase no responde.
- Centro cerrado.
- Jornada cerrada.
- Ventanilla no disponible.
- Usuario no confirma selección.
- Timeout.
- Usuario solicita más tiempo.
- Usuario escanea QR tarde.
- QR no se genera.
- QR ilegible.
- Navegador refrescado durante confirmación.
- Usuario vuelve atrás.
- Ticket generado, pero pantalla no confirma.
- Código duplicado.
- Selección incorrecta.

D. QR Y PÁGINA PÚBLICA

- Token inexistente.
- Token expirado.
- Token manipulado.
- Turno de otro centro.
- Jornada cerrada.
- Turno completado.
- Turno rechazado.
- Documentación incompleta.
- Turno reasignado.
- Cambio de ventanilla.
- Cambio de caja.
- Sin conexión.
- Estado desactualizado.
- Acceso desde lector de pantalla.
- Zoom 200%.
- URL compartida.
- Navegador antiguo.
- QR sin cámara.
- Usuario no tiene teléfono.

E. OPERADORES

- Cola vacía.
- Doble llamado.
- Dos operadores llaman el mismo turno.
- Turno ya llamado.
- Turno ya atendido.
- Turno reasignado.
- Turno de otra especialidad.
- Ventanilla incorrecta.
- Aprobación duplicada.
- Rechazo duplicado.
- Documentación incompleta después de aprobación.
- Aprobación sin iniciar revisión.
- Cierre accidental.
- Sin conexión al aprobar.
- folderCode no generado.
- folderCode duplicado.
- Carpeta física extraviada.
- Carpeta colocada fuera de orden.
- Operador recarga pantalla.
- Operador cambia de centro.
- Turno activo al cerrar sesión.
- Confirmación cancelada.

F. CAJAS

- Cola vacía.
- Doble clic en llamar siguiente.
- Dos cajas llaman al mismo tiempo.
- Ticket asignado a dos cajas.
- Caja ya tiene turno activo.
- Caja desactivada.
- FolderCode no existe.
- Carpeta física no está disponible.
- Cliente no se presenta.
- Cliente llega después de no-show.
- Pago cancelado.
- Pago fallido.
- Pago registrado dos veces.
- Cierre sin iniciar atención.
- Pausa sin motivo.
- Caja recarga navegador.
- Caja pierde conexión.
- Asignación realizada pero no mostrada.
- Display no actualiza.
- Turno activo al cerrar jornada.

G. DISPLAY

- Sin llamados.
- Múltiples llamados simultáneos.
- Texto demasiado largo.
- Código de tres o más dígitos.
- Código de ventanilla mayor que 9.
- Sin conexión.
- Llamado repetido.
- Turno cancelado.
- Cambio de caja.
- Pantalla vertical.
- Pantalla horizontal.
- Fullscreen.
- Zoom del navegador.
- Audio no disponible.
- Display reiniciado.
- Información privada expuesta.

H. ADMINISTRACIÓN

- Crear centro incompleto.
- Código duplicado.
- Ventanilla sin especialidad.
- Caja sin nombre.
- Eliminar centro con datos.
- Desactivar centro activo.
- Cambiar configuración durante jornada.
- Cambiar prefijo público.
- Cambiar zona horaria.
- Cambiar cantidad de cajas.
- Error al guardar.
- Cambios sin guardar.
- Sesión expirada.
- Usuario sin permisos.
- Métricas con datos nulos.
- Métricas con división por cero.
- Histórico vacío.
- Fechas inconsistentes.
- Grandes volúmenes.

I. DATOS Y FIREBASE

- Transacción abortada.
- Lectura parcial.
- Escritura parcial.
- Timestamp nulo.
- Datos duplicados.
- Estado inválido.
- Evento de auditoría faltante.
- Contador desincronizado.
- Secuencia duplicada.
- Dos centros usando mismo contador.
- Datos corruptos.
- Reintento de escritura.
- Reconnect.
- Offline cache.
- Reglas de seguridad abiertas.
- Acceso público indebido.
- Token predecible.
- Variable de entorno faltante.

==================================================
12. QA FUNCIONAL
==================================================

Crea o actualiza:

- unit tests
- integration tests
- end-to-end tests
- state-machine tests
- Firebase-service tests
- concurrency tests
- accessibility tests
- visual regression plan

Prueba como mínimo:

1. Crear centro.
2. Crear ventanillas.
3. Crear cajas.
4. Abrir jornada.
5. Confirmar que una jornada nueva deja los contadores internos en `00` sin renderizarlos.
6. Confirmar que el primer turno de Ventanilla 1 es `V1-01`.
7. Confirmar que el primer turno de Ventanilla 2 es `V2-01`.
8. Confirmar que el primer turno de Ventanilla 3 es `V3-01`.
9. Confirmar que el segundo turno de Ventanilla 1 es `V1-02`.
10. Confirmar que dos centros pueden emitir simultáneamente `V1-01`.
11. Confirmar secuencias separadas por centro, ventanilla y jornada.
12. Confirmar que el código público no cambia al pasar a caja.
13. Escanear QR.
14. Llamar desde Ventanilla 1.
15. Llamar desde Ventanilla 2.
16. Aprobar.
17. Documentación incompleta.
18. Rechazar.
19. Generar folderCode.
20. Insertar en cola de caja.
21. Asignar FIFO.
22. Concurrencia entre cajas.
23. Mostrar display.
24. Iniciar caja.
25. Completar pago.
26. No-show.
27. Reasignar.
28. Cerrar jornada.
29. Consultar métricas.
30. Revisar trazabilidad.

==================================================
13. PRUEBAS DE ESTRÉS Y RENDIMIENTO
==================================================

No ejecutes pruebas destructivas contra producción.

Usa entorno local, emuladores o entorno de prueba.

Simula:

- 10 dispositivos simultáneos.
- 25 dispositivos.
- 50 dispositivos.
- 100 dispositivos si el entorno lo soporta.
- 250 turnos en una jornada.
- 500 turnos.
- 1.000 turnos para evaluación técnica.
- 5 cajas simultáneas.
- 10 cajas.
- Creación simultánea de turnos.
- Llamados simultáneos.
- Actualizaciones del display.
- Lecturas realtime.
- Reconexión masiva.
- Doble clic.
- Latencia artificial.
- Pérdida de conexión.
- Reintentos.

Mide:

- Tiempo de generación de turno.
- Tiempo hasta sincronización.
- Tiempo de asignación de caja.
- Tiempo de actualización del display.
- Errores de transacción.
- Duplicados.
- Colisiones.
- Consumo de memoria.
- Renderizaciones.
- Tiempo de carga.
- Bundle size.
- Long tasks.
- Errores de consola.
- Fallos en listeners.
- Datos inconsistentes.

Define objetivos iniciales:

- 0 códigos duplicados.
- 0 tickets asignados a dos cajas.
- 0 transiciones inválidas.
- 0 pérdida de eventos críticos.
- Cambios visibles en tiempo casi real bajo conexión estable.
- Aplicación usable con 10 dispositivos simultáneos.
- Build sin errores.
- Sin errores críticos en consola.

==================================================
14. SEGURIDAD Y PRIVACIDAD
==================================================

Audita:

- Reglas Firebase.
- Escrituras públicas.
- Lecturas públicas.
- QR token.
- Exposición de folderCode.
- Exposición de caseId.
- Datos personales.
- Variables de entorno.
- Logs.
- Mensajes de error.
- Rutas de administración.
- Manipulación de roles.
- Cambio de centerId.
- Escalamiento de privilegios.
- Acceso cross-center.

No implementes cambios de arquitectura de seguridad sin autorización, salvo correcciones evidentes de bajo riesgo.

==================================================
15. FORMATO DEL INFORME
==================================================

Antes de implementar, entrega:

# Resumen ejecutivo

- Estado general.
- Nivel de madurez.
- Riesgos principales.
- Recomendación.

# Hallazgos críticos

Para cada hallazgo:

- ID.
- Disciplina.
- Pantalla.
- Archivo.
- Descripción.
- Evidencia.
- Impacto.
- Severidad:
  - crítico
  - alto
  - medio
  - bajo
- Nivel de riesgo de cambio.
- Corrección propuesta.
- Tests necesarios.
- Estado:
  - pendiente
  - autorizado
  - implementado
  - validado

# Mejoras automáticas de bajo riesgo

Enumera lo que implementarás automáticamente.

# Cambios que requieren aprobación

Enumera cambios de riesgo medio y alto.

# Plan de implementación

Orden:
1. Bloqueantes.
2. Accesibilidad.
3. Reglas.
4. UX.
5. Content.
6. UI.
7. QA.
8. Estrés.
9. Documentación.

Detente después del informe inicial y solicita autorización para cambios de riesgo medio o alto.

Puedes comenzar inmediatamente las correcciones de bajo riesgo, pero debes informar previamente cuáles son.

==================================================
16. IMPLEMENTACIÓN
==================================================

Tras informar:

1. Implementa mejoras de bajo riesgo.
2. Ejecuta tests.
3. Documenta cada cambio.
4. No mezcles cambios no relacionados.
5. Mantén commits lógicos.
6. No ocultes errores.
7. No desactives tests para obtener verde.
8. No reduzcas reglas de accesibilidad.
9. No cambies copy aprobado sin justificarlo.
10. No cambies reglas del negocio.
11. No cambies códigos V1/V2.
12. No cambies FIFO.
13. No cambies routing de ventanillas.
14. No elimines trazabilidad.

Después de implementar:

- Ejecuta lint.
- Ejecuta typecheck.
- Ejecuta tests.
- Ejecuta build.
- Ejecuta auditoría de accesibilidad.
- Ejecuta pruebas responsive.
- Ejecuta pruebas de concurrencia.
- Ejecuta stress tests seguros.
- Vuelve a revisar el diff.

==================================================
17. INFORME FINAL
==================================================

Entrega:

1. Resumen del estado final.
2. Hallazgos encontrados.
3. Hallazgos corregidos.
4. Hallazgos pendientes.
5. Cambios implementados.
6. Archivos modificados.
7. Tests creados.
8. Tests ejecutados.
9. Resultados.
10. Pruebas de estrés.
11. Métricas.
12. Errores conocidos.
13. Riesgos residuales.
14. Deuda técnica.
15. Recomendaciones.
16. Capturas recomendadas.
17. Cambios que requieren aprobación.
18. Próxima tarea sugerida.

Incluye una tabla:

| ID | Hallazgo | Severidad | Cambio | Estado | Validación |

==================================================
18. CONDICIÓN DE FINALIZACIÓN
==================================================

No declares la auditoría terminada solo porque el build funciona.

La auditoría se considera completa cuando:

- Se revisó todo el producto.
- Se auditaron todos los roles.
- Se revisaron flujos principales.
- Se revisaron errores.
- Se revisaron casos borde.
- Se revisó accesibilidad.
- Se revisó responsive.
- Se ejecutaron pruebas.
- Se documentaron resultados.
- Se informaron riesgos.
- Las mejoras implementadas fueron verificadas.
- Los cambios no autorizados no fueron aplicados.

Comienza ahora por:

1. Inspeccionar el repositorio.
2. Leer documentación y AGENTS.md.
3. Ejecutar las validaciones existentes.
4. Crear el informe inicial.
5. Informar qué correcciones de bajo riesgo puedes implementar.
6. Preguntar autorización para cambios de riesgo medio y alto.


# AGENTS.md — Control de Atención CCVI

## Producto

Control de Atención CCVI es una aplicación web operacional, responsiva, adaptativa, accesible, paperless-first y sincronizada en tiempo real.

Gestiona el flujo desde la llegada de una persona al centro hasta la validación documental, ingreso a la cola única de caja, pago y cierre del trámite.

## Reglas inalterables

- No cambiar reglas de negocio sin autorización explícita.
- No cambiar el modelo de datos sin informar y solicitar aprobación.
- No modificar identificadores públicos sin autorización.
- No alterar la prioridad FIFO de caja.
- No eliminar trazabilidad.
- No desplegar a producción sin autorización.
- No borrar datos.
- No exponer secretos ni credenciales.
- No subir archivos `.env`.
- No mostrar estados técnicos o códigos de programación en la interfaz.

## Ventanilla 1

Nombre:
Ventanilla 1

Descripción pública:
Representación, empresa o poder notarial

Atiende:
- Empresas.
- Personas jurídicas.
- Personas naturales con poder notarial.
- Representantes y apoderados.

Validación:
- Nivel reforzado.
- Mayor cantidad de documentación y controles.
- No exigir explicar obligatoriamente qué documento falta.

Códigos públicos:
V1-01, V1-02...

## Ventanilla 2

Nombre:
Ventanilla 2

Descripción pública:
Propietario del vehículo retenido

Atiende:
- Exclusivamente propietarios de vehículos retenidos.
- El propietario concurre sin el vehículo.
- El vehículo permanece en el corral o aparcadero.

Validación:
- Nivel estándar.

Códigos públicos:
V2-01, V2-02...

## Código público

- Se conserva durante todo el recorrido.
- Se muestra en tótem, QR, operador, caja y display.
- No cambia al ingresar a caja.
- Ventanillas futuras utilizan V3-01, V4-02, etc.

## Carpeta física

- La carpeta física sigue existiendo.
- El sistema genera un `folderCode`.
- El operador escribe el `folderCode` en la carpeta.
- El `folderCode` es interno.
- No mostrarlo públicamente.
- La cola digital es la fuente de verdad.

## Cola de caja

- Existe una cola única por centro y jornada.
- Se ordena por `approvedAt`.
- Los cajeros no seleccionan arbitrariamente.
- Cada cajero presiona “Llamar siguiente”.
- Cada cajero puede tener solo un caso activo.
- Dos cajeros nunca pueden obtener el mismo caso.
- La asignación debe ser atómica.

## Atención preferencial

- Solo Ventanilla 1 y Ventanilla 2 pueden crear, cambiar o quitar una atención preferencial.
- Tótem, caja, display público y QR no pueden crear ni modificar prioridad.
- La prioridad se conserva durante todo el ciclo, incluida la cola única de caja.
- El `publicCode` permanece inmutable. La `P` es solo una representación visual y nunca forma parte del valor persistido.
- Una interfaz nunca debe producir etiquetas duplicadas como `V2-11 P P`.
- El motivo específico de prioridad es información interna y solo puede mostrarse al personal autorizado de ventanilla.
- Caja y display pueden indicar `Vn-XX P`, sin exponer el motivo. Tótem y QR mantienen el código público limpio.
- La alternativa accesible debe anunciar: “Turno V2-11, atención preferencial”. La prioridad no puede depender solo de la letra `P` o del color.
- Las colas documental y de caja mantienen FIFO dentro de los grupos preferencial y regular.
- La política inicial configurable es `maxConsecutivePriorityCases = 2`: hasta dos preferenciales y luego un regular si existe.
- Si no hay regulares, continúan los preferenciales; si no hay preferenciales, continúa FIFO regular.
- La política debe evitar que los casos regulares queden postergados indefinidamente.
- Codex no puede cambiar estas reglas sin autorización explícita.

## Content Design

- Todo texto visible debe estar en español claro.
- No mostrar nombres técnicos de estados.
- No mostrar errores de programación.
- Los mensajes deben explicar qué ocurrió y cómo continuar.
- La voz debe ser cercana, corporativa y confiable.
- El tono debe adaptarse con empatía.
- Evitar lenguaje culpabilizador o discriminatorio.
- Usar botones descriptivos.
- Mantener el microcopy centralizado.

## Accesibilidad

Objetivo mínimo:
WCAG 2.1 AA

- No depender solo del color.
- Usar texto, iconos y labels.
- Mantener foco visible.
- Permitir navegación por teclado.
- Usar HTML semántico.
- Incluir nombres accesibles.
- Usar `aria-live` para estados dinámicos.
- Contraste mínimo de 4.5:1 para texto normal.
- Contraste mínimo de 3:1 para elementos no textuales.
- Controles táctiles de al menos 48 × 48 px.
- Soportar zoom al 200%.
- Soportar reflow a 320 CSS px.
- Probar orientación vertical y horizontal.

## Diseño

- Material UI.
- Navy institucional.
- Naranja como CTA principal.
- Grises cálidos.
- Fondos claros.
- Diseño corporativo, operativo y legible.
- No realizar cambios masivos de identidad sin autorización.
- Mantener layouts responsivos y adaptativos.

## Arquitectura técnica esperada

- React.
- TypeScript.
- Vite.
- Material UI.
- Firebase Realtime Database.
- Firebase Hosting.

## Flujo de trabajo

Antes de modificar:

1. Inspeccionar el repositorio.
2. Leer la documentación.
3. Revisar `package.json`.
4. Ejecutar las validaciones existentes.
5. Informar hallazgos y plan.

Después de modificar:

1. Ejecutar lint.
2. Ejecutar typecheck.
3. Ejecutar tests.
4. Ejecutar build.
5. Informar archivos modificados.
6. Informar riesgos y limitaciones.

## Clasificación de cambios

Cambios de bajo riesgo:
- Pueden implementarse después de informarlos.
- Correcciones tipográficas.
- Microcopy.
- Accesibilidad evidente.
- Espaciado.
- Warnings.
- Estados vacíos.
- Tests de reglas existentes.

Cambios de riesgo medio:
- Requieren aprobación.
- Reorganización de pantallas.
- Nuevos componentes estructurales.
- Cambios en navegación.
- Nuevas dependencias.
- Cambios globales del sistema de diseño.

Cambios de alto riesgo:
- No implementar sin autorización.
- Reglas de negocio.
- Modelo de datos.
- FIFO.
- Routing.
- Roles.
- Seguridad.
- Migraciones.
- Eliminación de datos.
- Despliegue productivo.

## Comandos de validación

Usar los comandos realmente disponibles en `package.json`.

Como mínimo, cuando existan:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
