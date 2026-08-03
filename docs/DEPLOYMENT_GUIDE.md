# Deployment Guide

## Local

```bash
npm install
npm run dev
```

## Firebase

1. Crear proyecto Firebase.
2. Activar Realtime Database.
3. Activar Hosting.
4. Copiar variables a `.env`.
5. Ejecutar:

```bash
npm run build
firebase login
firebase deploy
```

## Seguridad

`database.rules.json` esta abierto para demo. Antes de piloto real:

- Agregar Firebase Authentication.
- Definir roles por centro.
- Restringir `publicStatus`.
- Proteger escritura de casos, cajas y centros.
- Auditar creacion de tickets desde totem.
