# Migração privada de dados

Não há produção real, backup, lista de usuários ou credenciais no repositório público. A migração final só deve ocorrer no banco WEG depois de provisionamento e aprovação. A base atual não foi alterada por esta refatoração.

## Preparação

1. Exportar backup completo de cada seção da origem e verificar a restauração/cópia de segurança. Guardar arquivos em diretório privado fora do Git.
2. Criar a hierarquia e os cadastros do destino, por interface administrativa autorizada ou processo controlado de carga da TI.
3. Preparar mapeamento explícito entre os nomes/IDs da origem e os UUIDs do destino. Conferir especialmente áreas, fuso horário, turnos que atravessam meia-noite, equipamentos sem código e motivos.
4. Fornecer metas de base (`baselineTargets`) para os padrões que existiam apenas na configuração da aplicação antiga, fora do backup de alterações. Não deduzir CAP de imagem ou texto de eficiência inconsistente.

Exemplo estrutural, a ser preenchido em `private/mapping.json`:

```json
{
  "source": "origem-unica-da-exportacao",
  "sections": {
    "secao-na-origem": {
      "areaId": "UUID_AREA",
      "timeZone": "America/Sao_Paulo",
      "shifts": { "1": "UUID_TURNO" },
      "lines": { "Nome da linha": "UUID_LINHA" },
      "stages": { "Nome da etapa": "UUID_ETAPA" },
      "equipment": { "ID ou descricao na origem": "UUID_EQUIPAMENTO" },
      "reasons": { "Motivo na origem": "UUID_MOTIVO" }
    }
  },
  "baselineTargets": []
}
```

Entradas de `baselineTargets` seguem o contrato `targetInput` em `apps/api/src/input.ts`, incluindo `expectedRevision: 0`, IDs normalizados e vigência. Substituir todos os placeholders por UUIDs reais; o exemplo não é uma carga pronta.

## Simulação e aplicação

Com dependências de desenvolvimento instaladas, client Prisma gerado e variáveis do destino privado carregadas:

```sh
npm run import:legacy -- --backup private/backup.json --mapping private/mapping.json
# Somente depois de conferir a simulação e o backup do destino:
npm run import:legacy -- --backup private/backup.json --mapping private/mapping.json --apply
```

O backup JSON deve conter arrays `users`, `records`, `goal_changes`, `performance_changes`, `projection_plans`, `projection_revisions` e `audit`, mesmo quando vazios. Um arquivo pode reunir as seções; arquivos separados requerem IDs de origem sem conflito ou namespaces `source` distintos, definidos de forma estável. Nunca trocar `source` só para contornar um erro de reimportação.

A simulação valida formato, contagens, recursos e limites de unidade/área. Se uma meta histórica em peças divergir da CAP e do percentual informados no mesmo registro, a carga é rejeitada com `legacy_target_mismatch` para reconciliação; o importador não corrige essa divergência silenciosamente. A transação real ainda pode rejeitar constraints ou concorrência; simulação não é garantia de sucesso da aplicação. A carga usa lock de migração e uma transação serializável; falhas não deixam uma carga parcial. Para volume elevado, dimensionar a janela/timeout e ensaiar com cópia representativa.

## O que é preservado

- Quantidades, defeitos, data operacional, produção extra e autoria histórica.
- Referência de meta de cada registro como `SNAPSHOT`, separada das versões de configuração.
- Alterações de meta/CAP e suas vigências, além das metas de base fornecidas no mapeamento.
- Paradas com duração informada quando não há horários; horários existentes são convertidos do fuso da unidade para instantes. Se um relatório não informa turno/equipamento, completar um mapeamento explícito após conferência; não inventar horários.
- Planos, dias, ações, custos e revisões disponíveis. Versões ausentes na origem não são inventadas.
- Auditoria de alterações com allowlist de campos operacionais; campos de autenticação são descartados.

`users` é lido apenas para obter o nome do autor histórico. Senhas, e-mails de autenticação, roles, permissões, flags de administrador e sessões da origem **não são importados**. Autores legados usam issuer `urn:legacy:...`, sem conceder acesso ou vincular automaticamente uma conta corporativa.

`LegacyReference` associa IDs de origem e destino com checksum do conteúdo operacional. Repetir a mesma carga não duplica registros. Conteúdo diferente sob o mesmo ID é rejeitado e deve ser reconciliado, nunca sobrescrito silenciosamente.

## Reconciliação e corte

Comparar origem/destino por seção, data, linha, etapa e turno: número de lançamentos, produção total, defeitos, minutos de parada, metas e revisões. Conferir sábados de recuperação e cálculo de Zero Atraso com os responsáveis. Conferir também registros com zero, campos ausentes e relatórios com eficiência/PPM inconsistentes; os indicadores são recalculados a partir dos dados, não copiados de percentuais de planilha.

Além das contagens do importador, a TI deve executar consultas agregadas e aceitar amostras de relatórios. Cargas reais, reconciliação completa e corte de domínio/DNS permanecem pendentes do ambiente e dos arquivos privados. Arquive o backup e os relatórios de conferência conforme a política WEG.
