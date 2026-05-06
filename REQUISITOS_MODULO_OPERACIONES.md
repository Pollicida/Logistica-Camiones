# REQUISITOS DEL MÓDULO DE OPERACIONES - SISTEMA DE LOGÍSTICA

**Documento de Análisis Completo**  
**Fecha**: 2026-04-21  
**Versión**: 1.0  
**Estado**: Análisis Completado

---

## 📋 TABLA DE CONTENIDOS

1. [Descripción General](#descripción-general)
2. [Arquitectura y Módulos Relacionados](#arquitectura-y-módulos-relacionados)
3. [Flujo General del Pedido](#flujo-general-del-pedido)
4. [Requisitos Funcionales](#requisitos-funcionales)
5. [Modelo de Datos](#modelo-de-datos)
6. [Integraciones](#integraciones)
7. [Requisitos de Validación](#requisitos-de-validación)
8. [Requisitos de Reportes y Dashboards](#requisitos-de-reportes-y-dashboards)
9. [Casos de Uso Detallados](#casos-de-uso-detallados)
10. [Restricciones y Consideraciones](#restricciones-y-consideraciones)

---

## 1. DESCRIPCIÓN GENERAL

El módulo de operaciones es el corazón del sistema logístico. Gestiona el ciclo de vida completo de los pedidos desde su creación hasta su entrega, incluyendo la asignación inteligente a camiones disponibles, cálculo de rutas óptimas y seguimiento en tiempo real.

**Objetivo Principal**: Garantizar que cada pedido llegue a su destino de forma eficiente, maximizando la utilización de camiones y cumpliendo con los tiempos de entrega.

**Scope**:
- Gestión de pedidos
- Asignación de pedidos a viajes
- Cálculo de rutas
- Seguimiento en tiempo real (integración con telemetría)
- Reportes de operaciones

---

## 2. ARQUITECTURA Y MÓDULOS RELACIONADOS

### 2.1 Módulos Internos

```
MÓDULO DE OPERACIONES
├── Gestión de Pedidos (crear, listar, actualizar estado)
├── Gestión de Viajes (crear, asignar pedidos, actualizar estado)
├── Asignación Inteligente (sugerencias de camión disponible)
├── Cálculo de Rutas (integración con Google Maps)
└── Reportes (entregados, pendientes, tasa éxito)
```

### 2.2 Módulos Externos (Integraciones)

| Módulo | Responsabilidad | Información Compartida |
|--------|-----------------|------------------------|
| **Telemetría** | Seguimiento GPS, temperatura, anomalías | Ubicación en tiempo real, temperatura, estado del camión |
| **Ruteo** | Cálculo de rutas óptimas | Ruta con puntos de parada ordenados, distancia, tiempo estimado |
| **Auth** | Autenticación y roles | Validación de usuario (Administrador), permisos |
| **Flotilla** | Información de activos | Disponibilidad de camión, capacidad, ubicación actual |

### 2.3 Infraestructura Multi-región

El sistema opera en **3 regiones independientes**:
- **Región Norte** (Backend independiente)
- **Región Centro** (Backend independiente)
- **Región Sur** (Backend independiente)

Cada región:
- Tiene su propio backend (imagen del mismo código)
- Atiende solo pedidos asignados a esa región
- Comparte base de datos centralizada (CockroachDB cluster)
- Tiene su propio broker MQTT para telemetría

---

## 3. FLUJO GENERAL DEL PEDIDO

### 3.1 Diagrama de Estados

```
┌─────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA DEL PEDIDO             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  CREADO        EN_COLA        ASIGNADO      EN_RUTA    │
│    │              │              │             │        │
│    ├─ Pedido ─────┤ Esperando ───┤ Se asigna  ├──────┤
│    │ registrado   │ camión       │ a viaje    │ Viaje│
│    │              │ disponible   │ específico │ en  │
│    │              │              │            │camino│
│    │              │              │            │      │
│    └──────────────────────────────────────────┴──────┤
│                                                      │
│                                                   ENTREGADO
│                                                   (fin)
│
└─────────────────────────────────────────────────────────┘
```

### 3.2 Descripción Detallada de Estados

| Estado | Descripción | Quién lo Define | Transición a |
|--------|-------------|-----------------|-------------|
| **CREADO** | Pedido acaba de ser creado por el administrador. Aún no entra en cola de asignación. | Sistema | EN_COLA |
| **EN_COLA** | Pedido está esperando ser asignado a un camión disponible. Se agrupa con otros pedidos para encontrar camiones cercanos. | Sistema (automático al crear) | ASIGNADO |
| **ASIGNADO** | Pedido ya tiene un viaje asignado. Está en proceso de empaquetado y carga del camión. | Administrador (al crear viaje) | EN_RUTA |
| **EN_RUTA** | El viaje ha iniciado. El camión está en camino hacia el destino. Telemetría activa. | Sistema (cuando viaje inicia) | ENTREGADO |
| **ENTREGADO** | Pedido llegó a destino. Administrador confirma manualmente la entrega. | Administrador (confirmación manual) | --- |

### 3.3 Estados Paralelos del Viaje

Los viajes tienen su propio ciclo de estados independiente:

| Estado | Descripción | Transición a |
|--------|-------------|-------------|
| **CARGANDO** | Camión está siendo cargado con pedidos. Aún no sale. | EN_CAMINO |
| **EN_CAMINO** | Camión en movimiento hacia primer punto de entrega. | EN_ENTREGA |
| **EN_ENTREGA** | Camión está entregando pedidos en el destino actual. | EN_CAMINO (siguiente) o COMPLETADO |
| **COMPLETADO** | Todos los pedidos del viaje han sido entregados. | --- |
| **CANCELADO** | Viaje fue cancelado por anomalía o decisión del administrador. | --- |

---

## 4. REQUISITOS FUNCIONALES

### 4.1 RF-01: CREACIÓN DE PEDIDO

**Descripción**: El administrador recibe un pedido por teléfono de un cliente registrado y lo ingresa al sistema.

**Actores**: Administrador

**Precondiciones**:
- Cliente ya está registrado en el sistema con su dirección y región asignada
- Productos solicitados existen en la base de datos

**Flujo Principal**:
1. Administrador ingresa información del pedido:
   - Cliente (UUID)
   - Lista de productos con cantidades
   - Descripción adicional (opcional)
   - Prioridad del pedido (NORMAL o ALTA)
   
2. Sistema valida:
   - Cliente existe y está activo
   - Productos existen y están en stock
   - Stock es suficiente para las cantidades solicitadas
   - Dirección de cliente es válida
   - Cliente pertenece a la región del servidor
   
3. Sistema calcula automáticamente:
   - Peso total del pedido (suma de peso_kg de productos)
   - Volumen total del pedido (suma de volumen_m3 de productos)
   - Total (suma de precio_unitario × cantidad)
   
4. Sistema crea el pedido con estado **CREADO**

5. Sistema automáticamente transiciona a estado **EN_COLA**

6. Sistema genera timestamp de `hora_pedido`

**Salida**:
- Pedido creado con ID único (UUID)
- Estado: EN_COLA
- Estructura: `{id_pedido, id_cliente, total, hora_pedido, descripcion_status: 'EN_COLA', descripcion, id_region, peso_total, volumen_total, prioridad}`

**Excepciones**:
- Cliente no existe → Error 404
- Productos insuficientes → Error 400 con detalles
- Cliente en región diferente → Error 403
- Coordenadas de cliente no existen → Error 400

**Notas**:
- Los datos de peso y volumen ya están en la BD (Productos.peso_kg, volumen_m3)
- El cálculo se realiza en tiempo de creación y se almacena para referencia

---

### 4.2 RF-02: GESTIÓN DE COLA DE PEDIDOS

**Descripción**: El sistema mantiene una cola de pedidos EN_COLA ordenados por prioridad y orden de llegada, lista para ser asignados a camiones.

**Actores**: Sistema (automático)

**Requisitos Específicos**:

#### 4.2.1 Ordenamiento de Cola
- **Orden FIFO**: Los pedidos se procesan en orden de creación (hora_pedido)
- **Excepción de Prioridad**: Pedidos con `prioridad = ALTA` se mueven al frente de la cola
- **FIFO entre altas**: Si hay múltiples pedidos ALTA, se aplica FIFO entre ellos

**Algoritmo de Ordenamiento**:
```
1. Separar pedidos por prioridad (ALTA, NORMAL)
2. Dentro de cada grupo, ordenar por hora_pedido ASC
3. Concatenar: [ALTA...] + [NORMAL...]
4. Esta es la cola visible al administrador
```

#### 4.2.2 Agrupamiento Dinámico por Proximidad
- El sistema analiza todos los pedidos EN_COLA
- Agrupa pedidos por proximidad geográfica (análisis en tiempo real de coordenadas)
- Usa columna espacial `Clientes.ubicacion` (GEOMETRY Point)
- Define "cercanos" según criterio: máximo 5 km o similar (a definir)

#### 4.2.3 Información de Cola Disponible
El administrador puede consultar:
- Lista de pedidos EN_COLA ordenados por prioridad
- Agrupamientos sugeridos (por proximidad)
- Peso y volumen total de cada grupo
- Cliente, dirección, y coordenadas

#### 4.2.4 Sin Límite de Tiempo
No hay timeout ni límite de tiempo en cola. Un pedido puede esperar indefinidamente hasta ser asignado.

---

### 4.3 RF-03: SUGERENCIA DE ASIGNACIÓN AUTOMÁTICA

**Descripción**: El sistema sugiere un camión disponible cuando el administrador solicita asignar un grupo de pedidos.

**Actores**: Sistema (automático), Administrador (confirma)

**Flujo**:

1. Administrador selecciona 1 o más pedidos de la cola (agrupación cercana recomendada)

2. Sistema valida:
   - Cada pedido está en estado EN_COLA
   - Número de pedidos ≤ 9 (límite máximo por viaje)
   - Suma de pesos ≤ capacidad_carga del camión
   - Suma de volúmenes ≤ capacidad_volumen del camión
   - Todos los pedidos tienen la misma región

3. Sistema busca camiones disponibles que cumplan:
   - Ubicación actual del camión (desde telemetría o flotilla)
   - Capacidad de carga suficiente (con margen)
   - Capacidad de volumen suficiente (con margen)
   - Estado: DISPONIBLE (sin viaje activo)
   - Region coincide

4. Sistema **sugiere** el camión más óptimo basado en:
   - Proximidad a zona de entregas (distancia mínima)
   - Disponibilidad de conductor
   - Historiale de rendimiento (opcional)

5. Administrador revisa sugerencia y confirma o selecciona otro camión

6. Sistema crea el viaje (ver RF-04)

**Salida**:
- Sugerencia de camión con: id_camion, marca, modelo, ubicación, capacidad actual disponible

**Excepciones**:
- No hay camiones disponibles → Informar al administrador
- Pedidos exceden capacidad → Error 400
- Más de 9 pedidos → Error 400

---

### 4.4 RF-04: CREACIÓN Y GESTIÓN DE VIAJES

**Descripción**: El sistema crea un viaje cuando el administrador confirma la asignación de pedidos a un camión.

**Actores**: Administrador, Sistema

**Flujo Principal - Crear Viaje**:

1. Administrador confirma asignación (pedidos + camión)

2. Sistema crea registro en tabla **Viajes**:
   - `id_viaje`: UUID autogenerado
   - `id_conductor`: Conductor asignado al camión (si está activo)
   - `id_camion`: ID del camión seleccionado
   - `id_ruta`: NULL inicialmente (se calcula en paso 4)
   - `hora_salida`: NULL (se actualiza cuando sale)
   - `hora_llegada`: NULL
   - `status`: 'CARGANDO'
   - `id_region`: Región del servidor
   - `fecha_actualizacion`: CURRENT_TIMESTAMP

3. Sistema actualiza cada pedido:
   - `id_viaje` = id_viaje del viaje creado
   - `descripcion_status` = 'ASIGNADO'
   - `fecha_actualizacion` = CURRENT_TIMESTAMP

4. **Genera número de guía**: `VIAJE-{id_viaje}`
   - Se almacena como referencia para el administrador y conductor

5. Sistema genera orden de rutas (RF-05): Llama al módulo de ruteo

6. Estado del viaje: **CARGANDO** (esperando que se cargue el camión)

**Flujo - Iniciar Viaje**:

1. Conductor confirma que salió con el camión cargado (vía app móvil)

2. Sistema actualiza viaje:
   - `status` = 'EN_CAMINO'
   - `hora_salida` = CURRENT_TIMESTAMP
   - Todos los pedidos pasan a estado 'EN_RUTA'

3. Sistema activa telemetría y WebSocket para seguimiento

**Flujo - Finalizar Entrega**:

1. Administrador marca viaje como completado/entregado

2. Sistema actualiza:
   - `viaje.status` = 'COMPLETADO'
   - `viaje.hora_llegada` = CURRENT_TIMESTAMP
   - `pedido.descripcion_status` = 'ENTREGADO' (para cada pedido)
   - `pedido.hora_entrega` = CURRENT_TIMESTAMP

---

### 4.5 RF-05: CÁLCULO DE RUTAS (MÓDULO RUTEO)

**Descripción**: El sistema calcula la ruta óptima para un viaje usando Google Maps Directions API.

**Actores**: Sistema (automático)

**Requisitos**:

1. **Entrada**:
   - Lista de pedidos del viaje (con coordenadas de cliente)
   - Punto de inicio (depósito o ubicación actual del camión)
   - Múltiples puntos de entrega (uno por cliente/pedido)

2. **Procesamiento**:
   - Llama a Google Maps Directions API
   - Calcula ruta óptima entre puntos (Traveling Salesman Problem aproximado)
   - Retorna:
     - Orden de paradas (array de índices)
     - Distancia total (km)
     - Tiempo estimado total (minutos)
     - Puntos de ruta (coordenadas intermedias)

3. **Almacenamiento**:
   - Crea registro en tabla **Rutas**:
     - `id_ruta`: UUID
     - `nombre_ruta`: `RUTA-VIAJE-{id_viaje}`
     - `distancia_km`: Valor del API
     - `tiempo_estimado_minutos`: Valor del API
     - `ruta_espacial`: GEOMETRY LineString (convertir puntos a LineString)
     - `id_region`: Región del viaje
   
   - Crea registros en **Puntos_Ruta**:
     - Un registro por cada parada
     - `latitud`, `longitud`: Coordenadas
     - `ubicacion_punto`: GEOMETRY Point
     - `orden_parada`: 1, 2, 3, ... (orden secuencial)

4. **Actualiza viaje**:
   - `Viajes.id_ruta` = id_ruta creado

5. **Genera información para conductor**:
   - Envía a conductor puntos de entrega en orden
   - Cada punto incluye: dirección, latitud, longitud, información del cliente

**Notas**:
- Google Maps Directions API puede requerir API key en variables de entorno
- Límites de llamadas a API deben considerarse (usar cache si es posible)
- La ruta se recalcula solo una vez al crear el viaje

---

### 4.6 RF-06: ACTUALIZACIÓN DE ESTADO DE PEDIDO

**Descripción**: El sistema permite al administrador confirmar manualmente la entrega de un pedido.

**Actores**: Administrador

**Flujo**:

1. Administrador marca pedido como ENTREGADO

2. Sistema valida:
   - Pedido está en estado EN_RUTA
   - Viaje del pedido está en estado EN_CAMINO o EN_ENTREGA

3. Sistema actualiza:
   - `Pedidos.descripcion_status` = 'ENTREGADO'
   - `Pedidos.hora_entrega` = CURRENT_TIMESTAMP

4. Sistema verifica si todos los pedidos del viaje están ENTREGADOS
   - Si sí, marca viaje como 'COMPLETADO'
   - Si no, deja viaje en EN_CAMINO

---

### 4.7 RF-07: LISTADO Y CONSULTA DE PEDIDOS

**Descripción**: Endpoints para consultar estado y detalles de pedidos.

**Actores**: Administrador

**Funcionalidades**:

1. **Listar pedidos por estado**:
   - GET `/operaciones/pedidos?status=EN_COLA` → Lista pedidos en cola
   - GET `/operaciones/pedidos?status=EN_RUTA` → Pedidos en ruta
   - GET `/operaciones/pedidos?status=ENTREGADO` → Pedidos entregados

2. **Listar pedidos por viaje**:
   - GET `/operaciones/viajes/{id_viaje}/pedidos` → Todos los pedidos del viaje

3. **Consultar detalles de pedido**:
   - GET `/operaciones/pedidos/{id_pedido}` → Detalles completos

4. **Listar viajes**:
   - GET `/operaciones/viajes?status=CARGANDO` → Viajes en carga
   - GET `/operaciones/viajes?status=EN_CAMINO` → Viajes en camino
   - GET `/operaciones/viajes?status=COMPLETADO` → Viajes completados

---

### 4.8 RF-08: MANEJO DE ANOMALÍAS Y EXCEPCIONES

**Descripción**: Notificación al administrador cuando hay problemas durante un viaje.

**Actores**: Sistema (telemetría), Administrador

**Flujo**:

1. Telemetría detecta anomalía (temperatura, ubicación fuera de ruta, etc.)

2. Sistema registra anomalía en tabla **Anomalias**

3. Sistema **notifica al administrador en plataforma**:
   - ID del viaje afectado
   - Tipo de anomalía
   - Ubicación y timestamp
   - Gravedad

4. Administrador decide acción:
   - Ignorar (si es menor)
   - Contactar conductor (teléfono, fuera del sistema)
   - Cancelar viaje (genera incidente)

5. El sistema NO cancela viajes automáticamente. Solo notifica.

**Nota**: El registro de anomalías ya existe en la BD. Solo se integra aquí con el flujo de operaciones.

---

## 5. MODELO DE DATOS

### 5.1 Entidades Principales

#### Pedidos
```sql
CREATE TABLE Pedidos (
    id_pedido UUID PRIMARY KEY,
    id_cliente UUID REFERENCES Clientes(id_cliente),
    total DECIMAL(12,2) NOT NULL,
    hora_pedido TIMESTAMP NOT NULL,
    descripcion_status VARCHAR NOT NULL, -- 'CREADO', 'EN_COLA', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO'
    hora_entrega TIMESTAMP,
    descripcion TEXT,
    id_viaje UUID REFERENCES Viajes(id_viaje),
    id_region VARCHAR REFERENCES Regiones(id_region),
    prioridad VARCHAR DEFAULT 'NORMAL', -- NUEVO: 'NORMAL' o 'ALTA'
    peso_total DECIMAL(10,3), -- NUEVO: Peso calculado
    volumen_total DECIMAL(10,4), -- NUEVO: Volumen calculado
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Campos nuevos a agregar**:
- `prioridad`: Permite ordenamiento en cola
- `peso_total`: Cálculo automático en creación
- `volumen_total`: Cálculo automático en creación

#### Viajes
```sql
CREATE TABLE Viajes (
    id_viaje UUID PRIMARY KEY,
    id_conductor UUID REFERENCES Conductores(id_conductor),
    id_camion UUID REFERENCES Camiones(id_camion),
    id_ruta UUID REFERENCES Rutas(id_ruta),
    numero_guia VARCHAR, -- NUEVO: 'VIAJE-{id_viaje}'
    hora_salida TIMESTAMP,
    hora_llegada TIMESTAMP,
    status VARCHAR NOT NULL, -- 'CARGANDO', 'EN_CAMINO', 'EN_ENTREGA', 'COMPLETADO', 'CANCELADO'
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Campos nuevos**:
- `numero_guia`: Referencia amigable para administrador y conductor

#### Detalle_Pedidos (Ya existe)
```sql
CREATE TABLE Detalle_Pedidos (
    id_detalle UUID PRIMARY KEY,
    id_pedido UUID REFERENCES Pedidos(id_pedido),
    id_producto UUID REFERENCES Productos(id_producto),
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL
);
```

#### Rutas (Ya existe)
```sql
CREATE TABLE Rutas (
    id_ruta UUID PRIMARY KEY,
    nombre_ruta VARCHAR NOT NULL,
    distancia_km DECIMAL(10,2),
    tiempo_estimado_minutos INTEGER,
    ruta_espacial GEOMETRY(LineString, 4326),
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Puntos_Ruta (Ya existe)
```sql
CREATE TABLE Puntos_Ruta (
    id_punto UUID PRIMARY KEY,
    id_ruta UUID REFERENCES Rutas(id_ruta),
    latitud DECIMAL(10,6) NOT NULL,
    longitud DECIMAL(10,6) NOT NULL,
    ubicacion_punto GEOMETRY(Point, 4326),
    orden_parada INTEGER NOT NULL
);
```

### 5.2 Relaciones y Restricciones

```
┌─────────────┐
│  Clientes   │
├─────────────┤
│ id_cliente  │
│ ubicacion   │ (GEOMETRY Point)
│ id_region   │
└──────┬──────┘
       │ 1:N
       │
┌──────▼─────────┐
│     Pedidos     │
├─────────────────┤
│ id_pedido       │
│ id_cliente ────────► Clientes
│ id_viaje ─────────┐
│ descripcion_status  │
│ peso_total          │
│ volumen_total       │
│ prioridad           │
└─────────────────┘
                   │
                   └──────┬──────────┐
                          │          │
                    ┌─────▼────┐  ┌─▼────────────┐
                    │  Viajes  │  │ Detalle_Ped. │
                    ├──────────┤  ├──────────────┤
                    │id_viaje  │  │ id_detalle   │
                    │id_camion ├──► id_producto
                    │id_ruta   │
                    │status    │
                    └──────────┘
                          │
                    ┌─────▼──────┐
                    │   Rutas    │
                    ├────────────┤
                    │ id_ruta    │
                    │ distancia  │
                    │ tiempo_est │
                    └────────────┘
                          │
                    ┌─────▼──────────┐
                    │ Puntos_Ruta    │
                    ├────────────────┤
                    │ id_punto       │
                    │ orden_parada   │
                    │ ubicacion_punto│
                    └────────────────┘
```

### 5.3 DTOs (Data Transfer Objects)

#### Crear Pedido Request
```json
{
  "id_cliente": "uuid",
  "items": [
    {
      "id_producto": "uuid",
      "cantidad": 5
    }
  ],
  "descripcion": "Pedido urgente",
  "prioridad": "NORMAL" // o "ALTA"
}
```

#### Crear Viaje Request
```json
{
  "id_pedidos": ["uuid", "uuid", ...],
  "id_camion": "uuid",
  "id_conductor": "uuid"
}
```

#### Respuesta Viaje
```json
{
  "id_viaje": "uuid",
  "numero_guia": "VIAJE-{id_viaje}",
  "id_camion": "uuid",
  "id_conductor": "uuid",
  "status": "CARGANDO",
  "pedidos": [
    {
      "id_pedido": "uuid",
      "id_cliente": "uuid",
      "total": 1500.00,
      "peso_total": 50.5,
      "volumen_total": 2.3
    }
  ],
  "ruta": {
    "id_ruta": "uuid",
    "distancia_km": 45.3,
    "tiempo_estimado_minutos": 65,
    "puntos": [
      {
        "orden": 1,
        "latitud": 19.5874,
        "longitud": -99.0321,
        "cliente": "Almacén Central"
      }
    ]
  }
}
```

---

## 6. INTEGRACIONES

### 6.1 Integración con Módulo de Telemetría

**¿Qué se integra?**

El módulo de telemetría envía datos en tiempo real de camiones en ruta:

```json
{
  "id_camion": "uuid",
  "id_viaje": "uuid",
  "latitud": 19.5874,
  "longitud": -99.0321,
  "temperatura": 47.8,
  "estatus": true,
  "anomalia": true,
  "fecha": "2026-04-17T08:30:00.000Z"
}
```

**Cómo se usa en operaciones**:

1. **Actualizar ubicación actual de camión**: Se obtiene la última telemetría para saber dónde está el camión
2. **Detectar anomalías**: Si `anomalia = true`, notificar al administrador
3. **Validar disponibilidad**: Si `estatus = false`, camión no está disponible

**Protocolo**:
- MQTT: Broker específico por región (brokernorte, brokercentro, brokersu)
- WebSocket: Para cliente web del administrador (dashboard)

**Topicos MQTT**:
```
telemetria/{region}/camion/{id_camion}/data
telemetria/{region}/camion/{id_camion}/anomalia
```

### 6.2 Integración con Módulo de Ruteo

**¿Qué se integra?**

El módulo de ruteo calcula rutas óptimas usando Google Maps Directions API.

**Entrada esperada**:
```json
{
  "punto_inicio": {
    "latitud": 19.4326,
    "longitud": -99.1332
  },
  "puntos_entrega": [
    {
      "id_cliente": "uuid",
      "latitud": 19.5874,
      "longitud": -99.0321,
      "nombre": "Almacén Centro"
    },
    {
      "id_cliente": "uuid",
      "latitud": 19.4120,
      "longitud": -99.1600,
      "nombre": "Almacén Sur"
    }
  ]
}
```

**Salida esperada**:
```json
{
  "id_ruta": "uuid",
  "distancia_km": 45.3,
  "tiempo_estimado_minutos": 65,
  "puntos_ruta": [
    {
      "orden": 1,
      "latitud": 19.5874,
      "longitud": -99.0321
    }
  ],
  "ruta_optimizada": "LINESTRING(...)"
}
```

**Llamada desde operaciones**:
```typescript
// En PedidoService.ts o ViajService.ts
const ruta = await ruteoService.calcularRuta({
  puntos: pedidosDelViaje.map(p => ({
    latitud: p.cliente.ubicacion.lat,
    longitud: p.cliente.ubicacion.lng,
    id_cliente: p.id_cliente
  }))
});
```

### 6.3 Integración con Módulo de Autenticación

**¿Qué se integra?**

Validación de que solo usuarios con rol **ADMINISTRADOR** pueden:
- Crear pedidos
- Crear viajes
- Asignar camiones
- Actualizar estado de entrega
- Ver reportes

**Middleware de autenticación**:
```typescript
// Proteger rutas de operaciones
router.post('/operaciones/pedidos', 
  requireAuth, 
  requireRole('ADMINISTRADOR'), 
  pedidoController.crear
);
```

### 6.4 Integración con Módulo de Flotilla

**¿Qué se integra?**

Información de camiones disponibles:
- `Camiones.capacidad_carga`: Límite de peso
- `Camiones.capacidad_volumen`: Límite de volumen
- `Camiones.temperatura_minima_soportada`, `temperatura_maxima_soportada`: Validación de productos

**Disponibilidad de conductor**:
- `Conductores.activo = true`: Conductor disponible
- `Conductores.id_region`: Validar región coincida

---

## 7. REQUISITOS DE VALIDACIÓN

### 7.1 Validaciones en Creación de Pedido

| Campo | Validación | Error |
|-------|-----------|-------|
| `id_cliente` | Debe existir en BD y estar activo | 404 Cliente no encontrado |
| `id_cliente` | Región del cliente = región del servidor | 403 Cliente fuera de región |
| `items` | No puede estar vacío | 400 Pedido sin items |
| `id_producto` | Debe existir en BD | 404 Producto no encontrado |
| `cantidad` | > 0 | 400 Cantidad inválida |
| `cantidad` | stock >= cantidad (por producto) | 400 Stock insuficiente |
| `temperatura_producto` | Dentro de rango de camiones disponibles | Warning (opcional) |

### 7.2 Validaciones en Creación de Viaje

| Campo | Validación | Error |
|-------|-----------|-------|
| `id_pedidos` | No vacío | 400 Sin pedidos |
| `id_pedidos` | Todos en estado EN_COLA | 400 Pedido no en cola |
| `id_pedidos` | Cantidad ≤ 9 | 400 Máximo 9 pedidos por viaje |
| `id_pedidos` | Misma región | 400 Pedidos en diferentes regiones |
| `id_camion` | Debe existir y estar activo | 404 Camión no encontrado |
| Peso total | ≤ `Camion.capacidad_carga` | 400 Excede capacidad de carga |
| Volumen total | ≤ `Camion.capacidad_volumen` | 400 Excede capacidad de volumen |
| `id_conductor` | Debe estar activo | 400 Conductor no disponible |

### 7.3 Validaciones en Actualización de Estado

| Estado Actual | Estado Nuevo | Permitido? |
|---------------|-------------|-----------|
| CREADO | EN_COLA | ✓ (automático) |
| EN_COLA | ASIGNADO | ✓ |
| ASIGNADO | EN_RUTA | ✓ |
| EN_RUTA | ENTREGADO | ✓ |
| ENTREGADO | Cualquiera | ✗ Terminal |
| EN_COLA | ENTREGADO (saltarse) | ✗ No permitido |

---

## 8. REQUISITOS DE REPORTES Y DASHBOARDS

### 8.1 Dashboard del Administrador

**Componente 1: Resumen de Operaciones del Día**
```
┌─────────────────────────────────┐
│ Hoy: {fecha}                    │
├─────────────────────────────────┤
│ Pedidos Creados: 45             │
│ Pedidos Entregados: 38          │
│ Pedidos Pendientes: 7           │
│ Viajes Completados: 8           │
│ Viajes en Ruta: 3               │
│ Tasa de Entrega: 84%            │
│ Ingresos Totales: $12,450.00    │
└─────────────────────────────────┘
```

**Componente 2: Mapa de Ubicación en Tiempo Real**
- Mostrar todos los camiones activos (EN_CAMINO, EN_ENTREGA)
- Icono para cada camión con:
  - ID del viaje
  - Estado
  - Número de pedidos
  - Temperatura actual (si hay anomalía, cambiar color)
  - Última actualización (hace X segundos)

**Componente 3: Cola de Pedidos**
```
┌──────────────────────────────────┐
│ COLA DE ESPERA (7 pedidos)       │
├──────────────────────────────────┤
│ [ALTA] Almacén Centro - $2.5K    │
│ [ALTA] Almacén Sur - $1.8K       │
│ [NORMAL] Almacén Este - $950     │
│ [NORMAL] Almacén Oeste - $1.2K   │
│ ...                              │
└──────────────────────────────────┘
```

**Componente 4: Viajes Activos**
```
┌────────────────────────────────────────┐
│ VIAJE-550e8400-e29b-41d4-a716-...     │
├────────────────────────────────────────┤
│ Camión: TRK-001 (Placa: ABC-123)       │
│ Conductor: Juan Pérez                  │
│ Estado: EN_CAMINO                      │
│ Pedidos: 3/3 cargados                  │
│ Tiempo Estimado: 45 min                │
│ Distancia: 45.3 km                     │
│ Temperatura Caja: 47.8°C ✓             │
│ Última Ubicación: 19.5874, -99.0321   │
│ (Hace 15 segundos)                     │
└────────────────────────────────────────┘
```

### 8.2 Reportes Generables

#### Reporte: Entregados por Día
```
SELECT 
  DATE(p.hora_entrega) as fecha,
  COUNT(*) as cantidad,
  SUM(p.total) as ingresos,
  AVG(v.tiempo_estimado_minutos) as tiempo_promedio
FROM Pedidos p
JOIN Viajes v ON p.id_viaje = v.id_viaje
WHERE p.descripcion_status = 'ENTREGADO'
GROUP BY DATE(p.hora_entrega)
ORDER BY fecha DESC;
```

#### Reporte: Pendientes Actualmente
```
SELECT 
  p.id_pedido,
  p.id_cliente,
  p.hora_pedido,
  p.prioridad,
  p.descripcion_status,
  (NOW() - p.hora_pedido)::interval as tiempo_en_cola
FROM Pedidos p
WHERE p.descripcion_status IN ('EN_COLA', 'ASIGNADO', 'EN_RUTA')
ORDER BY p.prioridad DESC, p.hora_pedido ASC;
```

#### Reporte: Tasa de Entrega por Semana
```
SELECT 
  DATE_TRUNC('week', p.hora_entrega) as semana,
  COUNT(CASE WHEN p.descripcion_status = 'ENTREGADO' THEN 1 END) as entregados,
  COUNT(p.id_pedido) as total,
  ROUND(
    COUNT(CASE WHEN p.descripcion_status = 'ENTREGADO' THEN 1 END)::NUMERIC / 
    COUNT(p.id_pedido) * 100, 2
  ) as tasa_porcentaje
FROM Pedidos p
GROUP BY DATE_TRUNC('week', p.hora_entrega)
ORDER BY semana DESC;
```

#### Reporte: Ingresos por Período
```
SELECT 
  DATE(p.hora_entrega) as fecha,
  SUM(p.total) as ingresos_diarios,
  COUNT(*) as pedidos_entregados
FROM Pedidos p
WHERE p.descripcion_status = 'ENTREGADO'
GROUP BY DATE(p.hora_entrega)
ORDER BY fecha DESC;
```

---

## 9. CASOS DE USO DETALLADOS

### CU-01: Crear Pedido (Flujo Completo)

**Actor Principal**: Administrador

**Precondición**: Administrador autenticado con rol ADMINISTRADOR

**Flujo Normal**:

1. Administrador ingresa: Cliente (almacén), productos y cantidades
2. Sistema valida cliente existe, está en región, y stock disponible
3. Sistema calcula peso_total y volumen_total
4. Sistema crea Pedido con estado CREADO
5. Sistema transiciona automáticamente a EN_COLA
6. Sistema retorna pedido creado con ID y estado EN_COLA
7. Pedido aparece en la cola de espera del dashboard

**Flujo Alternativo - Stock Insuficiente**:

1. En paso 2, stock no es suficiente para algún producto
2. Sistema retorna error 400 con detalles
3. Administrador puede:
   - Reducir cantidad del producto
   - Esperar a entrada de stock
   - Cancelar pedido (no, no se pueden cancelar)

---

### CU-02: Asignar Pedidos a Viaje (Flujo Completo)

**Actor Principal**: Administrador

**Precondición**: 
- Hay pedidos en EN_COLA
- Hay camiones disponibles
- Administrador autenticado

**Flujo Normal**:

1. Administrador abre dashboard y ve cola de pedidos
2. Sistema agrupa pedidos por proximidad y muestra sugerencias
3. Administrador selecciona un grupo de 1-9 pedidos cercanos (ej: Almacén Centro, Sur, Este)
4. Sistema valida cantidad y capacidad
5. Sistema busca camiones disponibles en zona
6. Sistema sugiere camión más cercano/óptimo
7. Administrador revisa sugerencia:
   - Acepta sugerencia ✓
   - O selecciona otro camión manualmente
8. Administrador confirma asignación
9. Sistema crea Viaje:
   - Estado: CARGANDO
   - Genera número de guía VIAJE-{id_viaje}
   - Asigna camión y conductor
10. Sistema llama módulo de ruteo para calcular ruta
11. Sistema crea Rutas y Puntos_Ruta
12. Sistema actualiza cada Pedido:
    - id_viaje = viaje creado
    - descripcion_status = ASIGNADO
13. Sistema retorna información del viaje al administrador
14. Conductor recibe notificación de nuevo viaje asignado (vía app móvil)
15. Conductor ve mapa con ruta y puntos de entrega en orden

**Flujo Alternativo - No hay Camiones Disponibles**:

1. En paso 5, no hay camiones con capacidad suficiente disponibles
2. Sistema notifica: "No hay camiones disponibles para esta asignación"
3. Administrador puede:
   - Esperar a que se libere un camión
   - Reducir pedidos del grupo
   - Asignar parcialmente (algunos pedidos ahora, otros después)

**Flujo Alternativo - Más de 9 Pedidos**:

1. Administrador intenta asignar 10+ pedidos
2. Sistema rechaza: "Máximo 9 pedidos por viaje"
3. Administrador divide en múltiples viajes

---

### CU-03: Iniciar Viaje

**Actor Principal**: Conductor

**Precondición**: 
- Viaje creado y en estado CARGANDO
- Camión cargado con todos los pedidos
- Conductor autenticado

**Flujo Normal**:

1. Conductor abre app móvil
2. Ve viaje asignado en estado CARGANDO
3. Verifica carga completa
4. Presiona botón "INICIAR VIAJE"
5. Sistema actualiza:
   - Viaje.status = EN_CAMINO
   - Viaje.hora_salida = CURRENT_TIMESTAMP
   - Todos los Pedidos.descripcion_status = EN_RUTA
6. Sistema activa telemetría (MQTT)
7. Sistema actualiza dashboard del administrador
8. Conductor ahora ve:
   - Mapa con ruta
   - Puntos de entrega en orden
   - Distancia total, tiempo estimado
   - Información de cada cliente (dirección, nombre, teléfono)

---

### CU-04: Confirmar Entrega

**Actor Principal**: Administrador (manualmente)

**Precondición**:
- Pedido en estado EN_RUTA
- Viaje en movimiento

**Flujo Normal**:

1. Conductor llega al punto de entrega
2. Realiza entrega en almacén destino
3. Administrador recibe confirmación del conductor (vía teléfono, fuera del sistema)
4. Administrador abre dashboard y ve viaje en movimiento
5. Administrador marca pedido como ENTREGADO manualmente
6. Sistema actualiza:
   - Pedido.descripcion_status = ENTREGADO
   - Pedido.hora_entrega = CURRENT_TIMESTAMP
7. Sistema verifica si todos los pedidos del viaje están ENTREGADOS
   - Si sí: Viaje.status = COMPLETADO, Viaje.hora_llegada = CURRENT_TIMESTAMP
   - Si no: Viaje continúa EN_CAMINO hacia siguiente parada
8. Dashboard se actualiza en tiempo real

**Excepciones - Problema en Entrega**:

1. Conductor no puede hacer entrega (almacén cerrado, dirección incorrecta, etc.)
2. Conductor contacta a administrador por teléfono
3. Administrador decide acción (reintentaré más tarde, contactar cliente, etc.)
4. Administrador actualiza descripción del pedido si es necesario
5. Viaje continúa (pedido se marca como entregado cuando se complete la entrega)

---

### CU-05: Ver Anomalía en Ruta

**Actor Principal**: Administrador

**Precondición**:
- Viaje en estado EN_CAMINO
- Telemetría detecta anomalía (temperatura alta, ubicación fuera de zona, etc.)

**Flujo Normal**:

1. Telemetría recibe datos con `anomalia = true`
2. Sistema registra anomalía en tabla Anomalias
3. Sistema envía notificación al administrador en tiempo real (WebSocket/MQTT)
4. Administrador ve alerta en dashboard:
   - Icono del camión cambia color (rojo)
   - Muestra tipo de anomalía (temperatura, ubicación, etc.)
   - Timestamp de detección
5. Administrador puede:
   - Contactar conductor por teléfono para confirmar
   - Esperar siguiente reporte de telemetría
   - Si es grave, decidir parar viaje

6. Conductor continúa su ruta, envía datos normalizados
7. Siguiente telemetría con `anomalia = false`, alerta se resuelve

---

## 10. RESTRICCIONES Y CONSIDERACIONES

### 10.1 Restricciones Funcionales

| Restricción | Razón | Impacto |
|------------|-------|--------|
| **No se pueden cancelar pedidos** | Coordinación previa con almacén | Los pedidos siempre se entregan |
| **Un pedido ≠ múltiples camiones** | Complejidad logística, control | Un pedido cabe entero en un camión |
| **Máximo 9 pedidos/viaje** | Capacidad de manejo del conductor | Límite físico del sistema |
| **Un cliente = una dirección** | Simplificación de coordenadas | No hay entregas en múltiples puntos del cliente |
| **Entregas solo a almacenes** | Coordinación previa | No hay entregas a domicilios |
| **Asignación manual** | Control administrativo | No hay asignación automática (solo sugerencias) |
| **Confirmación manual de entrega** | Verificación humana | No hay confirmación automática por GPS |
| **No hay devoluciones** | Flujo simple | No se procesan devoluciones |

### 10.2 Consideraciones de Rendimiento

1. **Cálculo de proximidad**: 
   - Analiza todos los pedidos EN_COLA
   - Usa PostGIS para consultas espaciales eficientes
   - Cache de resultados podría mejorar rendimiento

2. **Google Maps API**:
   - Llamadas limitadas (cuota)
   - Implementar cache de rutas frecuentes
   - Timeout de 30 segundos máximo

3. **Telemetría en tiempo real**:
   - MQTT es ligero y rápido
   - WebSocket para dashboard del admin
   - Almacenar últimos 7 días de telemetría para análisis

4. **Consultas a BD**:
   - Indexar por estado, región, id_viaje
   - Considerar particionamiento por región

### 10.3 Consideraciones de Seguridad

1. **Autenticación**: Solo ADMINISTRADOR puede:
   - Crear pedidos
   - Asignar camiones
   - Ver dashboard
   - Actualizar estados

2. **Aislamiento de región**: 
   - Cada servidor backend solo procesa su región
   - Validar id_region en todas las consultas

3. **Datos sensibles**:
   - Coordenadas de almacenes (información competitiva)
   - Rutas y horarios de entregas

4. **Validación de entrada**:
   - Sanitizar descripciones de pedidos
   - Validar UUIDs
   - Rango de números (cantidades, pesos)

### 10.4 Consideraciones Operacionales

1. **Horarios de operación**:
   - Sistema 24/7 pero entregas durante horarios específicos
   - Considerar horarios de operación del almacén (opcional, no especificado)

2. **Mantenimiento de viajes**:
   - Limpiar viajes CANCELADOS después de X días
   - Archivar viajes COMPLETADOS después de Y meses

3. **Alertas**:
   - Pedidos en cola > X tiempo (considerar escalar a urgente)
   - Viajes sin movimiento (ubicación estática > 30 min)

4. **Comunicación**:
   - Conductor solo accede vía app móvil (no se especifica cuál)
   - Administrador accede vía web/dashboard
   - Sin integración de SMS (se menciona que coordinación es "fuera del sistema")

---

## 11. MATRIZ DE ENDPOINTS (A IMPLEMENTAR)

### Pedidos

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| POST | `/operaciones/pedidos` | Crear pedido | ADMIN |
| GET | `/operaciones/pedidos` | Listar pedidos (con filtros) | ADMIN |
| GET | `/operaciones/pedidos/:id` | Ver detalles pedido | ADMIN |
| GET | `/operaciones/pedidos/status/:status` | Listar por estado | ADMIN |
| PATCH | `/operaciones/pedidos/:id/status` | Actualizar estado | ADMIN |

### Viajes

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| POST | `/operaciones/viajes` | Crear viaje (asignar pedidos) | ADMIN |
| GET | `/operaciones/viajes` | Listar viajes | ADMIN |
| GET | `/operaciones/viajes/:id` | Ver detalles viaje | ADMIN |
| PATCH | `/operaciones/viajes/:id/status` | Actualizar estado viaje | ADMIN |
| GET | `/operaciones/viajes/:id/ruta` | Ver ruta del viaje | ADMIN |

### Reportes

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/operaciones/reportes/dia` | Resumen del día | ADMIN |
| GET | `/operaciones/reportes/entregados` | Entregados (filtrable por fecha) | ADMIN |
| GET | `/operaciones/reportes/tasa-entrega` | Tasa de entrega | ADMIN |
| GET | `/operaciones/reportes/ingresos` | Ingresos por período | ADMIN |

### Cola de Espera

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/operaciones/cola` | Ver pedidos en cola (ordenados) | ADMIN |
| GET | `/operaciones/cola/grupos` | Ver agrupamientos sugeridos | ADMIN |

---

## 12. GLOSARIO DE TÉRMINOS

| Término | Definición |
|---------|-----------|
| **Pedido** | Solicitud de entrega de productos de un cliente a una dirección específica |
| **Viaje** | Asignación de múltiples pedidos a un camión y conductor para entregarlos en una ruta |
| **Ruta** | Secuencia de puntos de entrega optimizada por Google Maps API |
| **Almacén** | Destino de entrega (cliente), ubicado en coordenadas específicas |
| **Telemetría** | Datos en tiempo real del camión (ubicación, temperatura, anomalías) |
| **Número de Guía** | Identificador amigable del viaje formato VIAJE-{id_viaje} |
| **Estado** | Etapa del ciclo de vida (pedido o viaje) |
| **Anomalía** | Evento inesperado durante la ruta (temperatura alta, desviación, etc.) |
| **Proximidad** | Distancia geográfica entre dos puntos (medida en km, < 5 km = cercano) |
| **Capacidad** | Límite de peso o volumen que puede transportar un camión |
| **Prioridad** | Nivel de urgencia del pedido (NORMAL o ALTA) |
| **FIFO** | First In, First Out - Orden de procesamiento por antigüedad |

---

## 13. DOCUMENTOS DE REFERENCIA

- `script.sql`: Modelo de datos actual
- `docker-compose.yml`: Infraestructura multi-región
- Módulo de Telemetría: `backend-logistica/src/features/telemetria/`
- Módulo de Ruteo: `backend-logistica/src/features/ruteo/` (por implementar)
- Módulo de Autenticación: `backend-logistica/src/features/auth/`
- Módulo de Flotilla: `backend-logistica/src/features/flotilla/`

---

**FIN DEL DOCUMENTO**

**Próximos Pasos**:
1. ✓ Análisis completo de requisitos (este documento)
2. ⏳ Diseño de servicios y controladores
3. ⏳ Implementación de funcionalidades por RF (RF-01 a RF-08)
4. ⏳ Pruebas unitarias e integración
5. ⏳ Deployment a desarrollo
