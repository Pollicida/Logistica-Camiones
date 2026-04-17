import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Esta variable de entorno vendrá de tu docker-compose.yml
// ej: postgresql://root@lb_norte:26257/logistica_flotilla?sslmode=disable
const DB_URL = process.env.DATABASE_URL || 'postgresql://root@localhost:26001/logistica_flotilla?sslmode=disable';

export const AppDataSource = new DataSource({
    type: 'cockroachdb',
    url: DB_URL,
    ssl: false, // Falso porque estamos en red interna de Docker con --insecure
    
    // ¡MUY IMPORTANTE! Falso porque tú controlas la BD con tu script SQL manual.
    synchronize: false, 
    
    // True en desarrollo para ver las consultas SQL que genera el ORM en la consola
    logging: process.env.NODE_ENV !== 'production', 
    
    // Aquí le diremos a TypeORM dónde buscar los modelos de tablas de cada feature
    entities: [
        path.join(__dirname, '/../features/**/models/*.entity{.ts,.js}')
    ],
    
    // Requerido por CockroachDB para consultas de viaje en el tiempo
    timeTravelQueries: false,
    
    // Configuraciones extra recomendadas para evitar cuellos de botella
    extra: {
        max: 20, // Conexiones máximas en el Pool
        idleTimeoutMillis: 30000,
    }
});

// Función para inicializar la conexión que llamaremos desde main.ts
export const inicializarBaseDeDatos = async () => {
    try {
        await AppDataSource.initialize();
        console.log('✅ Conexión a CockroachDB establecida con éxito (Vía TypeORM)');
    } catch (error) {
        console.error('❌ Error fatal conectando a CockroachDB:', error);
        process.exit(1); // Detiene el servidor si no hay base de datos
    }
};