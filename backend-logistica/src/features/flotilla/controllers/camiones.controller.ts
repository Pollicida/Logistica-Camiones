import { Request, Response } from 'express';
import { AppDataSource } from '../../../core/database';
import { CamionEntity } from '../models/camion.entity';

export class CamionesController {

    // POST /api/flotilla/camiones
    static async registrarCamion(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(CamionEntity);

            // Limpieza de los datos
            const data: any[] = Array.isArray(req.body) ? req.body : [req.body];

            // FIX: Usamos .map() para que TypeORM devuelva estrictamente un arreglo
            let nuevosCamiones = data.map(item => repo.create(item)) as unknown as CamionEntity[];

            // Asignamos la fecha de ingreso
            for (let camion of nuevosCamiones) {
                if (!camion.fecha_ingreso) {
                    camion.fecha_ingreso = new Date();
                }
            }

            await repo.save(nuevosCamiones);

            res.status(201).json({
                mensaje: 'Camión(es) registrado(s) exitosamente',
                camiones: nuevosCamiones
            });

        } catch (error: any) {
            console.error('Error registrando camión:', error);
            if (error.code === '23505') {
                res.status(409).json({ error: 'Las placas o número de serie ya están registrados' });
                return;
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // GET /api/flotilla/camiones
    static async listarCamiones(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(CamionEntity);
            const camiones = await repo.find({ where: { activo: true } });
            res.json(camiones);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo los camiones' });
        }
    }

    // DELETE /api/flotilla/camiones/:id
    static async eliminarCamion(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(CamionEntity);
            const { id } = req.params;
            const camion = await repo.findOne({ where: { id_camion: id as string } });
            if (!camion) {
                res.status(404).json({ error: 'Camión no encontrado' });
                return;
            }
            await repo.remove(camion);
            res.json({ mensaje: 'Camión eliminado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error eliminando el camión' });
        }
    }

    // UPDATE /api/flotilla/camiones/:id
    static async actualizarCamion(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(CamionEntity);
            const { id } = req.params;
            const camion = await repo.findOne({ where: { id_camion: id as string } });
            if (!camion) {
                res.status(404).json({ error: 'Camión no encontrado' });
                return;
            }
            await repo.update(id as string, req.body);
            res.json({ mensaje: 'Camión actualizado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error actualizando el camión' });
        }
    }

    // GET /api/flotilla/camiones/:id
    static async obtenerCamion(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(CamionEntity);
            const { id } = req.params;
            const camion = await repo.findOne({ where: { id_camion: id as string } });
            if (!camion) {
                res.status(404).json({ error: 'Camión no encontrado' });
                return;
            }
            res.json(camion);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo el camión' });
        }
    }
}