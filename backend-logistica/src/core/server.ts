import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

//Importaciones feature flotilla
import { flotillaRouter } from '../features/flotilla';

//Feature Auth
import { authRouter } from '../features/auth';

// 1. Inicializamos la aplicación de Express
const app = express();

// 2. Creamos un servidor HTTP puro (Socket.io lo necesita para acoplarse)
const server = http.createServer(app);

// 3. Configuramos middlewares básicos
app.use(cors()); // Permite peticiones desde tu frontend (Angular/React/Vue/Flutter Web)
app.use(express.json()); // Permite recibir JSON en los POST requests
app.use('/api/auth', authRouter); //Conexión al módulo de autenticación
app.use('/api/flotilla', flotillaRouter);

// 4. Inicializamos el servidor de WebSockets
export const wsServer = new Server(server, {
    cors: {
        origin: '*', // En producción, aquí pondrías la URL exacta de tu frontend
    }
});

// 5. Endpoint de prueba (Healthcheck)
app.get('/api/health', (req, res) => {
    const region = process.env.REGION_ID || 'LOCAL';
    res.json({
        status: 'UP',
        message: 'Servidor Logístico Operativo',
        region: region,
        timestamp: new Date().toISOString()
    });
});

// 6. Función para arrancar el servidor
export const inicializarServidor = (): Promise<void> => {
    return new Promise((resolve) => {
        const puerto = process.env.PORT || 3000;

        server.listen(puerto, () => {
            console.log(`🌐 Servidor HTTP y WebSockets escuchando en el puerto ${puerto}`);
            resolve();
        });
    });
};