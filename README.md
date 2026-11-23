# Painel de produção — base corporativa

Aplicação separada da versão atualmente em operação. Esta base usa **Next.js/React/TypeScript**, **NestJS/TypeScript**, **Prisma** e **PostgreSQL**. A autenticação é delegada ao **Keycloak**, e o acesso vem de roles, grupos e escopos externos do WBS. Não existem cadastro local de senhas, tabela de permissões, aprovação local de usuários ou flag de administrador.

**Estado:** implementação genérica preparada para integração; não publicada nem homologada na infraestrutura WEG. Os modelos oficiais do Developers Portal e os nomes reais de claims/grupos ainda precisam ser fornecidos e conferidos pela TI. Os exemplos deste repositório não representam padrões oficiais WEG.

## Entregas

- Modelo lógico e físico normalizado: organização → unidade → fábrica → área → linha; etapas, equipamentos e turnos pertencem ao contexto correto.
- Lançamentos de produção e paradas, edição com autorização no servidor, paginação e auditoria. Horários reais são opcionais em relatórios antigos; o sistema não inventa horários.
- CAP e metas versionadas por linha, etapa, turno e vigência. O histórico referencia a versão usada no lançamento.
- Evolução conjunta dos turnos, detalhes, indicadores, CSV e projeções de recuperação do atraso com cenários, revisões, ações e custos. Exportação Excel da projeção com gráfico.
- Interface responsiva com dicionários em português, inglês e espanhol e traduções de nomes de etapas e motivos.
- OIDC Authorization Code + PKCE, state, nonce e assinatura do ID token. Tokens ficam cifrados em sessões técnicas no Redis, sem acesso pelo JavaScript do navegador. Redis não administra identidade nem concessões.
- Roles **e** grupos externos são exigidos conjuntamente; o escopo de unidade é validado em cada consulta e alteração. Não há papel administrador implícito. Introspecção de tokens é obrigatória em produção.
- E-mail operacional por SMTP com TLS e fila transacional. Não existe recuperação de senha local. Envio desativado por padrão.
- Dockerfiles, pipeline GitLab e manifestos Kubernetes/Kustomize com ambientes de homologação e produção. A integração com os templates/esteiras oficiais WEG permanece pendente.
- Importador offline dos backups legados: simulação, validação de vínculos, transação, referências idempotentes e verificação de alteração da origem. Dados reais ficam fora do Git.

## Executar localmente

Requer Node.js 22.13+, PostgreSQL 17 e Redis 7.2+ (Redis 8 nos exemplos). Use um realm de desenvolvimento fornecido pela TI; não há login alternativo por senha local.

```sh
npm ci --ignore-scripts
cp .env.example .env
cp config/access-mapping.example.json config/access-mapping.json
```

Preencha o `.env` privado e o mapeamento aprovado pela TI. O arquivo de exemplo tem `grants: []`: nenhum acesso é liberado. Não use o exemplo sintético em produção. Configure PostgreSQL/Redis locais ou suba somente a infraestrutura local:

```sh
LOCAL_DATABASE_PASSWORD='uma-senha-local' docker compose up -d
```

Use a mesma senha na URL do banco. Carregue o `.env` no terminal/processo com a ferramenta adotada pela equipe. O arquivo não é lido nem enviado ao navegador automaticamente. Em PowerShell, configure as variáveis na sessão; não publique o arquivo.

```sh
npm run generate
npm run db:validate
npm run db:deploy
npm run build
npm run dev:api
# Em outro terminal com as mesmas variáveis:
npm run dev:web
```

Abra `http://localhost:3000`. A primeira estrutura é cadastrada pelo administrador autorizado externamente, em **Cadastros**. Não há dados de produção ou usuários reais no repositório.

## Validação

Use **um banco exclusivo para testes** e uma instância Redis de teste. Os testes de banco criam e removem apenas esquemas aleatórios próprios. Os testes OIDC usam um provedor simulado, sem credenciais corporativas.

```sh
npm run generate
npm run build
npm run typecheck:tools
npm test
TEST_DATABASE_URL='postgresql://usuario:senha@localhost:5432/panel_test' npm run test:integration
TEST_REDIS_URL='redis://localhost:6379' npm run test:auth
npx playwright install --with-deps chromium
npm run test:ui
npm audit --omit=dev --audit-level=high
```

Os testes de interface exercitam telas e formulários em 320, 375, 768 e 1440 pixels com dados sintéticos e API simulada; a integração de backend e OIDC é validada separadamente. Isso não substitui aceite em aparelhos e serviços WEG reais.

O teste de integração é ignorado se sua URL não estiver configurada; a CI configura os serviços e executa esses testes. Build/testes genéricos não equivalem à homologação do Keycloak/WBS ou do ambiente WEG.

## Documentação para a TI

- [Modelo lógico, normalização e dicionário](docs/modelo-dados.md)
- [Keycloak, WBS e sessões](docs/keycloak.md)
- [Implantação, GitLab, Docker, Kubernetes e e-mail](docs/implantacao.md)
- [Migração privada e reconciliação](docs/migracao.md)
- [Pendências e critérios de aceite WEG](docs/pendencias-weg.md)

A versão anterior deste repositório permanece no histórico Git e na tag `v1-legacy-baseline`. Sua migração antiga, que mantinha usuários/permissões locais, foi removida da árvore ativa. Não execute migrações dessa tag sobre o novo esquema.
