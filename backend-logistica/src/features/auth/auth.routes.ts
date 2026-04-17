import { Router } from 'express';
import { AuthController } from './controllers/auth.controller';
import { requerirRol } from './middlewares/roles.middleware';

export const authRouter = Router();

// 🔓 Pública: Cualquier empleado puede intentar iniciar sesión
authRouter.post('/login', AuthController.login);

// 🔐 Protegida: SOLO un Administrador puede dar de alta a nuevos usuarios
authRouter.post('/registro', requerirRol(['ADMINISTRADOR']), AuthController.registrar);