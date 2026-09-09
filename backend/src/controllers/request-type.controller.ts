import type { Request, Response } from 'express';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';

export function createRequestTypeController(repo: RequestTypeRepository) {
  return {
    async listar(_req: Request, res: Response) {
      const tipos = await repo.listActive();
      res.json({ success: true, data: tipos });
    },
  };
}
