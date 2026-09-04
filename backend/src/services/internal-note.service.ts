import { Prisma } from '@prisma/client';
import type { InternalNoteRepository, InternalNoteItem } from '../repositories/internal-note.repository.js';
import type { RequestRepository } from '../repositories/request.repository.js';

function isRegistroNaoEncontrado(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

export type CriarObservacaoResultado =
  | { status: 'ok'; observacao: InternalNoteItem }
  | { status: 'nao_encontrada' };

export type ListarObservacoesResultado =
  | { status: 'ok'; observacoes: InternalNoteItem[] }
  | { status: 'nao_encontrada' };

export type EditarObservacaoResultado =
  | { status: 'ok'; observacao: InternalNoteItem }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type ApagarObservacaoResultado =
  | { status: 'ok' }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export class InternalNoteService {
  private internalNoteRepo: InternalNoteRepository;
  private requestRepo: RequestRepository;

  constructor(deps: { internalNoteRepo: InternalNoteRepository; requestRepo: RequestRepository }) {
    this.internalNoteRepo = deps.internalNoteRepo;
    this.requestRepo = deps.requestRepo;
  }

  async criar(requestId: string, autorId: string, texto: string): Promise<CriarObservacaoResultado> {
    const demanda = await this.requestRepo.findById(requestId);
    if (!demanda) return { status: 'nao_encontrada' };
    const observacao = await this.internalNoteRepo.create(requestId, autorId, texto);
    return { status: 'ok', observacao };
  }

  async listar(requestId: string): Promise<ListarObservacoesResultado> {
    const demanda = await this.requestRepo.findById(requestId);
    if (!demanda) return { status: 'nao_encontrada' };
    const observacoes = await this.internalNoteRepo.list(requestId);
    return { status: 'ok', observacoes };
  }

  async editar(requestId: string, notaId: string, texto: string, usuarioId: string): Promise<EditarObservacaoResultado> {
    const nota = await this.internalNoteRepo.findById(notaId);
    if (!nota || nota.requestId !== requestId) return { status: 'nao_encontrada' };
    if (nota.autorId !== usuarioId) return { status: 'sem_permissao' };
    try {
      const observacao = await this.internalNoteRepo.update(notaId, texto);
      return { status: 'ok', observacao };
    } catch (error) {
      // Corrida entre duas abas/requisições: a nota foi apagada entre o findById acima e
      // o update abaixo. Trata como "não encontrada" em vez de deixar o 500 genérico subir.
      if (isRegistroNaoEncontrado(error)) return { status: 'nao_encontrada' };
      throw error;
    }
  }

  async apagar(requestId: string, notaId: string, usuarioId: string): Promise<ApagarObservacaoResultado> {
    const nota = await this.internalNoteRepo.findById(notaId);
    if (!nota || nota.requestId !== requestId) return { status: 'nao_encontrada' };
    if (nota.autorId !== usuarioId) return { status: 'sem_permissao' };
    try {
      await this.internalNoteRepo.delete(notaId);
      return { status: 'ok' };
    } catch (error) {
      // Mesma corrida do editar: outra requisição já apagou a nota entre o findById e o delete.
      if (isRegistroNaoEncontrado(error)) return { status: 'nao_encontrada' };
      throw error;
    }
  }
}
