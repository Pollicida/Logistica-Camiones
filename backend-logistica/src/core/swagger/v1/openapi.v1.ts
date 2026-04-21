import { OpenApiDocument } from '../version-registry';

export const openapiV1: OpenApiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'API Logística - v1',
        version: '1.0.0',
        description: 'Primera versión estable de la API del backend logístico regional. '
            + 'Incluye el flujo de creación de pedidos (feature Operaciones).'
    },
    servers: [
        { url: '/api/v1', description: 'API v1' }
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        },
        schemas: {
            ItemPedidoDTO: {
                type: 'object',
                required: ['id_producto', 'cantidad'],
                properties: {
                    id_producto: { type: 'string', format: 'uuid' },
                    cantidad: { type: 'integer', minimum: 1 }
                }
            },
            CrearPedidoDTO: {
                type: 'object',
                required: ['id_cliente', 'items'],
                properties: {
                    id_cliente: { type: 'string', format: 'uuid' },
                    descripcion: { type: 'string', nullable: true },
                    items: {
                        type: 'array',
                        minItems: 1,
                        items: { $ref: '#/components/schemas/ItemPedidoDTO' }
                    }
                }
            },
            DetallePedidoView: {
                type: 'object',
                properties: {
                    id_detalle: { type: 'string', format: 'uuid' },
                    id_producto: { type: 'string', format: 'uuid' },
                    cantidad: { type: 'integer' },
                    precio_unitario: { type: 'number' },
                    subtotal: { type: 'number' }
                }
            },
            PedidoView: {
                type: 'object',
                properties: {
                    id_pedido: { type: 'string', format: 'uuid' },
                    id_cliente: { type: 'string', format: 'uuid', nullable: true },
                    total: { type: 'number' },
                    hora_pedido: { type: 'string', format: 'date-time' },
                    descripcion_status: { type: 'string', example: 'CREADO' },
                    descripcion: { type: 'string', nullable: true },
                    id_region: { type: 'string', nullable: true },
                    detalles: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/DetallePedidoView' }
                    },
                    metricas: {
                        type: 'object',
                        properties: {
                            peso_total_kg: { type: 'number' },
                            volumen_total_m3: { type: 'number' }
                        }
                    }
                }
            },
            ErrorResponse: {
                type: 'object',
                properties: {
                    error: {
                        type: 'object',
                        properties: {
                            code: { type: 'string' },
                            message: { type: 'string' },
                            details: { type: 'object', additionalProperties: true, nullable: true }
                        }
                    }
                }
            }
        }
    },
    security: [{ bearerAuth: [] }],
    paths: {
        '/operaciones/pedidos': {
            post: {
                tags: ['Operaciones'],
                summary: 'Crear un pedido',
                description: 'Crea un pedido transaccionalmente: bloquea productos con pessimistic_write, '
                    + 'valida stock, verifica que peso/volumen no excedan la capacidad máxima de la flota regional, '
                    + 'descuenta inventario y persiste Pedido + Detalle_Pedidos.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CrearPedidoDTO' }
                        }
                    }
                },
                responses: {
                    '201': {
                        description: 'Pedido creado',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/PedidoView' } }
                        }
                    },
                    '400': {
                        description: 'Validación o stock insuficiente',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
                        }
                    },
                    '401': {
                        description: 'Token ausente o inválido',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
                        }
                    },
                    '403': {
                        description: 'Rol no autorizado',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
                        }
                    },
                    '404': {
                        description: 'Producto no encontrado',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
                        }
                    },
                    '422': {
                        description: 'El pedido excede la capacidad física de la flota regional',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
                        }
                    }
                }
            }
        }
    }
};
