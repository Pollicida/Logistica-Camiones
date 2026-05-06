import { Router } from 'express';
import { requerirRol } from '../auth';
import { asyncHandler } from '../../core/errors/errorHandler';
import { PedidoController } from './controllers/pedido.controller';
import { ColaController } from './controllers/cola.controller';
import { AsignacionController } from './controllers/asignacion.controller';
import { ViajeController } from './controllers/viaje.controller';

export const buildOperacionesRouter = (
    pedidoController: PedidoController = new PedidoController(),
    colaController: ColaController = new ColaController(),
    asignacionController: AsignacionController = new AsignacionController(),
    viajeController: ViajeController = new ViajeController()
): Router => {
    const router = Router();

    // RF-07: listado y consulta de pedidos
    router.get(
        '/pedidos',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(pedidoController.listar)
    );
    router.get(
        '/pedidos/:id',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(pedidoController.obtener)
    );

    router.post(
        '/pedidos',
        requerirRol(['ADMINISTRADOR', 'OPERADOR', 'CLIENTE']),
        asyncHandler(pedidoController.crear)
    );

    // RF-06: confirmacion manual de entrega de un pedido
    router.patch(
        '/pedidos/:id/entregar',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(pedidoController.confirmarEntrega)
    );

    // RF-02: gestion de cola (solo ADMINISTRADOR puede consultar)
    router.get(
        '/cola',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(colaController.listar)
    );

    router.get(
        '/cola/grupos',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(colaController.listarGrupos)
    );

    // RF-03: sugerencia de asignacion (camion + conductor) para un grupo de pedidos
    router.post(
        '/asignacion/sugerir',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(asignacionController.sugerir)
    );

    // RF-04: creacion y gestion de viajes
    router.post(
        '/viajes',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(viajeController.crear)
    );
    router.get(
        '/viajes',
        requerirRol(['ADMINISTRADOR', 'OPERADOR']),
        asyncHandler(viajeController.listar)
    );
    router.get(
        '/viajes/:id',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(viajeController.obtener)
    );
    router.patch(
        '/viajes/:id/iniciar',
        requerirRol(['ADMINISTRADOR', 'CONDUCTOR']),
        asyncHandler(viajeController.iniciar)
    );
    router.patch(
        '/viajes/:id/completar',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(viajeController.completar)
    );

    // RF-07: pedidos de un viaje especifico
    router.get(
        '/viajes/:id/pedidos',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(viajeController.listarPedidos)
    );

    // SIMULACION: arranca el script Python de telemetria para un viaje
    router.post(
        '/viajes/:id/simular',
        requerirRol(['ADMINISTRADOR']),
        asyncHandler(viajeController.simular)
    );

    return router;
};

export const operacionesRouter = buildOperacionesRouter();
