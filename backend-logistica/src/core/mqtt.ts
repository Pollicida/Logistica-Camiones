import * as mqtt from 'mqtt';

const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const REGION = process.env.REGION_ID || 'LOCAL';

const opcionesConexion: mqtt.IClientOptions = {
    // ID limpio y predecible. Ej: "api_backend_NORTE"
    clientId: `api_backend_${REGION}`,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 2000,
};

export const mqttClient = mqtt.connect(MQTT_URL, opcionesConexion);

export const inicializarMQTT = (): Promise<void> => {
    return new Promise((resolve) => {
        mqttClient.on('connect', () => {
            console.log(`📡 Conexión MQTT establecida en la región ${REGION} -> ${MQTT_URL}`);
            resolve();
        });

        mqttClient.on('error', (err) => {
            console.error(`❌ Error MQTT en región ${REGION}:`, err);
        });

        mqttClient.on('offline', () => {
            console.warn(`⚠️ Cliente MQTT (${REGION}) desconectado. Reconectando...`);
        });
    });
};