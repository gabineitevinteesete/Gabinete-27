import { describe, it, expect } from 'vitest';
import { NotificacaoService, LIMITE_LISTA_NOTIFICACOES } from '../../src/services/notificacao.service.js';
import { createFakeNotificationRepo, createFakeUserRepo } from '../helpers/fakes.js';

function usuario(id: string, role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE', ativo = true) {
  return {
    id,
    nome: `Pessoa ${id}`,
    telefone: `+55349999${id.padStart(5, '0')}`,
    role,
    ativo,
    pinDefinido: true,
    pinHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function build() {
  const userRepo = createFakeUserRepo([
    usuario('1', 'CHEFE'),
    usuario('2', 'CHEFE'),
    usuario('3', 'CHEFE', false),
    usuario('4', 'ASSESSOR_RUA'),
    usuario('5', 'ASSESSOR_GABINETE'),
  ]);
  const notificationRepo = createFakeNotificationRepo();
  const service = new NotificacaoService({ notificationRepo, userRepo });
  return { service, notificationRepo };
}

const demanda = { id: 'req-1', codigoInterno: 'GD-2026-0001' };

describe('NotificacaoService', () => {
  describe('demandaCriada', () => {
    it('avisa cada chefe ativo, menos quem criou, e ignora chefes inativos e assessores', async () => {
      const { service, notificationRepo } = build();

      await service.demandaCriada(demanda, '4');

      expect(notificationRepo.criadas.map((c) => c.userId).sort()).toEqual(['1', '2']);
      expect(notificationRepo.criadas[0]).toMatchObject({
        requestId: 'req-1',
        tipo: 'DEMANDA_NOVA',
        mensagem: 'Nova demanda GD-2026-0001 registrada.',
      });
    });

    it('quando o próprio chefe cria a demanda, ele não é avisado', async () => {
      const { service, notificationRepo } = build();

      await service.demandaCriada(demanda, '1');

      expect(notificationRepo.criadas.map((c) => c.userId)).toEqual(['2']);
    });
  });

  describe('demandaReatribuida', () => {
    it('avisa o novo responsável', async () => {
      const { service, notificationRepo } = build();

      await service.demandaReatribuida(demanda, '4', '1');

      expect(notificationRepo.criadas).toEqual([
        { userId: '4', requestId: 'req-1', tipo: 'DEMANDA_REATRIBUIDA', mensagem: 'Você recebeu a demanda GD-2026-0001.' },
      ]);
    });

    it('não avisa quando a pessoa reatribuiu para si mesma', async () => {
      const { service, notificationRepo } = build();

      await service.demandaReatribuida(demanda, '5', '5');

      expect(notificationRepo.criadas).toHaveLength(0);
    });
  });

  describe('statusAlterado', () => {
    it('avisa o responsável com o rótulo do status em português', async () => {
      const { service, notificationRepo } = build();

      await service.statusAlterado({ ...demanda, assessorResponsavelId: '4' }, 'EM_ANDAMENTO', '1');

      expect(notificationRepo.criadas).toEqual([
        {
          userId: '4',
          requestId: 'req-1',
          tipo: 'STATUS_ALTERADO',
          mensagem: 'A demanda GD-2026-0001 passou para "Em andamento".',
        },
      ]);
    });

    it('não avisa quando o próprio responsável mudou o status', async () => {
      const { service, notificationRepo } = build();

      await service.statusAlterado({ ...demanda, assessorResponsavelId: '5' }, 'RECEBIDA', '5');

      expect(notificationRepo.criadas).toHaveLength(0);
    });
  });

  it('o texto dos avisos nunca leva dados pessoais nem o motivo', async () => {
    const { service, notificationRepo } = build();

    await service.demandaCriada(demanda, '4');
    await service.demandaReatribuida(demanda, '4', '1');
    await service.statusAlterado({ ...demanda, assessorResponsavelId: '4' }, 'RECUSADA', '1');

    const textos = notificationRepo.criadas.map((c) => c.mensagem).join(' | ');
    expect(textos).toMatch(/GD-2026-0001/);
    expect(textos).not.toMatch(/\+55|telefone|motivo/i);
  });

  it('listar devolve os avisos da pessoa (mais novos primeiro) com a contagem de não lidos', async () => {
    const { service } = build();
    await service.demandaReatribuida({ id: 'a', codigoInterno: 'GD-1' }, '4', '1');
    await service.demandaReatribuida({ id: 'b', codigoInterno: 'GD-2' }, '4', '1');
    await service.demandaReatribuida({ id: 'c', codigoInterno: 'GD-3' }, '5', '1');

    const { items, naoLidas } = await service.listar('4');

    expect(items.map((i) => i.mensagem)).toEqual(['Você recebeu a demanda GD-2.', 'Você recebeu a demanda GD-1.']);
    expect(naoLidas).toBe(2);
  });

  it('marcarLida e marcarTodasLidas só afetam os avisos da própria pessoa', async () => {
    const { service } = build();
    await service.demandaReatribuida({ id: 'a', codigoInterno: 'GD-1' }, '4', '1');
    await service.demandaReatribuida({ id: 'c', codigoInterno: 'GD-3' }, '5', '1');
    const doQuatro = (await service.listar('4')).items[0]!;
    const doCinco = (await service.listar('5')).items[0]!;

    expect(await service.marcarLida(doCinco.id, '4')).toBe(false);
    expect((await service.listar('5')).naoLidas).toBe(1);
    expect(await service.marcarLida(doQuatro.id, '4')).toBe(true);
    expect((await service.listar('4')).naoLidas).toBe(0);

    await service.marcarTodasLidas('5');
    expect((await service.listar('5')).naoLidas).toBe(0);
  });

  it('a lista é limitada aos 30 avisos mais recentes, mas o contador conta todos os não lidos', async () => {
    const { service } = build();
    for (let i = 0; i < 35; i += 1) {
      await service.demandaReatribuida({ id: `r${i}`, codigoInterno: `GD-${i}` }, '4', '1');
    }

    const { items, naoLidas } = await service.listar('4');

    expect(LIMITE_LISTA_NOTIFICACOES).toBe(30);
    expect(items).toHaveLength(30);
    expect(naoLidas).toBe(35);
    expect(items[0]!.mensagem).toBe('Você recebeu a demanda GD-34.');
  });

  it('avisar os chefes é uma única gravação, não uma por chefe', async () => {
    const { service, notificationRepo } = build();
    let gravacoes = 0;
    const original = notificationRepo.createMany.bind(notificationRepo);
    notificationRepo.createMany = async (dados) => {
      gravacoes += 1;
      return original(dados);
    };

    await service.demandaCriada(demanda, '4');

    expect(gravacoes).toBe(1);
    expect(notificationRepo.criadas).toHaveLength(2);
  });

  it('sem nenhum chefe para avisar não grava nada', async () => {
    const userRepo = createFakeUserRepo([usuario('4', 'ASSESSOR_RUA')]);
    const notificationRepo = createFakeNotificationRepo();
    const service = new NotificacaoService({ notificationRepo, userRepo });

    await service.demandaCriada(demanda, '4');

    expect(notificationRepo.criadas).toHaveLength(0);
  });
});
