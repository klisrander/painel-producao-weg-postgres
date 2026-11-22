# Ambiente e operação na WEG

## Infraestrutura

- Node.js >=22.13, ou imagem corporativa de container equivalente.
- PostgreSQL homologado pela TI; testes feitos com PostgreSQL 17 real. Dimensionamento e alta disponibilidade dependem do uso e da infraestrutura aprovada.
- Proxy reverso HTTPS com certificado do domínio escolhido, encaminhando o `Host` original para a porta 3000. O aplicativo usa `APP_ORIGIN` como origem confiável; não confia no usuário fornecido por cabeçalhos do proxy.
- Acesso da aplicação ao PostgreSQL e aos endpoints de discovery/token/JWKS do Keycloak. Acesso de retorno do Keycloak ao endpoint de backchannel logout.
- Catálogos internos e metas-base como arquivos privados, fora do repositório/imagem pública.

`DATABASE_URL` contém a conexão PostgreSQL. Para TLS corporativo, configurar a CA aprovada; `PGSSLROOTCERT` pode apontar para um arquivo PEM legível no servidor. Usar uma URL compatível com verificação de certificado e preservar essa verificação. Não desabilitar validação TLS em produção.

A conta PostgreSQL da aplicação precisa acessar apenas o schema da aplicação. A TI pode separar o usuário de migração, com DDL, do usuário de execução, com DML nas tabelas e uso das sequências. O servidor não aplica migrações automaticamente.

## Domínio e DNS

A TI escolhe o hostname corporativo, emite/instala o certificado e cria o registro A/AAAA ou CNAME correspondente ao proxy/balanceador. O destino desse registro depende da infraestrutura entregue pela WEG. Não há servidor DNS ou IP corporativo presumido neste projeto.

Preencher `APP_ORIGIN` com a origem HTTPS final e registrar exatamente essa origem e seu callback no Keycloak. Atualizar DNS e certificado após homologar a aplicação e a migração dos dados. A zona DNS corporativa é administrada pela WEG; o projeto não faz alterações na Wix ou na hospedagem anterior.

## Operação

- `/api/health` verifica conectividade com o PostgreSQL e retorna somente estado básico.
- Logs de falhas usam caminho/código de erro, sem corpos de login, tokens ou segredos.
- Realizar backups PostgreSQL e testes de restauração conforme política da TI.
- Manter Node.js, PostgreSQL, Keycloak e dependências nas versões corrigidas aprovadas pela empresa.
- Arquivos estáticos usam ETag; HTML e dados privados usam `no-store`.
- Acompanhamentos exigem sessão e autorização de seção; não ficam públicos na internet.
- O código legado de interface ainda utiliza eventos inline permitidos pela CSP. A política bloqueia scripts inline sem nonce e mantém `frame-ancestors 'self'`; a TI deve avaliar seus requisitos corporativos antes da liberação.

A homologação deve incluir navegadores corporativos Windows, celular/tablet, acesso a cada seção, login integrado, expiração, logout, revogação por backchannel e continuidade das exportações/planejamento. Testes locais não equivalem a certificação ou aprovação institucional.
