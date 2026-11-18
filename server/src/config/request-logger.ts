import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customProps: (request) => ({ requestId: request.id }),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url?.split('?')[0],
        remoteAddress: request.socket.remoteAddress,
      };
    },
    res(response) {
      return { statusCode: response.statusCode };
    },
  },
  wrapSerializers: false,
  quietReqLogger: true,
});
