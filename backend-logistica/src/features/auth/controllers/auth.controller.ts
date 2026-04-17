import { Request, Response } from 'express';
import { AppDataSource } from '../../../core/database';
import { UsuarioEntity } from '../models/usuario.entity';
import { AuthService } from '../services/auth.service';

export class AuthController {
    
    /**
     * LOGIN: Valida credenciales y devuelve un JWT
     * POST /api/auth/login
     */
    static async login(req: Request, res: Response): Promise<void> {
        try {
            const { correo, password } = req.body;

            // 1. Validamos que manden los datos
            if (!correo || !password) {
                res.status(400).json({ error: 'Correo y password son obligatorios' });
                return;
            }

            // 2. Buscamos al usuario en CockroachDB
            const usuarioRepo = AppDataSource.getRepository(UsuarioEntity);
            const usuario = await usuarioRepo.findOne({ where: { correo, activo: true } });

            if (!usuario) {
                res.status(401).json({ error: 'Credenciales inválidas' });
                return;
            }

            // 3. Verificamos la contraseña con bcrypt
            const passwordValido = await AuthService.verificarPassword(password, usuario.password_hash);
            
            if (!passwordValido) {
                res.status(401).json({ error: 'Credenciales inválidas' });
                return;
            }

            // 4. Si todo es correcto, generamos el Token
            const token = AuthService.generarToken({
                id_usuario: usuario.id_usuario,
                rol: usuario.rol,
                id_conductor: usuario.id_conductor
            });

            // 5. Devolvemos el éxito (¡NUNCA devolvemos el password_hash al frontend!)
            res.json({
                mensaje: 'Login exitoso',
                token: token,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    correo: usuario.correo,
                    rol: usuario.rol,
                    id_conductor: usuario.id_conductor
                }
            });

        } catch (error) {
            console.error('Error en el login:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    /**
     * REGISTRO: Crea un nuevo usuario en la base de datos
     * POST /api/auth/registro
     * NOTA: Más adelante protegeremos esta ruta para que solo los Administradores la usen.
     */
    static async registrar(req: Request, res: Response): Promise<void> {
        try {
            const { correo, password, rol, id_conductor } = req.body;

            // 1. Validaciones básicas
            if (!correo || !password || !rol) {
                res.status(400).json({ error: 'Faltan datos obligatorios (correo, password, rol)' });
                return;
            }

            const usuarioRepo = AppDataSource.getRepository(UsuarioEntity);

            // 2. Revisar que el correo no exista ya
            const existeUsuario = await usuarioRepo.findOne({ where: { correo } });
            if (existeUsuario) {
                res.status(409).json({ error: 'El correo ya está registrado' });
                return;
            }

            // 3. Encriptamos la contraseña antes de guardarla
            const hash = await AuthService.hashearPassword(password);

            // 4. Creamos la entidad y la guardamos
            const nuevoUsuario = usuarioRepo.create({
                correo,
                password_hash: hash,
                rol: rol.toUpperCase(), // Aseguramos que siempre esté en mayúsculas
                id_conductor: id_conductor || null
            });

            await usuarioRepo.save(nuevoUsuario);

            res.status(201).json({
                mensaje: 'Usuario creado exitosamente',
                usuario: {
                    id_usuario: nuevoUsuario.id_usuario,
                    correo: nuevoUsuario.correo,
                    rol: nuevoUsuario.rol
                }
            });

        } catch (error) {
            console.error('Error en el registro:', error);
            res.status(500).json({ error: 'Error interno del servidor al crear usuario' });
        }
    }
}