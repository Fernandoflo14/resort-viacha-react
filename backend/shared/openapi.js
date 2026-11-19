const bearer = { bearerAuth: [] };

export function operation(summary, { auth = false, input, output, status = 200, parameters, errors = [] } = {}) {
  const responses = {
    [status]: { description: 'Operación exitosa', content: { 'application/json': { schema: output || ok() } } },
  };
  for (const [code, description] of errors) {
    responses[code] = { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  }
  if (auth) responses[401] = { description: 'Sesión inválida o expirada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  return {
    summary,
    ...(auth ? { security: [bearer] } : {}),
    ...(parameters ? { parameters } : {}),
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: input } } } } : {}),
    responses,
  };
}

export const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
export const string = (details = {}) => ({ type: 'string', ...details });
export const integer = (details = {}) => ({ type: 'integer', ...details });
export const array = (items) => ({ type: 'array', items });
export const ref = (name) => ({ $ref: '#/components/schemas/' + name });
export const ok = (properties = {}) => object({ success: { type: 'boolean', enum: [true] }, ...properties });
export const pathParam = (name, schema) => ({ name, in: 'path', required: true, schema });

export const document = (title, paths, schemas) => ({
  openapi: '3.0.3',
  info: { title, version: '2.0.0' },
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { Error: object({ success: { type: 'boolean', enum: [false] }, message: string() }), ...schemas },
  },
});
