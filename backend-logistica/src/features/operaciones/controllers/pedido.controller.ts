import { Request, Response } from 'express';
import { validarCrearPedidoDTO } from '../dto/crear-pedido.dto';
import { PedidoService, buildPedidoService } from '../services/pedido.service';
import { ValidationError } from '../../../core/errors/AppError';
import { PedidoStatus } from '../models/pedido.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALIDOS: readonly PedidoStatus[] = ['CREADO', 'EN_COLA', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO'];

export class PedidoController {
    private readonly service: PedidoService;

    constructor(service?: PedidoService) {
        this.service = service ?? buildPedidoService();
    }

    listar = async (req: Request, res: Response): Promise<void> => {
        const statusRaw = req.query['status'];
        const filtros: { status?: PedidoStatus } = {};
        if (statusRaw !== undefined) {
            if (typeof statusRaw !== 'string' || !STATUS_VALIDOS.includes(statusRaw as PedidoStatus)) {
                throw new ValidationError(`status debe ser uno de: ${STATUS_VALIDOS.join(', ')}`);
            }
            filtros.status = statusRaw as PedidoStatus;
        }
        const pedidos = await this.service.listarPedidos(filtros);
        res.status(200).json({ total: pedidos.length, pedidos });
    };

    obtener = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const pedido = await this.service.obtenerPedido(id);
        res.status(200).json(pedido);
    };

    crear = async (req: Request, res: Response): Promise<void> => {
        const dto = validarCrearPedidoDTO(req.body);
        const pedido = await this.service.crearPedido(dto);
        res.status(201).json(pedido);
    };

    confirmarEntrega = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const resultado = await this.service.confirmarEntrega(id);
        res.status(200).json(resultado);
    };

    private parseId(raw: string | string[] | undefined): string {
        if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
            throw new ValidationError('El parámetro :id debe ser un UUID válido');
        }
        return raw;
    }
}
