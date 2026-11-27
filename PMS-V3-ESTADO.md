# Paradise Resort Viacha - n�cleo PMS en desarrollo

Base: main, commit 8bf7f0ac709d20ca7313967f5e25de3a06ab8401.

Este conjunto de archivos es una implementaci�n parcial de la renovaci�n. No es una versi�n lista para producci�n. No se ha desplegado ni sustituido ning�n archivo del repositorio remoto.

## Incluye

- Registro persistente de empleados, asignaci�n de roles, activaci�n/desactivaci�n, listado de clientes.
- Migraci�n aditiva con los IDs existentes configurados como administraci�n y recepci�n.
- Habitaciones f�sicas generadas a partir del inventario de categor�as existente.
- Registro de llegada, estancia, consumos por cat�logo, liquidaci�n parcial de consumos y salida condicionada a saldo cero.
- Creaci�n autom�tica de tarea de limpieza al finalizar la estancia.
- Env�o y revisi�n manual de referencia QR por los hu�spedes; configuraci�n de datos bancarios e imagen de QR proporcionada por el resort.
- Panel de trabajo para los roles internos y secci�n de estancias en Mi cuenta.
- Resumen imprimible de estancia (no factura fiscal oficial).
- Pruebas automatizadas del dominio y migraci�n sobre una copia sint�tica de SQLite.

## Antes de desplegar

1. Restablecer permiso de escritura del repositorio y crear una rama de trabajo desde la base indicada.
2. Incorporar los archivos del paquete conservando los dem�s archivos originales y sus im�genes.
3. Instalar dependencias con npm ci, ejecutar npm test y npm run build, y revisar interfaz en desktop y m�vil.
4. Finalizar revocaci�n de permisos entre microservicios: los tokens actuales expiran en dos horas, pero la validaci�n de roles activos debe coordinarse para que las bajas se apliquen inmediatamente.
5. Comprobar que disponibilidad, estados de habitaciones y bloqueos sean consistentes; ampliar la l�gica de tarifas/cupos sin afectar el cat�logo existente.
6. Revisar cobros hist�ricos y conciliaci�n entre la cuenta de alojamiento y consumos; extender reembolsos y pruebas de montos.
7. Completar m�dulos de reservas presenciales, modificaci�n de fechas y grupos, inventarios, mantenimiento, gerencia, gastos, cat�logo de excursiones y contenido p�blico.
8. Revisar contratos OpenAPI para las nuevas rutas y pruebas de integraci�n y extremo a extremo.
9. Respaldar ambos vol�menes reales de Railway, verificar restauraci�n y migraciones con copias, y solo despu�s integrar y publicar.

El QR debe proceder de una entidad bancaria y no se verifica autom�ticamente ning�n pago. La referencia remitida requiere comprobaci�n humana.
