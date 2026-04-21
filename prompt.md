# Requerimiento de Arquitectura y Desarrollo: Módulo Operaciones -> Creación de Pedidos

## 🎯 1. Objetivo y Lógica de Negocio (Domain)
Desarrollar la funcionalidad completa para **realizar un pedido** dentro de la feature **operaciones** de nuestro backend logístico.
* **Responsabilidad Principal:** Tomar el carrito de compras del usuario, asegurar la disponibilidad de inventario, validar que el peso/volumen no exceda la capacidad logística de la región, y registrar el pedido transaccionalmente.
* **Casos de Uso (Use Cases):**
  1. `CrearPedidoUseCase`: 
     * Recibe un DTO con `id_cliente`, y un array de `items` (id_producto y cantidad).
     * **Regla 1 (Transaccionalidad y Bloqueo):** Debe abrir un `QueryRunner` de TypeORM. Al consultar el stock de los productos, debe usar bloqueo pesimista (`pessimistic_write` o `SELECT ... FOR UPDATE`) para evitar condiciones de carrera.
     * **Regla 2 (Límites Físicos):** Debe calcular el peso (`peso_kg`) y volumen (`volumen_m3`) total del pedido. Si supera la capacidad máxima del camión de esa región, abortar transacción y devolver error 422.
     * **Regla 3 (Costos e Inventario):** Calcular el total del pedido, restar el stock de los productos, y guardar el registro en `Pedidos` y `Detalle_Pedidos`. Hacer `commit` a la transacción.

## 🏗️ 2. Patrones de Arquitectura y Diseño (Clean Architecture)
El código debe estructurarse separando estrictamente las responsabilidades:
* **DTOs:** Crea `CrearPedidoDTO` y `ItemPedidoDTO`.
* **Mappers:** Para no devolver la entidad cruda.
* **Capa de Servicios:** Aquí vive el `QueryRunner` y toda la lógica matemática.
* **Inyección de Dependencias:** Facilita el testing.

## 🗄️ 3. Entidad de Base de Datos (TypeORM)
Genera las entidades basadas en el script SQL que se encuentra en el archivo `script.sql`.

## 🛣️ 4. Capa de Presentación (Controladores y Rutas)
* Define la ruta: `POST /api/operaciones/pedidos`.
* Protege la ruta con `requerirRol(['ADMINISTRADOR', 'OPERADOR', 'CLIENTE'])`.
* El Controlador atrapa errores del Servicio y devuelve HTTP 201 (Éxito), 400 (Stock insuficiente) o 422 (Excede capacidad física).

## 🚪 5. Patrón Fachada y Límites del Módulo (Cross-Boundary)
Esta feature pertenece a `src/features/operaciones`. **Prohibido importar entidades de otros módulos.**
* **Consumo Externo:** Para la Regla 2, el Servicio de Operaciones debe llamar a la fachada de Flotilla: `FlotillaFacade.obtenerCapacidadMaximaCamion(id_region)` genera este metodo en la fachada de flotilla y todo el código detrás para que funcione. 
* **Exposición:** Actualiza `src/features/operaciones/index.ts` para exponer las rutas al router principal.

## ✅ 6. Manejo de Errores y Criterios Técnicos
* Se debe hacer manejo funcional de errores con el patrón de manejo de errores de la aplicacion. Si no hay un patrón estandarizado genéralo y aplícalo en toda la aplicación
* TypeScript estricto: Cero uso de `any`.

## 🧪 7. Pruebas Automatizadas (Testing)
Genera el código para las pruebas unitarias y de integración utilizando **Jest** y **Supertest**.
* **Estructura de Archivos:** Crea los archivos `[entidad].service.spec.ts` y `[entidad].controller.spec.ts`.
* **Mocks Requeridos:** 1. Simula el `AppDataSource` y específicamente el comportamiento del `QueryRunner` (`startTransaction`, `commitTransaction`, `rollbackTransaction`, `release`).
* **Casos de Prueba (Test Cases) Obligatorios:**
  1. **[Camino Feliz]:** El pedido se procesa correctamente, se llama al `commitTransaction` y retorna HTTP 201.
  2. **[Regla 1 - Stock]:** Falla porque un producto no tiene inventario suficiente, se llama a `rollbackTransaction` y retorna HTTP 400.
  3. **[Regla 2 - Física]:** Falla porque la suma de `peso_kg` de los productos supera el mock de la capacidad del camión, retorna HTTP 422.
* **Documentación:** Genera la documentación completa de la API utilizando Swagger/OpenAPI (será la primer versión de la documentación) versionala y haz una forma de manejar versiones.