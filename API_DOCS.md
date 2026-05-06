Resumen de Funciones y Documentación de API                                                                          
                                                                                                                         Base URL                                                                                                             
                                                                                                                       
  /api/v1/operaciones

  Todos los endpoints requieren autenticación JWT. El rol requerido se indica en cada ruta.

  ---
  Modelo de errores (todas las respuestas de error)

  {
    "error": {
      "code": "NOT_FOUND",
      "message": "Pedido abc no existe",
      "details": {}
    }
  }

  ┌─────────────┬────────────────────┬─────────────────────────────────────────────────────────────┐
  │ Código HTTP │        code        │                            Causa                            │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 400         │ VALIDATION_ERROR   │ Body inválido, UUID malformado, campo faltante              │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 400         │ STOCK_INSUFICIENTE │ Stock insuficiente para un producto                         │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 401         │ UNAUTHORIZED       │ Sin token o token inválido                                  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 403         │ FORBIDDEN          │ Rol incorrecto o cliente/recurso de otra región             │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 404         │ NOT_FOUND          │ Entidad no encontrada                                       │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 409         │ CONFLICT           │ Transición de estado inválida, camión o conductor ya activo │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 422         │ CAPACIDAD_EXCEDIDA │ Peso o volumen excede capacidad del camión/flota            │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────┤
  │ 500         │ INTERNAL_ERROR     │ Error inesperado del servidor                               │
  └─────────────┴────────────────────┴─────────────────────────────────────────────────────────────┘

  ---
  Enumeraciones

  PedidoStatus  : CREADO | EN_COLA | ASIGNADO | EN_RUTA | ENTREGADO
  PedidoPrioridad: NORMAL | ALTA
  ViajeStatus   : CARGANDO | EN_CAMINO | EN_ENTREGA | COMPLETADO | CANCELADO

  Ciclo de vida del pedido:
  EN_COLA → [crear viaje] → ASIGNADO → [iniciar viaje] → EN_RUTA → [confirmar entrega] → ENTREGADO
  Ciclo de vida del viaje:
  CARGANDO → [iniciar] → EN_CAMINO → [completar] → COMPLETADO

  ---
  Pedidos

  POST /pedidos

  Rol: ADMINISTRADOR | OPERADOR | CLIENTE

  Crea un pedido. Descuenta stock, calcula peso/volumen/total y lo deja en EN_COLA automáticamente.

  Request body:
  {
    "id_cliente": "uuid",
    "items": [
      { "id_producto": "uuid", "cantidad": 3 }
    ],
    "descripcion": "Pedido urgente",   // opcional
    "prioridad": "ALTA"                // opcional, default: "NORMAL"
  }

  Validaciones:
  - id_cliente — UUID, debe existir y pertenecer a la región del servidor
  - items — arreglo no vacío; cada id_producto debe existir y tener stock suficiente
  - cantidad — entero > 0
  - El peso total y volumen total del pedido no pueden superar la capacidad máxima de la flota regional

  Response 201:
  {
    "id_pedido": "uuid",
    "id_cliente": "uuid",
    "total": 1500.00,
    "hora_pedido": "2026-04-23T10:00:00.000Z",
    "descripcion_status": "EN_COLA",
    "descripcion": "Pedido urgente",
    "id_region": "NORTE",
    "prioridad": "ALTA",
    "detalles": [
      {
        "id_detalle": "uuid",
        "id_producto": "uuid",
        "cantidad": 3,
        "precio_unitario": 500.00,
        "subtotal": 1500.00
      }
    ],
    "metricas": {
      "peso_total_kg": 45.500,
      "volumen_total_m3": 2.1000
    }
  }

  ---
  GET /pedidos

  Rol: ADMINISTRADOR

  Lista pedidos de la región. Soporta filtro por estado.

  Query params:

  ┌───────────┬──────────────┬──────────────────────────────┐
  │ Parámetro │     Tipo     │         Descripción          │
  ├───────────┼──────────────┼──────────────────────────────┤
  │ status    │ PedidoStatus │ Filtra por estado (opcional) │
  └───────────┴──────────────┴──────────────────────────────┘

  Response 200:
  {
    "total": 12,
    "pedidos": [
      {
        "id_pedido": "uuid",
        "id_cliente": "uuid",
        "total": 1500.00,
        "hora_pedido": "2026-04-23T10:00:00.000Z",
        "descripcion_status": "EN_COLA",
        "id_region": "NORTE",
        "prioridad": "ALTA",
        "peso_total_kg": 45.500,
        "volumen_total_m3": 2.1000
      }
    ]
  }

  ---
  GET /pedidos/:id

  Rol: ADMINISTRADOR

  Detalle completo de un pedido con sus líneas de detalle.

  Params: :id — UUID del pedido

  Response 200: igual al response de POST /pedidos (incluye detalles y metricas)

  ---
  PATCH /pedidos/:id/entregar

  Rol: ADMINISTRADOR

  Confirma manualmente la entrega de un pedido (RF-06). El pedido debe estar en EN_RUTA. Si era el último pendiente del
   viaje, cierra el viaje como COMPLETADO.

  Params: :id — UUID del pedido

  Response 200:
  {
    "id_pedido": "uuid",
    "descripcion_status": "ENTREGADO",
    "hora_entrega": "2026-04-23T14:30:00.000Z",
    "id_viaje": "uuid",
    "viaje_completado": true
  }

  Errores específicos:
  - 409 — pedido no está en EN_RUTA
  - 409 — viaje no está en EN_CAMINO ni EN_ENTREGA
  - 409 — pedido no tiene viaje asignado

  ---
  Cola

  GET /cola

  Rol: ADMINISTRADOR

  Lista todos los pedidos en EN_COLA de la región, ordenados por prioridad (ALTA primero) y luego FIFO por hora_pedido.

  Response 200:
  {
    "total": 5,
    "pedidos": [
      {
        "id_pedido": "uuid",
        "id_cliente": "uuid",
        "nombre_cliente": "Almacén Norte SA",
        "direccion": "Av. Principal 123",
        "latitud": 19.4326,
        "longitud": -99.1332,
        "total": 2500.00,
        "peso_total_kg": 60.000,
        "volumen_total_m3": 3.2000,
        "prioridad": "ALTA",
        "hora_pedido": "2026-04-23T09:00:00.000Z",
        "tiempo_en_cola_segundos": 3600
      }
    ]
  }

  ---
  GET /cola/grupos

  Rol: ADMINISTRADOR

  Devuelve los pedidos EN_COLA agrupados por proximidad geográfica (radio 5 km, máx. 9 pedidos por grupo). Útil para   
  decidir qué pedidos asignar juntos a un viaje.

  Response 200:
  {
    "total_grupos": 2,
    "grupos": [
      {
        "id_grupo": 1,
        "cantidad_pedidos": 3,
        "peso_total_kg": 120.000,
        "volumen_total_m3": 5.4000,
        "total_monetario": 6800.00,
        "pedidos": [ /* PedidoColaView[] */ ]
      }
    ]
  }

  ---
  Asignación

  POST /asignacion/sugerir

  Rol: ADMINISTRADOR

  Dado un grupo de pedidos EN_COLA, devuelve los camiones disponibles con suficiente capacidad, ordenados por distancia
   al centroide de entrega, cada uno emparejado con un conductor disponible sugerido. No persiste nada.

  Request body:
  {
    "id_pedidos": ["uuid", "uuid", "uuid"]
  }

  Validaciones:
  - 1–9 pedidos, todos UUIDs válidos, sin duplicados
  - Todos deben estar en EN_COLA y pertenecer a la región del servidor

  Response 200:
  {
    "pedidos": [
      {
        "id_pedido": "uuid",
        "id_cliente": "uuid",
        "nombre_cliente": "Almacén Centro SA",
        "latitud": 19.4500,
        "longitud": -99.1200,
        "peso_total_kg": 40.000,
        "volumen_total_m3": 1.8000,
        "prioridad": "NORMAL"
      }
    ],
    "totales": {
      "cantidad_pedidos": 3,
      "peso_total_kg": 120.000,
      "volumen_total_m3": 5.4000,
      "centroide": { "latitud": 19.4400, "longitud": -99.1300 }
    },
    "camiones_sugeridos": [
      {
        "id_camion": "uuid",
        "marca": "Kenworth",
        "modelo": "T680",
        "placas": "ABC-123",
        "capacidad_carga_kg": 5000,
        "capacidad_volumen_m3": 40.0,
        "capacidad_carga_disponible_kg": 4880.000,
        "capacidad_volumen_disponible_m3": 34.6000,
        "ubicacion_actual": {
          "latitud": 19.4100,
          "longitud": -99.1500,
          "fecha_registro": "2026-04-23T09:55:00.000Z"
        },
        "distancia_a_centroide_metros": 3821,
        "conductor_sugerido": {
          "id_conductor": "uuid",
          "nombre_completo": "Juan Pérez López",
          "telefono": "+521234567890"
        }
      }
    ]
  }

  ---
  Viajes

  POST /viajes

  Rol: ADMINISTRADOR

  Crea un viaje (RF-04). Asigna pedidos a un camión y conductor, los bloquea con FOR UPDATE para serializar
  concurrencia, y llama al módulo de ruteo (RF-05) de forma asíncrona (falla silenciosa si Google Maps no está
  disponible).

  Request body:
  {
    "id_pedidos": ["uuid", "uuid"],
    "id_camion": "uuid",
    "id_conductor": "uuid"
  }

  Validaciones:
  - id_pedidos: 1–9 UUIDs únicos, todos en EN_COLA, misma región
  - id_camion: debe existir, estar activo, en la región, con capacidad suficiente y sin viaje activo
  - id_conductor: debe existir, estar activo, en la región y sin viaje activo
  - Peso y volumen totales ≤ capacidad del camión

  Response 201:
  {
    "id_viaje": "uuid",
    "numero_guia": "VIAJE-550e8400",
    "status": "CARGANDO",
    "id_camion": "uuid",
    "id_conductor": "uuid",
    "id_ruta": "uuid",
    "hora_salida": null,
    "hora_llegada": null,
    "id_region": "NORTE",
    "fecha_actualizacion": "2026-04-23T10:00:00.000Z",
    "pedidos": [
      {
        "id_pedido": "uuid",
        "id_cliente": "uuid",
        "descripcion_status": "ASIGNADO",
        "prioridad": "NORMAL",
        "peso_total_kg": 60.000,
        "volumen_total_m3": 2.7000
      }
    ],
    "camion": {
      "id_camion": "uuid",
      "marca": "Kenworth",
      "modelo": "T680",
      "placas": "ABC-123",
      "capacidad_carga_kg": 5000,
      "capacidad_volumen_m3": 40.0
    },
    "conductor": {
      "id_conductor": "uuid",
      "nombre_completo": "Juan Pérez López",
      "telefono": "+521234567890"
    }
  }

  ---
  GET /viajes

  Rol: ADMINISTRADOR

  Lista viajes de la región, ordenados por fecha_actualizacion DESC. Retorna vista ligera (sin pedidos/camión/conductor
   embebidos).

  Query params:

  ┌───────────┬─────────────┬──────────────────────────────┐
  │ Parámetro │    Tipo     │         Descripción          │
  ├───────────┼─────────────┼──────────────────────────────┤
  │ status    │ ViajeStatus │ Filtra por estado (opcional) │
  └───────────┴─────────────┴──────────────────────────────┘

  Response 200:
  {
    "viajes": [
      {
        "id_viaje": "uuid",
        "numero_guia": "VIAJE-550e8400",
        "status": "EN_CAMINO",
        "id_camion": "uuid",
        "id_conductor": "uuid",
        "id_ruta": "uuid",
        "hora_salida": "2026-04-23T11:00:00.000Z",
        "hora_llegada": null,
        "id_region": "NORTE",
        "fecha_actualizacion": "2026-04-23T11:00:00.000Z"
      }
    ]
  }

  ---
  GET /viajes/:id

  Rol: ADMINISTRADOR

  Detalle completo de un viaje con pedidos, camión y conductor embebidos.

  Response 200: igual al response de POST /viajes

  ---
  PATCH /viajes/:id/iniciar

  Rol: ADMINISTRADOR | CONDUCTOR

  Transiciona el viaje de CARGANDO → EN_CAMINO. Registra hora_salida y pasa todos los pedidos del viaje a EN_RUTA.     

  Params: :id — UUID del viaje

  Errores específicos:
  - 409 — viaje no está en CARGANDO

  Response 200: detalle completo del viaje actualizado

  ---
  PATCH /viajes/:id/completar

  Rol: ADMINISTRADOR

  Transiciona el viaje de EN_CAMINO o EN_ENTREGA → COMPLETADO. Registra hora_llegada y marca como ENTREGADO todos los  
  pedidos del viaje que aún no lo estuviesen (complementa a PATCH /pedidos/:id/entregar).

  Params: :id — UUID del viaje

  Errores específicos:
  - 409 — viaje no está en EN_CAMINO ni EN_ENTREGA

  Response 200: detalle completo del viaje actualizado

  ---
  GET /viajes/:id/pedidos

  Rol: ADMINISTRADOR

  Lista todos los pedidos de un viaje específico, ordenados por estado y prioridad.

  Params: :id — UUID del viaje

  Response 200:
  {
    "id_viaje": "uuid",
    "total": 3,
    "pedidos": [
      {
        "id_pedido": "uuid",
        "id_cliente": "uuid",
        "descripcion_status": "EN_RUTA",
        "prioridad": "ALTA",
        "peso_total_kg": 45.000,
        "volumen_total_m3": 2.0000
      }
    ]
  }

  ---
  WebSocket — Telemetría y Anomalías (RF-08)

  El módulo de telemetría expone eventos en tiempo real vía Socket.io.

  Suscripción (cliente → servidor)

  ┌──────────────────────┬───────────────────┬───────────────────────────────────────────────────────────┐
  │        Evento        │     Argumento     │                        Descripción                        │
  ├──────────────────────┼───────────────────┼───────────────────────────────────────────────────────────┤
  │ suscribir:telemetria │ —                 │ Recibe actualizaciones de todos los camiones de la región │
  ├──────────────────────┼───────────────────┼───────────────────────────────────────────────────────────┤
  │ suscribir:camion     │ id_camion: string │ Recibe solo las actualizaciones de ese camión             │
  ├──────────────────────┼───────────────────┼───────────────────────────────────────────────────────────┤
  │ desuscribir:camion   │ id_camion: string │ Abandona el canal del camión                              │
  └──────────────────────┴───────────────────┴───────────────────────────────────────────────────────────┘

  Eventos recibidos (servidor → cliente)

  telemetria:update

  Emitido en cada lectura MQTT. Llega a suscribir:telemetria y suscribir:camion.

  {
    "id_camion": "uuid",
    "latitud": 19.5874,
    "longitud": -99.0321,
    "temperatura": 47.8,
    "estatus": true,
    "anomalia": false,
    "fecha": "2026-04-23T10:30:00.000Z",
    "region": "NORTE"
  }

  anomalia:detectada

  Emitido adicionalmente cuando anomalia: true. Llega al canal suscribir:telemetria. El sistema registra la anomalía en
   la tabla anomalias y notifica; no cancela el viaje.

  {
    "id_anomalia": "uuid",
    "id_viaje": "uuid",
    "id_camion": "uuid",
    "latitud": 19.5874,
    "longitud": -99.0321,
    "temperatura": 72.3,
    "fecha": "2026-04-23T10:30:00.000Z",
    "region": "NORTE"
  }

  ---
  MQTT — Telemetría de entrada

  Tópico de escucha: telemetria/camiones/#

  Payload esperado (publicado por el camión):
  {
    "id_camion": "uuid",
    "latitud": 19.5874,
    "longitud": -99.0321,
    "temperatura": 47.8,
    "estatus": true,
    "anomalia": false,
    "fecha": "2026-04-23T10:30:00.000Z"
  }

  ---
  Resumen de todos los métodos de servicio

  PedidoService

  ┌────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │         Método         │                                 Descripción                                 │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ crearPedido(dto)       │ Valida cliente, bloquea inventario, descuenta stock, crea pedido en EN_COLA │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ listarPedidos(filtros) │ Lista pedidos de la región con filtro opcional por status                   │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ obtenerPedido(id)      │ Carga pedido + sus líneas de detalle; 404 si no existe                      │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ confirmarEntrega(id)   │ Marca pedido como ENTREGADO; cierra viaje si era el último pendiente        │
  └────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  ViajeService

  ┌────────────────────────┬───────────────────────────────────────────────────────────────────────┐
  │         Método         │                              Descripción                              │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ crear(dto)             │ Crea viaje con bloqueo pesimista; dispara ruteo asíncrono post-commit │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ iniciar(id)            │ CARGANDO → EN_CAMINO; registra hora_salida; pedidos pasan a EN_RUTA   │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ completar(id)          │ EN_CAMINO/EN_ENTREGA → COMPLETADO; entrega pedidos restantes          │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ obtener(id)            │ Detalle con pedidos, camión y conductor embebidos                     │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ listar(filtros)        │ Lista viajes de la región; sin enriquecer (evita N+1)                 │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────┤
  │ listarPedidosViaje(id) │ Pedidos de un viaje; 404 si el viaje no existe                        │
  └────────────────────────┴───────────────────────────────────────────────────────────────────────┘

  ColaService

  ┌────────────────────────────────┬──────────────────────────────────────────────────────────────────────┐
  │             Método             │                             Descripción                              │
  ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ listarCola()                   │ Pedidos EN_COLA ordenados: ALTA → NORMAL, luego FIFO por hora_pedido │
  ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ listarGruposSugeridos(options) │ Agrupa por proximidad (Haversine, radio 5 km, máx 9 por grupo)       │
  └────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘

  AsignacionService

  ┌──────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐  
  │    Método    │                                           Descripción                                            │  
  ├──────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ sugerir(dto) │ Valida pedidos, calcula centroide, obtiene camiones disponibles con capacidad, ordena por        │  
  │              │ distancia y empareja con conductores                                                             │  
  └──────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘  

  ProcesarTelemetriaUseCase

  ┌───────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐  
  │      Método       │                                         Descripción                                         │  
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ ejecutar(lectura) │ Busca viaje activo del camión → persiste lectura → publica WS → si anomalia=true: registra  │  
  │                   │ en anomalias + emite anomalia:detectada                                                     │  
  └───────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘ 