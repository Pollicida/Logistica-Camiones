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

// Listeners persistentes (fuera del Promise para que sobrevivan al arranque)
mqttClient.on('error', (err) => {
    console.error(`❌ Error MQTT en región ${REGION}:`, err);
});

mqttClient.on('offline', () => {
    console.warn(`⚠️ Cliente MQTT (${REGION}) desconectado. Reconectando...`);
});

export const inicializarMQTT = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        // FIX: Race condition — el cliente puede conectarse ANTES de que se llame
        // esta función (mientras la BD inicializa). Si ya está conectado, resolvemos.
        if (mqttClient.connected) {
            console.log(`📡 Conexión MQTT ya establecida en la región ${REGION} -> ${MQTT_URL}`);
            return resolve();
        }

        const onConnect = () => {
            console.log(`📡 Conexión MQTT establecida en la región ${REGION} -> ${MQTT_URL}`);
            mqttClient.removeListener('connect', onConnect);
            mqttClient.removeListener('error', onConnectError);
            resolve();
        };

        // Solo capturamos el error de conexión inicial, no los persistentes
        const onConnectError = (err: Error) => {
            mqttClient.removeListener('connect', onConnect);
            mqttClient.removeListener('error', onConnectError);
            reject(err);
        };

        mqttClient.once('connect', onConnect);
        mqttClient.once('error', onConnectError);
    });
};