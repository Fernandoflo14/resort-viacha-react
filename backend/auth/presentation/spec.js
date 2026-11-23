import { document, integer, object, ok, operation, ref, string } from '../../shared/openapi.js';

const input = object({ email: string({ format: 'email' }), password: string({ format: 'password', maxLength: 1024 }) });
const user = object({
  id: integer(), email: string({ format: 'email' }), name: string({ maxLength: 60 }),
  description: string({ maxLength: 300 }), profileImage: string(), createdAt: string(),
  role: string({ enum: ['guest', 'staff', 'admin'] }),
});
const auth = ok({ token: string(), user: ref('User') });
const errors = [[400, 'Datos inválidos'], [413, 'Datos demasiado grandes'], [415, 'Se requiere JSON']];
const credentialsErrors = [...errors, [429, 'Demasiados intentos']];
export const spec = document('Resort Viacha · Cuentas', {
  '/register': { post: operation('Crear una cuenta', { input: object({ ...input.properties, password: string({ format: 'password', minLength: 8, maxLength: 128 }) }), status: 201, output: auth, errors: [...credentialsErrors, [409, 'Correo registrado']] }) },
  '/login': { post: operation('Iniciar sesión', { input, output: auth, errors: [...credentialsErrors, [401, 'Credenciales incorrectas']] }) },
  '/profile': {
    get: operation('Leer el perfil', { auth: true, output: ok({ user: ref('User') }), errors: [[404, 'Cuenta no encontrada']] }),
    put: operation('Actualizar los campos enviados', { auth: true, input: { ...object({ name: user.properties.name, description: user.properties.description, profileImage: string({ maxLength: 400000 }) }, []), minProperties: 1 }, output: ok({ user: ref('User') }), errors: [...errors, [404, 'Cuenta no encontrada']] }),
  },
}, { User: user });
