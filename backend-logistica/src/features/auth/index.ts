// 1. Exportamos el Router para que el servidor (Express) pueda exponer los endpoints
export { authRouter } from './auth.routes';

// 2. Exportamos el Middleware para que los módulos de Viajes o Flotilla protejan sus propias rutas
export { requerirRol } from './middlewares/roles.middleware';

// 3. Exportamos los Tipos para que otros módulos sepan qué datos trae el "req.usuario"
export type { TokenPayload } from './services/auth.service';