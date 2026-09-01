import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const mensagem = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    res.status(400).json({ success: false, error: mensagem });
    return;
  }
  if (err instanceof multer.MulterError) {
    const mensagem =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Cada foto deve ter no máximo 15MB.'
        : 'Envie de 2 a 4 fotos.';
    res.status(400).json({ success: false, error: mensagem });
    return;
  }
  console.error('Erro não tratado:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
};
