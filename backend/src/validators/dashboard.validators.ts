import { z } from 'zod';
import { diasDoPeriodo, MAXIMO_DIAS_RELATORIO } from '../utils/periodo.js';

export const produtividadeQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const relatorioQuerySchema = z
  .object({
    // invalid_type_error cobre parâmetro repetido (?de=a&de=b) ou aninhado (?de[x]=1): vira array/objeto.
    de: z.string({ required_error: 'Informe a data inicial (de).', invalid_type_error: 'Data inicial inválida.' }),
    ate: z.string({ required_error: 'Informe a data final (ate).', invalid_type_error: 'Data final inválida.' }),
  })
  .superRefine((valor, ctx) => {
    const dias = diasDoPeriodo(valor.de, valor.ate);
    if (dias === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Datas inválidas. Use o formato AAAA-MM-DD.' });
    } else if (dias < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A data final não pode ser anterior à inicial.' });
    } else if (dias > MAXIMO_DIAS_RELATORIO) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `O período pode ter no máximo ${MAXIMO_DIAS_RELATORIO} dias.` });
    }
  });
