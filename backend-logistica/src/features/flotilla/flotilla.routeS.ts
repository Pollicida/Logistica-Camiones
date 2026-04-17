import { Router } from 'express';

// Importamos los 4 controladores de la feature Flotilla
import { CamionesController } from './controllers/camiones.controller';
import { ConductoresController } from './controllers/conductores.controller';
import { ClientesController } from './controllers/clientes.controller';
import { ProveedoresController } from './controllers/proveedores.controller';

// 🌟 ¡MAGIA DE LA ARQUITECTURA MODULAR! 🌟
// Importamos el "cadenero" directamente desde la fachada del módulo Auth.
import { requerirRol } from '../auth';

export const flotillaRouter = Router();

// ==========================================
// 🚛 RUTAS DE CAMIONES (/camiones)
// ==========================================
// FIX: Prefijo /camiones añadido para evitar que /:id intercepte las rutas de
// los otros recursos (conductores, clientes, proveedores).
flotillaRouter.post('/camiones', requerirRol(['ADMINISTRADOR']), CamionesController.registrarCamion);
flotillaRouter.get('/camiones', requerirRol(['ADMINISTRADOR', 'OPERADOR']), CamionesController.listarCamiones);
flotillaRouter.get('/camiones/:id', requerirRol(['ADMINISTRADOR', 'OPERADOR']), CamionesController.obtenerCamion);
flotillaRouter.put('/camiones/:id', requerirRol(['ADMINISTRADOR']), CamionesController.actualizarCamion);
flotillaRouter.delete('/camiones/:id', requerirRol(['ADMINISTRADOR']), CamionesController.eliminarCamion);

// ==========================================
// 👷 RUTAS DE CONDUCTORES (/conductores)
// ==========================================
flotillaRouter.post('/conductores', requerirRol(['ADMINISTRADOR']), ConductoresController.registrarConductor);
flotillaRouter.get('/conductores', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ConductoresController.listarConductores);
flotillaRouter.get('/conductores/:id', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ConductoresController.obtenerConductor);
flotillaRouter.put('/conductores/:id', requerirRol(['ADMINISTRADOR']), ConductoresController.actualizarConductor);
flotillaRouter.delete('/conductores/:id', requerirRol(['ADMINISTRADOR']), ConductoresController.eliminarConductor);

// ==========================================
// 🏢 RUTAS DE CLIENTES (/clientes)
// ==========================================
flotillaRouter.post('/clientes', requerirRol(['ADMINISTRADOR']), ClientesController.registrarCliente);
flotillaRouter.get('/clientes', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ClientesController.listarClientes);
flotillaRouter.get('/clientes/:id', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ClientesController.obtenerCliente);
flotillaRouter.put('/clientes/:id', requerirRol(['ADMINISTRADOR']), ClientesController.actualizarCliente);
flotillaRouter.delete('/clientes/:id', requerirRol(['ADMINISTRADOR']), ClientesController.eliminarCliente);

// ==========================================
// 📦 RUTAS DE PROVEEDORES (/proveedores)
// ==========================================
flotillaRouter.post('/proveedores', requerirRol(['ADMINISTRADOR']), ProveedoresController.registrarProveedor);
flotillaRouter.get('/proveedores', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ProveedoresController.listarProveedores);
flotillaRouter.get('/proveedores/:id', requerirRol(['ADMINISTRADOR', 'OPERADOR']), ProveedoresController.obtenerProveedor);
flotillaRouter.put('/proveedores/:id', requerirRol(['ADMINISTRADOR']), ProveedoresController.actualizarProveedor);
flotillaRouter.delete('/proveedores/:id', requerirRol(['ADMINISTRADOR']), ProveedoresController.eliminarProveedor);