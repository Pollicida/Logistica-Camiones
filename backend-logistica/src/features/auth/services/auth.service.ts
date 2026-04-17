import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// En producción, este secreto DEBE venir de tu archivo .env y ser súper complejo
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_que_no_se_va_a_usar_solo_sirve_para_que_typescript_se_calle_la_boca';

// ¿Cuánto dura el turno normal de un conductor u operador? 8 a 12 horas.
const JWT_EXPIRES_IN = '12h'; 
const SALT_ROUNDS = 10; // Nivel de dificultad para encriptar (10 es el estándar seguro)

// Definimos exactamente qué información viajará DENTRO del token
export interface TokenPayload {
    id_usuario: string;
    rol: string;
    id_conductor: string | null;
}

export class AuthService {
    
    /**
     * 1. HASH DE CONTRASEÑA (Para cuando registras a un nuevo usuario)
     * Toma "12345" y lo convierte en "$2b$10$Xyz..."
     */
    static async hashearPassword(passwordPlano: string): Promise<string> {
        return await bcrypt.hash(passwordPlano, SALT_ROUNDS);
    }

    /**
     * 2. VERIFICAR CONTRASEÑA (Para el momento del Login)
     * Compara el texto que puso el usuario con el hash raro de CockroachDB
     */
    static async verificarPassword(passwordPlano: string, hashGuardado: string): Promise<boolean> {
        return await bcrypt.compare(passwordPlano, hashGuardado);
    }

    /**
     * 3. GENERAR TOKEN (El boleto de entrada tras un Login exitoso)
     * Firma criptográficamente los datos del usuario.
     */
    static generarToken(payload: TokenPayload): string {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    }

    /**
     * 4. VALIDAR TOKEN (Para el Middleware de tus rutas protegidas)
     * Revisa que el token no haya expirado y que nadie lo haya alterado.
     */
    static validarToken(token: string): TokenPayload {
        try {
            // jwt.verify lanza un error automático si el token caducó o es falso
            const decodificado = jwt.verify(token, JWT_SECRET) as TokenPayload;
            return decodificado;
        } catch (error) {
            throw new Error('Token inválido o expirado');
        }
    }
}