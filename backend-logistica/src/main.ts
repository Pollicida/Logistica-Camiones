import 'reflect-metadata';
import { inicializarBaseDeDatos } from './core/database';
import { inicializarMQTT } from './core/mqtt';
import { inicializarServidor } from './core/server';
import { inicializarTelemetria } from './features/telemetria';

async function bootstrap() {
    const region = process.env.REGION_ID || 'LOCAL';
    console.log(`🚀 Arrancando Nodo Logístico - Región: ${region}`);

    try {
        // 1. Conexión a CockroachDB
        await inicializarBaseDeDatos();

        // 2. Conexión a Mosquitto (MQTT)
        await inicializarMQTT();

        // 3. Levantamos Express y Socket.io
        await inicializarServidor();

        // 4. Activar módulos de negocio que dependen de MQTT y WS
        inicializarTelemetria();

        console.log(`🏁 [${region}] Toda la infraestructura core está en línea y operando.`);

    } catch (error) {
        console.error(`💥 [${region}] Error fatal durante el arranque:`, error);
        process.exit(1);
    }
}

bootstrap();