# Keycloak, WBS e autenticação corporativa

Esta implementação usa OIDC padrão para Keycloak. **Ainda não foi comparada aos templates privados do WEG Developers Portal**, nem conectada ao realm real. A aprovação final e eventuais ajustes ao padrão oficial dependem da TI.

## Contrato com o provedor

A TI deve fornecer issuer/realm, client ID Web confidencial, segredo no cofre, audience da API, client de introspecção, URLs permitidas e certificado/cadeia corporativa. Registrar:

- Redirect URI exata: `https://DOMINIO_WEG/api/auth/callback`.
- Post logout redirect URI: `https://DOMINIO_WEG/` (mesma origem de `APP_URL`).
- Backchannel logout: `https://DOMINIO_WEG/api/auth/backchannel`, com logout por sessão habilitado.
- Fluxo Authorization Code; PKCE S256 obrigatório; sem fluxo implícito ou password grant na aplicação.
- Scopes utilizados: `openid profile`. E-mail não é necessário para identificar/autenticar usuários.
- Audience específica da API presente no access token. Não aceitar o ID token como credencial da API.

A autenticação Windows/AD/Kerberos é realizada pela federação já existente no Keycloak WEG. A aplicação não coleta senha Windows e não implementa validação própria de AD.

## Concessão pelo WBS

Copiar o contrato vazio de `config/access-mapping.example.json` para arquivo privado ou ConfigMap. `config/access-mapping.synthetic.json` contém apenas exemplos fictícios para demonstrar o formato; **não são nomes de roles/grupos WEG**.

Cada concessão exige o papel em `realm_access.roles` ou `resource_access[clientId].roles` **e todos os grupos** listados na regra. Grupos e escopos de unidade são arrays de strings em claims cujo caminho é configurável. A claim de unidades deve corresponder a `Unit.accessKey`. Não confundir essa claim com o scope OAuth textual.

Para administrar a estrutura global, são necessários simultaneamente:

1. Role e grupos externos aprovados com `organization.manage` e `global: true` no mapeamento de configuração.
2. Escopo externo `*` emitido pelo provedor.

Somente o caractere `*`, somente um grupo, somente uma role ou apenas um registro `Actor` no banco não conferem administração. O arquivo de mapeamento traduz permissões técnicas; não contém lista de usuários. A inclusão/remoção de pessoas em roles/grupos e escopos ocorre no WBS, por chamado, fora desta aplicação.

Permissões disponíveis estão em `packages/contracts/src/index.ts`. A TI deve aprovar a matriz correspondente a operador, analista, gestor, gerente e administrador; os nomes dos cargos não são inferidos de texto enviado pelo navegador. `targets.manage` controla CAP/metas, `plans.manage` controla cenários, e `production.backdate` controla lançamento fora do turno atual. A API valida o escopo novamente, mesmo que alguém modifique a interface.

## Sessões e revogação

- Cookie opaco aleatório, HttpOnly, SameSite=Lax, `__Host-` e Secure em produção; não há tokens em localStorage ou respostas para a interface.
- Redis compartilhado entre réplicas; TLS obrigatório em produção. Tokens são cifrados com AES-256-GCM por chave do cofre.
- Fluxos OIDC duram 10 minutos, usam binding de navegador e são consumidos uma vez. Validação de state, nonce, PKCE e assinatura de ID token é explícita.
- Inatividade de 15 minutos e duração máxima de 8 horas. Atualizações de dados e refresh de tokens não contam como interação. Eventos reais de teclado/toque/clique/rolagem renovam a atividade com frequência limitada.
- Refresh usa lock distribuído no Redis para evitar reutilizar refresh tokens rotacionados em duas réplicas.
- Logout local elimina a sessão e inicia o logout do provedor. Backchannel valida assinatura, issuer, audience, idade, eventos e replay antes de invalidar sessões correspondentes.
- A API verifica assinatura/issuer/audience/expiração do JWT. Em produção também exige introspecção no Keycloak para rejeitar tokens revogados. A TI deve confirmar como mudanças WBS passam a constar nos tokens e o SLA de revogação; introspecção não reescreve claims antigas por si só.
- Nenhum caminho permite login local emergencial. Falhas de Keycloak/Redis bloqueiam o acesso.

`OIDC_ALLOW_HTTP_TEST` só é considerado com `NODE_ENV=test` e issuer em loopback, para testes locais. Produção exige HTTPS. Nunca desative validação de certificado. Caso a WEG use CA privada, instale a cadeia aprovada na imagem/ambiente, por exemplo via `NODE_EXTRA_CA_CERTS`.

## Homologação obrigatória

Testar login Windows, MFA se aplicável, criação/remoção de acesso por chamado, scopes de unidades, operador sem permissão de edição ampla, administrador global, logout local/SSO/backchannel, múltiplas réplicas, inatividade, rotação de segredo e indisponibilidade do provedor. Os testes com provedor simulado não comprovam esses fluxos na WEG.
