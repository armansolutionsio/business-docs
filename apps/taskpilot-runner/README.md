# TaskPilot runner

Proceso que corre en la PC de cada desarrollador (Santi, Gabi). Toma las tareas que se inician
desde `/taskpilot` en Arman Suite y las trabaja con Claude (Agent SDK) sobre los repos locales.
Todo el trafico es saliente (el runner consulta al servidor); no hace falta abrir puertos.

Reglas que aplica el runner:

- Primero analiza y propone un plan; no modifica nada hasta que el usuario lo aprueba en el chat.
- Claude nunca hace commit, push, checkout, reset ni Pull Requests. Pull, commit y push los pide el
  usuario desde el panel Git de la pantalla de la tarea y los ejecuta este runner con el git y el
  usuario (user.name / user.email) configurados en esta PC, asi el commit sale a su nombre.
- Las operaciones sensibles (comandos que instalan, migran, borran, llaman a servicios, escrituras
  fuera del repo) se piden y el usuario las aprueba o rechaza desde el chat.
- No escribe archivos `.env`. No toca Redmine.
- Al terminar cada ejecucion genera un informe (que se hizo, archivos, pruebas, testing manual,
  pendientes, comentario propuesto, minutos estimados, mensaje de commit).

## Instalacion (una vez por PC)

1. Tener Node 20 o superior.
2. En la raiz del monorepo: `npm install` (instala el runner como workspace).
3. En `apps/taskpilot-runner`: copiar `.env.example` a `.env` y completar
   `TASKPILOT_SERVER_URL` y `TASKPILOT_RUNNER_TOKEN` (lo genera un admin en el panel Runners de
   `/taskpilot`). Autenticacion de Claude: si `ANTHROPIC_API_KEY` queda vacia, el runner usa el
   login de Claude Code de esta PC (suscripcion Pro/Max de quien usa la maquina: antes hay que
   instalar Claude Code y entrar con `claude` y `/login`); con valor, usa esa API key y se factura
   por token. Cada persona usa su propia cuenta en su propia PC.
4. Copiar `repos.example.json` a `repos.json` y cargar los repos de esta PC: nombre, ruta local,
   rama de trabajo y una descripcion corta.
5. `npm run check` para validar la configuracion, y `npm start` para dejarlo corriendo.

El runner aparece como "conectado" en `/taskpilot` mientras esta corriendo.
