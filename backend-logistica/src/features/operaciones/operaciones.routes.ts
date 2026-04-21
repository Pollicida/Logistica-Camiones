import { Router } from 'express';
import { requerirRol } from '../auth';
import { asyncHandler } from '../../core/errors/errorHandler';
import { PedidoController } from './controllers/pedido.controller';

export const buildOperacionesRouter = (controller: PedidoController = new PedidoController()): Router => {
    const router = Router();

    router.post(
        '/pedidos',
        requerirRol(['ADMINISTRADOR', 'OPERADOR', 'CLIENTE']),
        asyncHandler(controller.crear)
    );

    return router;
};

export const operacionesRouter = buildOperacionesRouter();
