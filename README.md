# Control de Atencion CCVI

Aplicacion web paperless-first para gestionar la atencion del Centro de Custodia de Vehiculos Infractores: totem de llegada, codigos publicos por ventanilla (`V1-01`, `V2-01`), QR, validacion documental, carpeta fisica trazada por `folderCode`, cola unica FIFO de caja, display publico y panel administrador.

## Stack

- React + TypeScript + Vite
- Material UI
- Firebase-ready: Hosting + Realtime Database
- QR en pantalla con `qrcode.react`

## Definicion vigente v2.2

- Ventanilla 1: Representacion, empresa o poder notarial.
- Ventanilla 2: Propietario del vehiculo retenido.
- El propietario concurre al centro, pero el vehiculo permanece retenido en el corral o aparcadero.
- El codigo publico se genera por ventanilla: `V{windowNumber}-{sequence}`.
- El contador interno de cada centro, ventanilla y jornada comienza en `00`; valores como `V1-00`, `V2-00` o `Vn-00` nunca son turnos publicos ni deben renderizarse.
- La primera emision publica incrementa el contador a `01`: `V1-01`, `V2-01`, `V3-01` o `Vn-01`.
- La secuencia publica continua correlativamente desde `01` y se reinicia de manera independiente por centro, ventanilla y jornada.
- El usuario mantiene el mismo `publicCode` durante todo el tramite y no recibe un segundo codigo al pasar a caja.
- `folderCode` es un identificador interno independiente del codigo publico.
- El QR usa `publicToken`, no el codigo publico como clave de busqueda.
- Cada centro define horario de atencion; el totem bloquea nuevos turnos fuera de ese horario.
- Las jornadas anteriores se conservan para revisar metricas por centro y dia.
- El administrador puede descargar metricas como CSV compatible con Excel y preparar una vista imprimible/PDF.
- No se implementa SMS ni WhatsApp en MVP ni roadmap definido.

## Flujo MVP

1. El usuario selecciona su tipo de atencion en el totem.
2. El sistema confirma la seleccion antes de emitir turno.
3. Se genera `V1-01` o `V2-01`, se asigna ventanilla y se muestra QR.
4. El operador llama el siguiente turno FIFO de su ventanilla.
5. El operador valida documentacion.
6. Si aprueba, el sistema genera `folderCode` y envia el caso a cola unica de caja.
7. El cajero presiona `Llamar siguiente`.
8. El sistema asigna el caso aprobado mas antiguo.
9. El display publico muestra `V1-01 -> Caja 3`.
10. Caja completa pago y el caso queda finalizado.

## Modo demo

La app funciona sin credenciales Firebase usando persistencia local del navegador. Esto permite validar UX, reglas de negocio y pantallas antes de conectar la base en tiempo real.

```bash
npm install
npm run dev
```

URLs por rol:

```text
/?role=kiosk
/?role=operator-window-1
/?role=operator-window-2
/?role=cashier1
/?role=cashier2
/?role=cashier3
/?role=cashier4
/?role=cashier5
/?role=admin
/?role=display
```

## Firebase

Copia `.env.example` a `.env` y completa las variables del proyecto Firebase.

```bash
npm run build
firebase deploy
```

Las reglas incluidas en `database.rules.json` son abiertas solo para MVP/demo. Produccion requiere autenticacion, roles y reglas por centro.

## Documentacion

La especificacion maestra vive en `docs/MASTER_PRODUCT_SPEC.md`.
