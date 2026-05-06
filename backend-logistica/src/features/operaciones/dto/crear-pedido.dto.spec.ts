import { validarCrearPedidoDTO } from './crear-pedido.dto';

const baseBody = () => ({
    id_cliente: '22222222-2222-2222-2222-222222222222',
    items: [
        { id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 2 }
    ]
});

describe('validarCrearPedidoDTO', () => {
    describe('[Camino feliz]', () => {
        it('acepta un body sin prioridad y no la incluye en el DTO resultante', () => {
            const dto = validarCrearPedidoDTO(baseBody());
            expect(dto.id_cliente).toBe('22222222-2222-2222-2222-222222222222');
            expect(dto.items).toHaveLength(1);
            expect(dto.prioridad).toBeUndefined();
        });

        it('acepta prioridad NORMAL', () => {
            const dto = validarCrearPedidoDTO({ ...baseBody(), prioridad: 'NORMAL' });
            expect(dto.prioridad).toBe('NORMAL');
        });

        it('acepta prioridad ALTA', () => {
            const dto = validarCrearPedidoDTO({ ...baseBody(), prioridad: 'ALTA' });
            expect(dto.prioridad).toBe('ALTA');
        });

        it('acepta descripcion y la propaga al DTO', () => {
            const dto = validarCrearPedidoDTO({ ...baseBody(), descripcion: 'Entrega urgente' });
            expect(dto.descripcion).toBe('Entrega urgente');
        });
    });

    describe('[Errores]', () => {
        it('rechaza body que no es objeto', () => {
            expect(() => validarCrearPedidoDTO(null)).toThrow('El cuerpo');
            expect(() => validarCrearPedidoDTO('string')).toThrow('El cuerpo');
        });

        it('rechaza id_cliente que no es UUID', () => {
            expect(() => validarCrearPedidoDTO({ ...baseBody(), id_cliente: 'abc' })).toThrow('id_cliente');
        });

        it('rechaza items vacío', () => {
            expect(() => validarCrearPedidoDTO({ ...baseBody(), items: [] })).toThrow('items');
        });

        it('rechaza prioridad no permitida', () => {
            expect(() => validarCrearPedidoDTO({ ...baseBody(), prioridad: 'URGENTE' }))
                .toThrow('prioridad');
        });

        it('rechaza prioridad de tipo numérico', () => {
            expect(() => validarCrearPedidoDTO({ ...baseBody(), prioridad: 1 })).toThrow('prioridad');
        });

        it('rechaza descripcion no string', () => {
            expect(() => validarCrearPedidoDTO({ ...baseBody(), descripcion: 123 })).toThrow('descripcion');
        });
    });
});
