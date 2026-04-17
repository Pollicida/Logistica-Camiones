import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/auth.service';

// Esto le dice a TypeScript que nuestra Request de Express ahora puede traer un "usuario" pegado
declare global {
    namespace Express {
        interface Request {
            usuario?: TokenPayload;
        }
    }
}

export const requerirRol = (rolesPermitidos: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Buscamos el header: "Authorization: Bearer <token>"
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Acceso denegado: Token no proporcionado' });
            return;
        }

        // Extraemos solo la parte del token
        const token = authHeader.split(' ')[1] as string;

        try {
            // Validamos la firma y la vigencia del token
            const payload = AuthService.validarToken(token);

            // Comparamos el rol del usuario con los roles permitidos en la ruta
            if (!rolesPermitidos.includes(payload.rol)) {
                res.status(403).json({ error: 'Acceso denegado: Privilegios insuficientes' });
                return;
            }

            // Inyectamos los datos del usuario en la petición para que el controlador sepa quién es
            req.usuario = payload;
            next(); // Todo en orden, pasamos al controlador

        } catch (error) {
            res.status(401).json({ error: 'Token inválido o expirado' });
        }
    };
};