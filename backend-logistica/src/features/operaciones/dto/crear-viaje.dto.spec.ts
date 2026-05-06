import { validarCrearViajeDTO } from './crear-viaje.dto';

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

const baseBody = () => ({
    id_pedidos: [uuid(1)],
    id_camion: uuid(100),
    id_conductor: uuid(200)
});

describe('validarCrearViajeDTO', () => {
    describe('[Camino feliz]', () => {
        it('acepta un body con 1 pedido y devuelve el DTO tipado', () => {
            const dto = validarCrearViajeDTO(baseBody());
            expect(dto.id_pedidos).toEqual([uuid(1)]);
            expect(dto.id_camion).toBe(uuid(100));
            expect(dto.id_conductor).toBe(uuid(200));
        });

        it('acepta hasta 9 pedidos únicos', () => {
            const ids = Array.from({ length: 9 }, (_, i) => uuid(i + 1));
            const dto = validarCrearViajeDTO({ ...baseBody(), id_pedidos: ids });
            expect(dto.id_pedidos).toHaveLength(9);
        });
    });

    describe('[Errores]', () => {
        it('rechaza body no objeto', () => {
            expect(() => validarCrearViajeDTO(null)).toThrow('El cuerpo');
        });

        it('rechaza id_pedidos vacío', () => {
            expect(() => validarCrearViajeDTO({ ...baseBody(), id_pedidos: [] }))
                .toThrow('no vacío');
        });

        it('rechaza más de 9 pedidos', () => {
            const ids = Array.from({ length: 10 }, (_, i) => uuid(i + 1));
            expect(() => validarCrearViajeDTO({ ...baseBody(), id_pedidos: ids }))
                .toThrow('9 elementos');
        });

        it('rechaza id_pedidos duplicados', () => {
            expect(() => validarCrearViajeDTO({
                ...baseBody(),
                id_pedidos: [uuid(1), uuid(1)]
            })).toThrow('duplicado');
        });

        it('rechaza pedido con UUID mal formado', () => {
            expect(() => validarCrearViajeDTO({
                ...baseBody(),
                id_pedidos: ['no-es-uuid']
            })).toThrow('UUID válido');
        });

        it('rechaza id_camion ausente', () => {
            const body = baseBody() as Record<string, unknown>;
            delete body['id_camion'];
            expect(() => validarCrearViajeDTO(body)).toThrow('id_camion');
        });

        it('rechaza id_camion que no es UUID', () => {
            expect(() => validarCrearViajeDTO({ ...baseBody(), id_camion: 'abc' }))
                .toThrow('id_camion');
        });

        it('rechaza id_conductor ausente', () => {
            const body = baseBody() as Record<string, unknown>;
            delete body['id_conductor'];
            expect(() => validarCrearViajeDTO(body)).toThrow('id_conductor');
        });

        it('rechaza id_conductor que no es UUID', () => {
            expect(() => validarCrearViajeDTO({ ...baseBody(), id_conductor: 'xyz' }))
                .toThrow('id_conductor');
        });
    });
});
