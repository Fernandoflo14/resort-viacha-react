# Paradise Resort · Viacha

Sitio para conocer el resort, consultar tarifas y disponibilidad, reservar habitaciones y gestionar la cuenta. La interfaz usa React y conserva las fotos, la guía turística, el calendario y las tres categorías de alojamiento del [proyecto original](https://github.com/kimbafox/RESORT-VIACHA).

## Iniciar con Docker

Se requiere Docker Desktop o Docker Engine con Compose. En la carpeta que contiene `docker-compose.yml`, crea `.env` la primera vez. Con Node.js instalado, puedes generarlo en PowerShell así:

```powershell
$clave = node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
Set-Content -Path .env -Value "JWT_SECRET=$clave" -Encoding ascii
docker compose up --build -d
docker compose ps
```

Con Bash:

```bash
node -e "console.log('JWT_SECRET='+require('node:crypto').randomBytes(48).toString('hex'))" > .env
docker compose up --build -d
docker compose ps
```

Abre [la web del resort](http://localhost:3000). Los servicios de cuentas y reservas solo se exponen dentro de la red de Compose. El frontend publica sus rutas bajo el mismo origen.

| Recurso | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Swagger de cuentas | http://localhost:3000/api/auth/api-docs |
| Swagger de reservas | http://localhost:3000/api/booking/api-docs |
| OpenAPI de cuentas | http://localhost:3000/api/auth/openapi.json |
| OpenAPI de reservas | http://localhost:3000/api/booking/openapi.json |

Para ensayar Swagger, registra un usuario con `POST /register` en Cuentas. Copia el campo `token` y pégalo en **Authorize** para probar el perfil. El mismo token autoriza tus operaciones de reserva en el Swagger de Reservas.

`docker compose down` detiene la aplicación y conserva los volúmenes `auth_data` y `reservas_data`. Conserva el valor de `JWT_SECRET` al volver a levantar el proyecto. Cambiarlo invalida los tokens emitidos. La opción `down -v` borra ambas bases de datos.

## Arquitectura

| Componente | Responsabilidad | Persistencia |
| --- | --- | --- |
| Frontend React y Vite | Inicio, catálogo, calendario, mapa de la guía, formularios, perfil y reservas | JWT en la sesión de la pestaña |
| Microservicio de cuentas · Node.js | Registro, inicio de sesión, emisión de JWT y edición de perfil | SQLite `auth.sqlite` en el volumen `auth_data` |
| Microservicio de reservas · Node.js | Tarifas, disponibilidad, confirmación, historial y cancelación | SQLite `reservas.sqlite` en el volumen `reservas_data` |

Cada servicio tiene un punto de entrada HTTP, validación y lógica de negocio, un repositorio SQLite y su descripción OpenAPI. El servicio de reservas identifica al huésped mediante el JWT emitido por Cuentas. El token vence tras dos horas y el servidor comprueba su firma, emisor y audiencia. El historial y las cancelaciones se limitan a la cuenta autenticada.

Las contraseñas nuevas se guardan como hash scrypt. Se admiten los hashes bcrypt de las cuentas anteriores. La base de cuentas impone la unicidad del correo. La base de reservas comprueba el cupo y registra cada solicitud en una transacción. La clave de idempotencia agrupa reintentos de una misma reserva.

Las fechas se validan en la zona `America/La_Paz`. El precio se calcula en el backend. El pago se hace en recepción y el personal registra el cobro o la devolución después de verificar el comprobante. Las rutas turísticas dependen de OpenStreetMap y OSRM para mostrar mapas y calcular trayectos.

## Importar datos existentes

1. Obtén un respaldo consistente de la base SQLite original. Si la aplicación anterior usa WAL, crea el respaldo con `VACUUM INTO` o con la función de copia de SQLite mientras siga accesible.
2. Guarda el respaldo como `backups/resort.sqlite`. Configura `.env` y asegúrate de que los volúmenes de destino estén vacíos.
3. Ejecuta la migración antes de habilitar el registro y las reservas de esta versión:

```bash
docker compose stop
docker compose --profile migracion run --rm --build migracion
docker compose up --build -d
```

La migración lee el respaldo en modo de solo lectura y conserva IDs, contraseñas, perfiles y reservas. Los huéspedes deberán iniciar sesión de nuevo con su contraseña habitual. La migración se detiene si alguno de los dos destinos ya contiene datos.

También puedes migrar localmente con `npm run migrate -- backups/resort.sqlite`. Por defecto, las bases nuevas quedan en `data/`. Las variables `AUTH_DB` y `RESERVATIONS_DB` permiten elegir otro destino.

## Desarrollo y pruebas

Requisito local de Node.js 24.11 o superior. Configura `.env` y ejecuta `npm install`. En terminales separadas:

```bash
node --env-file=.env backend/auth/server.js
node --env-file=.env backend/reservations/server.js
npm run dev
```

Vite muestra la dirección del sitio en la terminal. Para ejecutar la versión compilada con las dos API activas, ejecuta `npm run build` y luego `npm start`.

La suite se ejecuta con `npm test`. Cubre el registro concurrente, la sesión JWT, el guardado de perfil y foto, la persistencia en SQLite, las reservas simultáneas, los reintentos, las cancelaciones, la migración y los contratos OpenAPI.

## Repositorio y despliegue

El repositorio de esta instalación es [Fernandoflo14/resort-viacha-react](https://github.com/Fernandoflo14/resort-viacha-react). Prepara cambios en una rama separada y prueba la actualización antes de fusionar a `main`. El proyecto que ya está en Railway usa `valiant-presence` para cuentas, `pretty-wonder` para reservas y `faithful-heart` para el frontend.

## Publicar en Railway

Prueba primero en un entorno de Railway separado del sitio público. Configura los tres servicios en el mismo proyecto y entorno, y conecta cada uno al repositorio, a la raíz del proyecto y a la rama que quieras probar.

| Servicio | Dockerfile | Start Command | Volumen |
| --- | --- | --- | --- |
| `auth` | `Dockerfile.backend` | `node backend/auth/server.js` | `/data` |
| `reservas` | `Dockerfile.backend` | `node backend/reservations/server.js` | `/data` |
| Frontend | `Dockerfile` de la raíz | Deja el valor predeterminado de la imagen | Ninguno para el entorno de prueba |

En **Variables** fija `RAILWAY_DOCKERFILE_PATH=Dockerfile.backend` en los dos microservicios. Copia también estos valores en el servicio correspondiente.

| Servicio | Variables |
| --- | --- |
| `auth` | `PORT=3001`, `HOST=::`, `AUTH_DB=/data/auth.sqlite`, `RAILWAY_RUN_UID=0` y `JWT_SECRET` |
| `reservas` | `PORT=3002`, `HOST=::`, `RESERVATIONS_DB=/data/reservas.sqlite`, `RAILWAY_RUN_UID=0` y el mismo `JWT_SECRET` |
| Frontend | `PORT=3000`, `AUTH_URL=http://${{auth.RAILWAY_PRIVATE_DOMAIN}}:3001`, `RESERVATIONS_URL=http://${{reservas.RAILWAY_PRIVATE_DOMAIN}}:3002` |

Para instalaciones nuevas la tabla usa los nombres `auth` y `reservas`. En tu proyecto actual las referencias usan `valiant-presence` y `pretty-wonder`. Guarda `JWT_SECRET` en Railway. Los dos volúmenes son independientes y Railway documenta el ajuste `RAILWAY_RUN_UID=0` para sus permisos. [Variables y red privada de Railway](https://docs.railway.com/networking/domains/working-with-domains) · [Volúmenes](https://docs.railway.com/volumes)

Configura `/health` como ruta de comprobación en los tres servicios. Habilita un dominio público solo para el frontend, con puerto de destino 3000. Prueba el registro, la edición de perfil, la reserva y sus APIs de Swagger. [Comprobaciones de salud de Railway](https://docs.railway.com/deployments/healthchecks)

### Pasar a producción

1. Revisa los **Deploy Logs** del servicio público si Railway devuelve `502 Application failed to respond`. Comprueba que arranque y que el puerto del dominio coincida con el puerto en que escucha. El estado público por sí solo no identifica la causa. [Diagnóstico de errores 502](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond)
2. Si hay cuentas o reservas reales, conserva un respaldo del volumen anterior y genera una copia consistente de `/data/resort.sqlite`. Pausa las escrituras del sitio antiguo durante la copia final. Descarga la copia y ejecuta `npm run migrate -- backups/resort.sqlite` en un directorio local de trabajo limpio. El script crea `data/auth.sqlite` y `data/reservas.sqlite`.
3. Sube esas dos bases a sus respectivos volúmenes, con los nombres `auth.sqlite` y `reservas.sqlite`. Para que Railway mantenga disponible el acceso al volumen durante la carga sin reemplazar una base abierta, inicia los servicios privados con rutas SQLite provisionales distintas. Después de subir los archivos, apunta `AUTH_DB` y `RESERVATIONS_DB` a los archivos migrados y vuelve a desplegar. Conserva la copia original fuera de GitHub. [Acceso a archivos de volúmenes](https://docs.railway.com/volumes)
4. Cuando las dos API estén sanas y los datos estén verificados, configura el servicio que ya posee el dominio público como **Frontend** con las variables de la tabla y la rama de la versión nueva. Revisa que use el Dockerfile raíz, el puerto 3000 y el comando de inicio de la imagen. Conserva el volumen anterior durante la transición. Una vez revisado el cambio, puedes fusionar el PR y vincular los tres servicios de producción a `main`.


## Experiencias, recepción y administración

- El huésped puede reservar habitaciones y experiencias desde la web, consultar el cupo por turno y ver el estado del pago en **Mi cuenta**. La cancelación libera el cupo y anula un saldo pendiente. Si el importe se había cobrado, crea una devolución pendiente.
- **Recepción** consulta el historial por fecha de entrada o actividad y registra cobros y devoluciones ya realizados. La referencia del comprobante queda ligada al actor y al movimiento. El mismo comprobante no se puede registrar dos veces.
- **Administración** dispone de las funciones de recepción y puede descargar el informe en PDF. El informe separa cobros verificados, pendientes, devoluciones y reservas canceladas. Los registros importados antes de esta versión figuran como históricos y sus importes no cuentan en los cobros verificados.
- El resort debe sustituir las tarifas, los cupos, las fotos referenciales y los horarios de ejemplo antes de usar las nuevas ofertas comercialmente. Los catálogos están en `backend/reservations/domain/rooms.js` y `backend/reservations/domain/experiences.js`. Las rutas de la guía son informativas. Charquini y Tiwanaku tienen además turnos que se pueden reservar en Experiencias.

### Dar acceso al personal

1. Registra primero las cuentas autorizadas. Consigue el `id` de cada cuenta en **Mi perfil** o en la respuesta de `GET /api/auth/profile`.
2. En Railway abre las variables del microservicio de **cuentas**. Define `ADMIN_USER_IDS` con los IDs de los administradores y `STAFF_USER_IDS` con los IDs de recepción. Usa comas si son varios. Los IDs corresponden a cuentas ya verificadas por el operador de esa instalación.
3. Despliega cuentas. Cada persona debe cerrar sesión e iniciar nuevamente para recibir su rol. En **Mi cuenta** aparecerá el acceso correspondiente. Un token emitido conserva el rol hasta expirar, con un máximo de dos horas. Para revocar todas las sesiones inmediatamente, cambia el secreto JWT en los dos microservicios.
4. Para Docker Compose local, fija estas mismas dos variables en `.env`. Sus valores predeterminados están vacíos.

### Actualización de la versión desplegada

Conserva ambos volúmenes SQLite y guarda un respaldo antes de aplicar esta actualización. En la primera puesta en marcha, reservas amplía el catálogo compatible y crea las tablas de experiencias, pagos y movimientos. El cambio conserva los IDs, las reservas anteriores y sus claves de idempotencia. Los servicios siguen usando los mismos puertos, rutas de salud y referencias entre servicios. Si necesitas volver a la versión anterior tras habilitar nuevas operaciones, prueba la reversión con copias de los volúmenes.

El sistema registra operaciones verificadas en recepción. Para cobrar en línea se requiere configurar una pasarela, su cuenta comercial, webhooks autenticados y flujos de confirmación y devolución. Esta versión no recopila números de tarjeta ni declara pagado un importe por elegir un método en la web.

El backend conserva dos servicios con composición en `app.js`, modelos y validaciones en `domain`, casos de uso en `application`, SQLite y exportación en `infrastructure`, y adaptadores de operaciones y contratos OpenAPI en `presentation`. La lógica de reservas y pagos calcula importes y verifica cupos en el servidor.
