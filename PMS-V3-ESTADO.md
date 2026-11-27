# Paradise Resort Viacha — núcleo PMS en desarrollo

Base: main, commit 8bf7f0ac709d20ca7313967f5e25de3a06ab8401.

Este conjunto de archivos es una implementación parcial de la renovación. No es una versión lista para producción. No se ha desplegado ni sustituido ningún archivo del repositorio remoto.

## Incluye

- Registro persistente de empleados, asignación de roles, activación/desactivación, listado de clientes.
- Migración aditiva con los IDs existentes configurados como administración y recepción.
- Habitaciones físicas generadas a partir del inventario de categorías existente.
- Registro de llegada, estancia, consumos por catálogo, liquidación parcial de consumos y salida condicionada a saldo cero.
- Creación automática de tarea de limpieza al finalizar la estancia.
- Envío y revisión manual de referencia QR por los huéspedes; configuración de datos bancarios e imagen de QR proporcionada por el resort.
- Panel de trabajo para los roles internos y sección de estancias en Mi cuenta.
- Resumen imprimible de estancia (no factura fiscal oficial).
- Pruebas automatizadas del dominio y migración sobre una copia sintética de SQLite.

## Antes de desplegar

1. Restablecer permiso de escritura del repositorio y crear una rama de trabajo desde la base indicada.
2. Incorporar los archivos del paquete conservando los demás archivos originales y sus imágenes.
3. Instalar dependencias con npm ci, ejecutar npm test y npm run build, y revisar interfaz en desktop y móvil.
4. Finalizar revocación de permisos entre microservicios: los tokens actuales expiran en dos horas, pero la validación de roles activos debe coordinarse para que las bajas se apliquen inmediatamente.
5. Comprobar que disponibilidad, estados de habitaciones y bloqueos sean consistentes; ampliar la lógica de tarifas/cupos sin afectar el catálogo existente.
6. Revisar cobros históricos y conciliación entre la cuenta de alojamiento y consumos; extender reembolsos y pruebas de montos.
7. Completar módulos de reservas presenciales, modificación de fechas y grupos, inventarios, mantenimiento, gerencia, gastos, catálogo de excursiones y contenido público.
8. Revisar contratos OpenAPI para las nuevas rutas y pruebas de integración y extremo a extremo.
9. Respaldar ambos volúmenes reales de Railway, verificar restauración y migraciones con copias, y solo después integrar y publicar.

El QR debe proceder de una entidad bancaria y no se verifica automáticamente ningún pago. La referencia remitida requiere comprobación humana.
