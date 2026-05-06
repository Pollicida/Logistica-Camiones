jest.mock('https');

import * as https from 'https';
import { EventEmitter } from 'events';
import { RuteoService } from './ruteo.service';

const mockGet = https.get as jest.Mock;

const respondWith = (body: unknown) => {
    mockGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
        const res = new EventEmitter();
        cb(res);
        setImmediate(() => {
            res.emit('data', Buffer.from(JSON.stringify(body)));
            res.emit('end');
        });
        return new EventEmitter();
    });
};

const googleOK = {
    status: 'OK',
    routes: [{
        legs: [
            { distance: { value: 10000 }, duration: { value: 1200 }, end_location: { lat: 19.44, lng: -99.13 } },
            { distance: { value: 15000 }, duration: { value: 1800 }, end_location: { lat: 19.45, lng: -99.14 } }
        ],
        waypoint_order: [0]
    }]
};

const buildDs = (pedidoRows: unknown[] = [], camionRows: unknown[] = []) => ({
    query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM pedidos')) return Promise.resolve(pedidoRows);
        if (sql.includes('FROM telemetria_camiones')) return Promise.resolve(camionRows);
        return Promise.resolve([]);
    })
});

const params = {
    id_viaje: '00000001-0000-0000-0000-000000000000',
    id_region: 'NORTE',
    id_camion: '00000100-0000-0000-0000-000000000000',
    id_pedidos: ['00000010-0000-0000-0000-000000000000', '00000011-0000-0000-0000-000000000000']
};

afterEach(() => jest.clearAllMocks());

describe('RuteoService.calcularYAsignarRuta', () => {
    it('retorna null y no llama a Google Maps cuando no hay API key', async () => {
        const ds = buildDs();
        const service = new RuteoService(ds as never);

        const result = await service.calcularYAsignarRuta(params);

        expect(result).toBeNull();
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('retorna null cuando ningún pedido tiene coordenadas', async () => {
        const ds = buildDs([
            { id_pedido: params.id_pedidos[0], latitud: null, longitud: null },
            { id_pedido: params.id_pedidos[1], latitud: null, longitud: null }
        ]);
        const service = new RuteoService(ds as never, 'FAKE_KEY');

        const result = await service.calcularYAsignarRuta(params);

        expect(result).toBeNull();
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('retorna null cuando Google Maps responde con status != OK', async () => {
        respondWith({ status: 'ZERO_RESULTS', routes: [] });
        const ds = buildDs([
            { id_pedido: params.id_pedidos[0], latitud: '19.4326', longitud: '-99.1332' }
        ]);
        const service = new RuteoService(ds as never, 'FAKE_KEY');

        const result = await service.calcularYAsignarRuta(params);

        expect(result).toBeNull();
    });

    it('persiste ruta y puntos, actualiza viaje y retorna id_ruta UUID', async () => {
        respondWith(googleOK);
        const ds = buildDs(
            [
                { id_pedido: params.id_pedidos[0], latitud: '19.4326', longitud: '-99.1332' },
                { id_pedido: params.id_pedidos[1], latitud: '19.4500', longitud: '-99.1400' }
            ],
            [{ latitud: '19.4200', longitud: '-99.1200' }]
        );
        const service = new RuteoService(ds as never, 'FAKE_KEY');

        const id_ruta = await service.calcularYAsignarRuta(params);

        expect(id_ruta).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

        const calls = (ds.query.mock.calls as [string][]).map(([sql]) => sql.trim());
        expect(calls.some(s => s.includes('INSERT INTO rutas'))).toBe(true);
        expect(calls.some(s => s.includes('INSERT INTO puntos_ruta'))).toBe(true);
        expect(calls.some(s => s.includes('UPDATE viajes'))).toBe(true);
    });

    it('usa el primer punto de entrega como origen cuando el camión no tiene telemetría', async () => {
        respondWith(googleOK);
        const ds = buildDs(
            [{ id_pedido: params.id_pedidos[0], latitud: '19.4326', longitud: '-99.1332' }],
            []
        );
        const service = new RuteoService(ds as never, 'FAKE_KEY');

        const id_ruta = await service.calcularYAsignarRuta(params);

        expect(id_ruta).toBeTruthy();
        expect(mockGet).toHaveBeenCalledTimes(1);
    });
});
