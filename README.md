# Painel de Produção — PostgreSQL e Keycloak

Versão independente do painel de operações industriais, preparada para hospedagem corporativa com **Node.js 22**, **PostgreSQL** e **Keycloak via OpenID Connect**.

O projeto mantém as telas de produção, perturbações, metas por turno, CAP/eficiência, histórico com Excel, permissões por seção, auditoria, evolução dos três turnos e Projeção Zero Atraso. A interface continua adaptada para computador, tablet e celular.

Este repositório foi iniciado com histórico próprio. Não altera o repositório ou a hospedagem anteriores. **Não contém o banco de produção, senhas, contas de funcionários, registros operacionais, arquivos de ambiente ou catálogos internos.** Os catálogos incluídos são exemplos genéricos; a configuração real é montada separadamente.

A aplicação não usa envio de e-mail, senha local ou recuperação de senha. O botão **Entrar com conta WEG** redireciona ao Keycloak. A integração com Windows/Active Directory/Kerberos é realizada pela infraestrutura de identidade da WEG no Keycloak, sem capturar a senha do Windows na aplicação.

## O que falta fornecer pela TI

- Endereço HTTPS da aplicação, para `APP_ORIGIN`.
- Endpoint de issuer do realm, para `OIDC_ISSUER`.
- Client ID e segredo de um cliente OIDC confidencial.
- Conexão PostgreSQL e certificados da autoridade interna, se necessários.
- Identificador `sub` de cada conta que terá acesso; o primeiro administrador é provisionado pela linha de comando.

A versão é configurável e testada, mas a conexão ao Keycloak/Windows e à infraestrutura reais da WEG depende desses dados e de homologação pela TI. Não há valores corporativos presumidos nem autenticação alternativa automática.

## Executar com Node.js

Requisitos: Node.js >=22.13 e PostgreSQL 16 ou 17. A integração foi verificada com PostgreSQL 17.11 real e um provedor OIDC de teste com JWTs assinados. O Keycloak real da WEG ainda precisa ser homologado.

```sh
npm ci
npm run build
```

Copie `.env.example` para `.env` e preencha os valores aprovados pela TI. O segredo do cliente deve ser configurado somente no servidor ou no gerenciador corporativo de segredos.

```sh
node --env-file=.env scripts/migrate.mjs
node --env-file=.env scripts/provision-user.mjs --username usuario.aprovado --subject SUB_FORNECIDO_PELA_TI --name "Administrador" --general-admin
node --env-file=.env dist/server/index.js
```

Para desenvolvimento local com um Keycloak de desenvolvimento: configure URLs HTTP somente em `localhost`/`127.0.0.1`, `NODE_ENV=development` e `ALLOW_HTTP_LOOPBACK=true`. A configuração de produção exige HTTPS.

```sh
npm run dev
```

## Executar com Docker

O `compose.yaml` é uma base de homologação com PostgreSQL e aplicação. Em produção, a TI pode usar um PostgreSQL gerenciado e executar somente a imagem da aplicação.

```sh
docker compose build
docker compose run --rm app node scripts/migrate.mjs
docker compose run --rm app node scripts/provision-user.mjs --username usuario.aprovado --subject SUB_FORNECIDO_PELA_TI --name "Administrador" --general-admin
docker compose up -d
```

O serviço da aplicação publica apenas `127.0.0.1:3000`. A TI deve instalar o proxy reverso e o certificado HTTPS no domínio corporativo, preservando o cabeçalho `Host` correspondente a `APP_ORIGIN`. O PostgreSQL não é exposto na configuração de exemplo. Migrações são explícitas, fora da inicialização do servidor; não existem cargas automáticas de fotos ou contas especiais.

## Documentação de implantação

- [Keycloak, Windows e sessões](docs/keycloak.md)
- [Migração privada dos dados e configuração](docs/migracao.md)
- [Ambiente, domínio, HTTPS e operação](docs/implantacao.md)

## Validação

```sh
npm run build
npm test
```

Os testes de integração exigem um PostgreSQL **descartável**, cujo usuário possa criar schemas. Eles criam/removem somente schemas de teste com nomes aleatórios e não acessam o banco atual do painel.

```sh
TEST_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:5432/banco_de_teste npm run test:integration
```

Os testes cobrem transações e migrações PostgreSQL, consultas JSON, isolamento de seções, registros/auditoria, metas/CAP concorrentes, planejamento/Excel, importação, sessão inativa, login OIDC com PKCE, assinatura/issuer/audience/nonce/expiração, retorno de login de uso único e logout por backchannel. O Dockerfile é fornecido para a TI; a validação local do projeto executou Node.js e PostgreSQL diretamente.

## Recursos e direitos

O código deste repositório público não inclui autorização de uso da marca WEG por terceiros. Marcas, símbolos e recursos visuais pertencem aos respectivos titulares. Licenças de fontes estão em `public/brand`. Este repositório não declara aprovação institucional ou certificação de segurança.
