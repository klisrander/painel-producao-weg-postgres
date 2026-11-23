# Implantação corporativa

Os arquivos deste repositório são uma base executável genérica, **não os templates oficiais WEG**. O GitHub público é a origem de entrega do código; a publicação corporativa deve usar o GitLab e a esteira aprovada pela WEG.

## Componentes

| Serviço                | Porta interna | Dependências                           |
| ---------------------- | ------------: | -------------------------------------- |
| Web Next.js / BFF      |          3000 | API, Keycloak, Redis                   |
| API NestJS             |          4000 | PostgreSQL, Keycloak/JWKS/introspecção |
| Job de migração Prisma |     sem porta | PostgreSQL com papel DDL temporário    |
| Worker de relatórios   |     sem porta | PostgreSQL e serviço SMTP TLS          |

PostgreSQL e Redis de produção devem ser serviços aprovados pela TI. Redis é armazenamento técnico de sessão, não cadastro de usuários ou acessos. Apenas o Web é exposto pelo Ingress; a API permanece interna.

## Imagens Docker

```sh
docker build -f deploy/Dockerfile.api --target runtime -t panel-api:REVISAO .
docker build -f deploy/Dockerfile.api --target migrations -t panel-migrations:REVISAO .
docker build -f deploy/Dockerfile.web -t panel-web:REVISAO .
```

Imagens rodam como usuário não root. A imagem Web usa o output standalone do Next. As variáveis e segredos reais são fornecidos somente em runtime. Não passe segredos ao build. O worker usa a mesma imagem da API, com comando `node apps/api/dist/mail.js`.

## GitLab CI/CD

`.gitlab-ci.yml` prepara verificação, testes com PostgreSQL/Redis, imagens via BuildKit rootless e deploy manual de homologação/produção. A TI precisa validar e, quando exigido, substituir o arquivo pelos includes/templates do Developers Portal. Não foi executado em runner WEG.

Configurar projeto GitLab, registry, runners aprovados, GitLab Agent/contexto Kubernetes, namespace, ambientes protegidos e permissões de deploy. `KUBE_CONTEXT` e `KUBE_NAMESPACE` devem ser variáveis separadas por ambiente. Use identidade de workload/agente, sem kubeconfig público. Credenciais de registry fornecidas pelo GitLab são usadas apenas para o push das imagens.

Antes do deploy real, fixar imagens-base e ferramentas por digest aprovado, executar scans corporativos de dependências/imagens e gerar SBOM/assinaturas conforme a política WEG. O `npm audit` da CI é um controle complementar, não certificação de segurança.

## Kubernetes / Kustomize

`deploy/k8s/base` contém serviços, deployments, probes, limites, execução sem privilégios, raiz somente leitura, Job de migração e CronJob de e-mail inicialmente suspenso. Overlays: `homologation` e `production`.

Ajustar os placeholders antes de aplicar: domínio, classe de Ingress, certificado/TLS, imagens/registry, namespaces, issuer/client/audience e mapeamento de claims. Os arquivos `secret-contract.example.yaml` documentam somente os nomes/chaves esperados; **não estão incluídos no Kustomize**. Criar os segredos por cofre/External Secrets ou mecanismo aprovado, com escopo mínimo para cada serviço.

Renderização para revisão:

```sh
kubectl kustomize deploy/k8s/overlays/homologation > private/homologation-rendered.yaml
```

A esteira aplica configuração, recria o Job técnico de migração, espera a conclusão e só então atualiza as aplicações. Validar o nome de namespace no contexto para evitar aplicar no ambiente errado. Nenhuma publicação WEG foi realizada por este trabalho.

A política incluída limita o tráfego de entrada da API aos pods Web. A TI ainda precisa adicionar a política do ingress-controller e os destinos de saída aprovados para DNS, Keycloak, PostgreSQL, Redis e SMTP; esses endereços não foram inventados. Acrescentar imagePullSecrets, certificados privados, observabilidade e políticas de cluster conforme o ambiente.

## Banco e segredos

- Usar papel DDL separado para migrações. O runtime não deve ser proprietário do esquema nem ter CREATE/DROP/ALTER.
- API: SELECT/INSERT/UPDATE nas relações necessárias; não conceder alteração/exclusão de versões e auditoria. Worker: apenas leitura de destinatários e operação da fila. Definir grants exatos com a TI.
- PostgreSQL com TLS e validação de CA; não usar `rejectUnauthorized:false`. URL e cadeia devem seguir o serviço fornecido pela WEG.
- Redis com `rediss://`, autenticação e ACL limitada ao prefixo da aplicação; política sem eviction inesperada, limites de conexão e alta disponibilidade dimensionados pela TI. Perda de Redis encerra sessões, sem perder produção.
- Chave de sessão de 32 bytes aleatórios em segredo. Sua rotação invalida sessões existentes, que precisarão entrar novamente.
- Backup/PITR, restauração testada, retenção de auditoria, alertas e dimensionamento são responsabilidades do ambiente corporativo; devem ser comprovados antes da entrada em produção.

## E-mail WEG

O adaptador implementado é SMTP com TLS estrito, timeouts, destinatários por unidade e allowlist de domínios. A TI deve confirmar se o serviço oficial é SMTP, Microsoft Graph ou outra API. Caso seja Graph/API, adaptar a função de transporte mantendo a fila; essa integração não é presumida pronta.

Após fornecer host, porta, credenciais/identidade, remetente autorizado e domínios destinatários, habilitar `MAIL_ENABLED=true` e retirar `suspend: true` do CronJob. Homologar com caixa de testes antes de usar destinatários reais.

A fila usa lease e `FOR UPDATE SKIP LOCKED`, tentativas com backoff e falha após cinco tentativas. A entrega é **pelo menos uma vez**: uma interrupção após o SMTP aceitar a mensagem e antes da confirmação no banco pode causar duplicata. Há auditoria de enfileiramento; senhas, tokens e mensagens completas de erro do transporte não são registrados nos logs. Não se trata de e-mail de login/recuperação de senha.

## Entrada em produção e retorno

1. Aprovar modelo e arquitetura; validar padrões oficiais.
2. Provisionar serviços, identidades, segredos, TLS/DNS e controles de rede.
3. Aplicar esquema em banco vazio de homologação.
4. Migrar e reconciliar dados privados conforme `migracao.md`.
5. Executar aceite funcional e de segurança com perfis reais.
6. Planejar janela de corte, backup final e DNS WEG.
7. Publicar revisão imutável aprovada e acompanhar probes/logs/indicadores.

A aplicação atual e seu DNS continuam separados. Não a desative antes da reconciliação e aceite. Um rollback de imagem não desfaz migração de dados; restaurar banco exige procedimento previamente testado. A migração v2 inicial destina-se a esquema vazio, não converte automaticamente as tabelas v1 no mesmo esquema.
