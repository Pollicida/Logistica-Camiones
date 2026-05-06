import { validarSugerirAsignacionDTO } from './sugerir-asignacion.dto';

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

describe('validarSugerirAsignacionDTO', () => {
    describe('[Camino feliz]', () => {
        it('acepta un arreglo con 1 UUID válido', () => {
            const dto = validarSugerirAsignacionDTO({ id_pedidos: [uuid(1)] });
            expect(dto.id_pedidos).toEqual([uuid(1)]);
        });

        it('acepta hasta 9 UUIDs únicos', () => {
            const ids = Array.from({ length: 9 }, (_, i) => uuid(i + 1));
            const dto = validarSugerirAsignacionDTO({ id_pedidos: ids });
            expect(dto.id_pedidos).toHaveLength(9);
        });
    });

    describe('[Errores]', () => {
        it('rechaza body no objeto', () => {
            expect(() => validarSugerirAsignacionDTO(null)).toThrow('El cuerpo');
        });

        it('rechaza arreglo vacío', () => {
            expect(() => validarSugerirAsignacionDTO({ id_pedidos: [] })).toThrow('no vacío');
        });

        it('rechaza más de 9 elementos', () => {
            const ids = Array.from({ length: 10 }, (_, i) => uuid(i + 1));
            expect(() => validarSugerirAsignacionDTO({ id_pedidos: ids })).toThrow('9 elementos');
        });

        it('rechaza UUID mal formado', () => {
            expect(() => validarSugerirAsignacionDTO({ id_pedidos: ['no-es-uuid'] }))
                .toThrow('UUID válido');
        });

        it('rechaza duplicados', () => {
            expect(() => validarSugerirAsignacionDTO({ id_pedidos: [uuid(1), uuid(1)] }))
                .toThrow('duplicado');
        });

        it('rechaza id_pedidos ausente', () => {
            expect(() => validarSugerirAsignacionDTO({})).toThrow('arreglo no vacío');
        });
    });
});
