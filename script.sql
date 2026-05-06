-- ============================================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS (Ordenado por dependencias)
-- ============================================================================

-- 0. Activar la extensión espacial
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. CATÁLOGOS INDEPENDIENTES (Sin llaves foráneas externas)
-- ============================================================================
CREATE TABLE Regiones (
    id_region VARCHAR PRIMARY KEY,
    nombre_region VARCHAR NOT NULL
);

CREATE TABLE Tipos_Anomalia (
    id_tipo_anomalia VARCHAR PRIMARY KEY,
    nombre_anomalia VARCHAR NOT NULL,
    gravedad VARCHAR NOT NULL
);

-- ============================================================================
-- 2. ACTORES, ACTIVOS Y RUTEO BASE (Dependen de Regiones)
-- ============================================================================
CREATE TABLE Clientes (
    id_cliente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_cliente VARCHAR NOT NULL,
    direccion VARCHAR NOT NULL,
    ubicacion GEOMETRY(Point, 4326), 
    telefono VARCHAR,
    correo VARCHAR,
    encargado VARCHAR,
    fecha_ingreso DATE NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Conductores (
    id_conductor UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombres VARCHAR NOT NULL,
    apellido_paterno VARCHAR NOT NULL,
    apellido_materno VARCHAR,
    telefono VARCHAR,
    numero_licencia VARCHAR UNIQUE NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_ingreso DATE NOT NULL,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Camiones (
    id_camion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marca VARCHAR NOT NULL,
    modelo VARCHAR NOT NULL,
    numero_de_serie VARCHAR UNIQUE NOT NULL,
    placas VARCHAR UNIQUE NOT NULL,
    capacidad_carga DECIMAL(10,2) NOT NULL,
    capacidad_volumen DECIMAL(10,2),
    temperatura_minima_soportada DECIMAL(5,2) NOT NULL,
    temperatura_maxima_soportada DECIMAL(5,2) NOT NULL,
    fecha_ingreso DATE NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Proveedores (
    id_proveedor UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_proveedor VARCHAR NOT NULL,
    telefono VARCHAR,
    correo VARCHAR,
    activo BOOLEAN DEFAULT TRUE,
    fecha_ingreso DATE NOT NULL,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Rutas (
    id_ruta UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_ruta VARCHAR NOT NULL,
    distancia_km DECIMAL(10,2),
    tiempo_estimado_minutos INTEGER,
    ruta_espacial GEOMETRY(LineString, 4326), 
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Puntos_Ruta (
    id_punto UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_ruta UUID REFERENCES Rutas(id_ruta),
    latitud DECIMAL(10,6) NOT NULL,
    longitud DECIMAL(10,6) NOT NULL,
    ubicacion_punto GEOMETRY(Point, 4326), 
    orden_parada INTEGER NOT NULL
);

-- ============================================================================
-- 3. INVENTARIO (Depende de Proveedores y Regiones)
-- ============================================================================
CREATE TABLE Productos (
    id_producto UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_producto VARCHAR NOT NULL,
    stock INTEGER DEFAULT 0,
    precio_unitario DECIMAL(10,2) NOT NULL,
    peso_kg DECIMAL(8,3) NOT NULL DEFAULT 0,
    volumen_m3 DECIMAL(8,4) NOT NULL DEFAULT 0,
    temperatura_minima DECIMAL(5,2) NOT NULL,
    temperatura_maxima DECIMAL(5,2) NOT NULL,
    id_proveedor UUID REFERENCES Proveedores(id_proveedor),
    activo BOOLEAN DEFAULT TRUE,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. OPERACIONES LOGÍSTICAS (Depende de Actores, Rutas e Inventario)
-- ============================================================================
CREATE TABLE Viajes (
    id_viaje UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conductor UUID REFERENCES Conductores(id_conductor),
    id_camion UUID REFERENCES Camiones(id_camion),
    id_ruta UUID REFERENCES Rutas(id_ruta),
    hora_salida TIMESTAMP,
    hora_llegada TIMESTAMP,
    status VARCHAR NOT NULL,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Pedidos (
    id_pedido UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cliente UUID REFERENCES Clientes(id_cliente),
    total DECIMAL(12,2) NOT NULL,
    hora_pedido TIMESTAMP NOT NULL,
    descripcion_status VARCHAR NOT NULL,
    hora_entrega TIMESTAMP,
    descripcion TEXT,
    id_viaje UUID REFERENCES Viajes(id_viaje),
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Detalle_Pedidos (
    id_detalle UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pedido UUID REFERENCES Pedidos(id_pedido),
    id_producto UUID REFERENCES Productos(id_producto),
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL
);

-- ============================================================================
-- 5. TELEMETRÍA Y EVENTOS (Depende de Viajes, Camiones y Tipos_Anomalia)
-- ============================================================================
CREATE TABLE Telemetria_Camiones (
    id_registro UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_viaje UUID REFERENCES Viajes(id_viaje),
    id_camion UUID REFERENCES Camiones(id_camion),
    ubicacion_actual GEOMETRY(Point, 4326) NOT NULL,
    velocidad_kmh DECIMAL(5,2),
    temperatura_caja DECIMAL(5,2), 
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_telemetria_ubicacion ON Telemetria_Camiones USING GIST (ubicacion_actual);

CREATE TABLE Anomalias (
    id_anomalia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_viaje UUID REFERENCES Viajes(id_viaje),
    id_tipo_anomalia VARCHAR REFERENCES Tipos_Anomalia(id_tipo_anomalia),
    ubicacion_anomalia GEOMETRY(Point, 4326),
    descripcion TEXT,
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_termino TIMESTAMP,
    status VARCHAR NOT NULL,
    id_region VARCHAR REFERENCES Regiones(id_region),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. SEGURIDAD Y USUARIOS (Depende de Conductores)
-- ============================================================================
CREATE TABLE Usuarios (
    id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correo VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    rol VARCHAR NOT NULL,
    id_conductor UUID REFERENCES Conductores(id_conductor),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE Viajes ADD COLUMN numero_guia VARCHAR;

ALTER TABLE Pedidos
    ADD COLUMN prioridad VARCHAR DEFAULT 'NORMAL',
    ADD COLUMN peso_total DECIMAL(10,3) NOT NULL DEFAULT 0,
    ADD COLUMN volumen_total DECIMAL(10,4) NOT NULL DEFAULT 0;
