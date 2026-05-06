import { Request, Response } from 'express';
import { ValidationError } from '../../../core/errors/AppError';
import { ViajeService, buildViajeService } from '../services/viaje.service';
import { validarCrearViajeDTO } from '../dto/crear-viaje.dto';
import { ViajeStatus } from '../models/viaje.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALIDOS: readonly ViajeStatus[] = [
    'CARGANDO', 'EN_CAMINO', 'EN_ENTREGA', 'COMPLETADO', 'CANCELADO'
];

export class ViajeController {
    private readonly service: ViajeService;

    constructor(service?: ViajeService) {
        this.service = service ?? buildViajeService();
    }

    crear = async (req: Request, res: Response): Promise<void> => {
        const dto = validarCrearViajeDTO(req.body);
        const viaje = await this.service.crear(dto);
        res.status(201).json(viaje);
    };

    listar = async (req: Request, res: Response): Promise<void> => {
        const statusRaw = req.query['status'];
        const filtros: { status?: ViajeStatus } = {};
        if (statusRaw !== undefined) {
            if (typeof statusRaw !== 'string' || !STATUS_VALIDOS.includes(statusRaw as ViajeStatus)) {
                throw new ValidationError(
                    `status debe ser uno de: ${STATUS_VALIDOS.join(', ')}`
                );
            }
            filtros.status = statusRaw as ViajeStatus;
        }
        const viajes = await this.service.listar(filtros);
        res.status(200).json({ viajes });
    };

    obtener = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.obtener(id);
        res.status(200).json(viaje);
    };

    iniciar = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.iniciar(id);
        res.status(200).json(viaje);
    };

    completar = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.completar(id);
        res.status(200).json(viaje);
    };

    listarPedidos = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const pedidos = await this.service.listarPedidosViaje(id);
        res.status(200).json({ id_viaje: id, total: pedidos.length, pedidos });
    };


    //Entregar detalles del pedido.

    // obtenerDetallesViaje = async (req: Request, res: Response): Promise<void> => {
    //     const id = this.parseId(req.params['id']);
    //     const detalles = await this.service.obtenerDetallesViaje(id);
    //     res.status(200).json({ id_viaje: id, total: detalles.length, detalles });
    // };

    private parseId(raw: string | string[] | undefined): string {
        if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
            throw new ValidationError('El parámetro :id debe ser un UUID válido');
        }
        return raw;
    }
}
