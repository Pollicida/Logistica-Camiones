import { Request, Response } from 'express';
import { validarCrearPedidoDTO } from '../dto/crear-pedido.dto';
import { PedidoService, buildPedidoService } from '../services/pedido.service';

export class PedidoController {
    private readonly service: PedidoService;

    constructor(service?: PedidoService) {
        this.service = service ?? buildPedidoService();
    }

    crear = async (req: Request, res: Response): Promise<void> => {
        const dto = validarCrearPedidoDTO(req.body);
        const pedido = await this.service.crearPedido(dto);
        res.status(201).json(pedido);
    };
}
